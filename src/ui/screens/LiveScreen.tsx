import { useEffect, useRef, useState } from 'react';
import { SessionRecorder } from '../../db/repo';
import {
  CameraError,
  WakeLock,
  cameraInfo,
  openCamera,
  stopStream,
  streamIsLive,
  type CameraInfo,
} from '../../engine/camera';
import { formatMetric, type MetricKey, type ShotMetrics } from '../../engine/metrics';
import { FormPipeline } from '../../engine/pipeline';
import { MODEL_QUALITIES, modelFile, type ModelQuality } from '../../engine/poseRunner';
import { framingMessage } from '../../engine/quality';
import { ShotDetector, type RejectReason } from '../../engine/shotDetector';
import { SHOT_TYPES, type ShotTypeId } from '../../engine/shotTypes';
import type { EngineSnapshot, JointAngles } from '../../engine/types';
import { useApp } from '../../store/app';
import { useSettings } from '../../store/settings';
import { Segmented } from '../components/Segmented';

const BASE = import.meta.env.BASE_URL;

type Status = { kind: 'loading'; msg: string } | { kind: 'ready' } | { kind: 'error'; msg: string };

interface LastShot {
  number: number;
  shotType: ShotTypeId;
  metrics: ShotMetrics;
}

const CARD_METRICS: MetricKey[] = ['elbowRelease', 'kneeDip', 'releaseHeightCm', 'tempoMs'];

/** Suggest a lighter model after the processed frame rate stays below this for SLOW_FOR_MS. */
const MIN_FPS = 20;
const SLOW_FOR_MS = 5000;

const REJECT_MSG: Record<RejectReason, string> = {
  quality: 'Not counted: turn side-on and keep your whole body in frame',
  partial: 'Not counted: arm did not fully extend',
};

function lighter(m: ModelQuality): ModelQuality | null {
  return m === 'heavy' ? 'full' : m === 'full' ? 'lite' : null;
}

export function LiveScreen() {
  const settings = useSettings();
  const { source, go } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<FormPipeline | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading', msg: 'Loading pose model…' });
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [lastShot, setLastShot] = useState<LastShot | null>(null);
  const [fresh, setFresh] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cam, setCam] = useState<CameraInfo | null>(null);
  const [slowSuggest, setSlowSuggest] = useState<ModelQuality | null>(null);
  const slowSince = useRef<number | null>(null);
  const slowDismissed = useRef(false);

  // Rejection notices disappear after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(id);
  }, [notice]);

  // Auto-suggest a lighter model if the frame rate stays low.
  useEffect(() => {
    if (!snap?.running || source.kind !== 'camera' || slowDismissed.current) return;
    const next = lighter(settings.model);
    if (!next || snap.fps >= MIN_FPS) {
      slowSince.current = null;
      return;
    }
    const now = performance.now();
    slowSince.current ??= now;
    if (now - slowSince.current >= SLOW_FOR_MS) setSlowSuggest(next);
  }, [snap, settings.model, source.kind]);

  // Briefly highlight the card when a new shot lands.
  useEffect(() => {
    if (!lastShot) return;
    setFresh(true);
    const id = setTimeout(() => setFresh(false), 1500);
    return () => clearTimeout(id);
  }, [lastShot]);

  useEffect(() => {
    pipelineRef.current?.setOptions({
      mirrored: settings.mirrored,
      side: settings.analysisSide,
    });
  }, [settings.mirrored, settings.analysisSide]);

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const { mirrored, analysisSide, facing, hand, heightCm, model } = useSettings.getState();
    const pipeline = new FormPipeline({ mirrored, side: analysisSide, hand });
    setSlowSuggest(null);
    slowSince.current = null;
    pipelineRef.current = pipeline;
    const wake = new WakeLock();
    let stream: MediaStream | null = null;
    let objectUrl: string | null = null;
    let cancelled = false;

    const detector = new ShotDetector({ hand, heightCm });
    const recorder = new SessionRecorder({ hand, heightCm, source: source.kind });

    const unsub = pipeline.onSnapshot(setSnap);
    const unsubFrames = pipeline.onFrame((ev) => {
      const res = detector.push(ev);
      if (!res) return;
      if (res.kind === 'rejected') {
        setNotice(REJECT_MSG[res.reason]);
        return;
      }
      const { shot } = res;
      const type = useSettings.getState().shotType;
      recorder
        .save(shot, type)
        .then((saved) => {
          if (cancelled) return;
          setSaveError(null);
          setLastShot({ number: saved.number, shotType: type, metrics: shot.metrics });
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setSaveError(`Shot not saved: ${e instanceof Error ? e.message : String(e)}`);
        });
    });

    const onResize = () => setCam(cameraInfo(stream, video));
    video.addEventListener('resize', onResize);

    const startCamera = async () => {
      stream = await openCamera(facing);
      if (cancelled) return stopStream(stream);
      video.srcObject = stream;
      await video.play();
    };

    const run = async () => {
      try {
        if (model === 'heavy')
          setStatus({ kind: 'loading', msg: 'Loading accurate model (first time ~31 MB)…' });
        await pipeline.init({
          wasmBaseUrl: `${BASE}mediapipe/wasm`,
          modelUrl: `${BASE}mediapipe/${modelFile(model)}`,
        });
        if (cancelled) return;
        setStatus({ kind: 'loading', msg: 'Starting camera…' });
        if (source.kind === 'camera') {
          await startCamera();
        } else {
          objectUrl = URL.createObjectURL(source.file);
          video.src = objectUrl;
          video.loop = true;
          await video.play();
        }
        if (cancelled) return;
        pipeline.attach(video, canvas);
        pipeline.start();
        onResize();
        await wake.acquire();
        setStatus({ kind: 'ready' });
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof CameraError
            ? e.message
            : `Could not start: ${e instanceof Error ? e.message : String(e)}`;
        setStatus({ kind: 'error', msg });
      }
    };

    const onVisibility = async () => {
      if (document.hidden) {
        pipeline.stop();
        detector.reset();
        if (source.kind === 'camera') {
          stopStream(stream);
          stream = null;
        } else video.pause();
        return;
      }
      try {
        if (source.kind === 'camera' && !streamIsLive(stream)) await startCamera();
        else if (source.kind === 'file') await video.play();
        pipeline.start();
        await wake.acquire();
      } catch (e) {
        setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    void run();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('resize', onResize);
      unsub();
      unsubFrames();
      pipeline.dispose();
      pipelineRef.current = null;
      stopStream(stream);
      video.srcObject = null;
      video.removeAttribute('src');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      void wake.release();
    };
  }, [source, settings.model]);

  const flip = settings.mirrored ? '-scale-x-100' : '';

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-2 p-2">
        <button className="btn-ghost" onClick={() => go('setup')} aria-label="Back to setup">
          ← Setup
        </button>
        <div className="flex-1">
          <Segmented<ShotTypeId>
            label="Shot type"
            value={settings.shotType}
            options={SHOT_TYPES.map((t) => ({ value: t.id, label: t.id }))}
            onChange={(shotType) => settings.set({ shotType })}
          />
        </div>
        <button
          className="btn-ghost"
          aria-pressed={settings.showFps}
          onClick={() => settings.set({ showFps: !settings.showFps })}
        >
          FPS
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-contain ${flip}`}
        />
        <canvas
          ref={canvasRef}
          aria-label="Pose skeleton overlay"
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${flip}`}
        />

        {status.kind !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center">
            <p role="status" className="text-xl">
              {status.msg}
            </p>
            {status.kind === 'error' && (
              <button className="btn-primary" onClick={() => go('setup')}>
                Back
              </button>
            )}
          </div>
        )}

        {status.kind === 'ready' && snap && (
          <QualityBanner
            message={snap.poseDetected ? framingMessage(snap.quality) : 'Step into frame, side-on'}
          />
        )}

        {notice && (
          <div
            role="status"
            className="absolute inset-x-2 top-36 rounded-xl bg-black/85 p-3 text-center text-lg"
          >
            {notice}
          </div>
        )}

        {slowSuggest && (
          <div className="absolute inset-x-2 top-36 flex items-center gap-2 rounded-xl bg-black/90 p-3">
            <span className="flex-1">
              Only {snap?.fps ?? '?'} fps. Switch to{' '}
              {MODEL_QUALITIES.find((m) => m.id === slowSuggest)!.label} for smoother tracking?
            </span>
            <button className="btn-primary" onClick={() => settings.set({ model: slowSuggest })}>
              Switch
            </button>
            <button
              className="btn-ghost"
              aria-label="Keep current model"
              onClick={() => {
                slowDismissed.current = true;
                setSlowSuggest(null);
              }}
            >
              ✕
            </button>
          </div>
        )}

        {status.kind === 'ready' && (
          <div
            className="absolute left-2 top-2 rounded-xl bg-black/75 px-3 py-1 text-center"
            aria-live="polite"
          >
            <div className="text-xs uppercase text-white/60">Shots</div>
            <div className="text-3xl font-bold tabular-nums">{lastShot?.number ?? 0}</div>
          </div>
        )}

        {lastShot && (
          <div
            className={`absolute inset-x-2 bottom-2 rounded-2xl bg-black/80 p-3 transition ${
              fresh ? 'ring-4 ring-accent' : 'ring-0'
            }`}
          >
            <div className="mb-1 flex items-center justify-between text-sm text-white/70">
              <span>
                Shot {lastShot.number} · {lastShot.shotType}
              </span>
              <span className="text-accent">✓ Saved</span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {CARD_METRICS.map((k) => (
                <div key={k}>
                  <div className="text-xs uppercase text-white/60">{CARD_LABEL[k]}</div>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatMetric(k, lastShot.metrics[k])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="absolute inset-x-2 top-20 rounded-xl bg-red-700/90 p-3 text-center"
          >
            {saveError}
          </div>
        )}

        {settings.showFps && snap && (
          <div className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 font-mono text-sm">
            <div>
              {snap.fps} fps · {snap.inferenceMs.toFixed(0)} ms · {snap.delegate ?? '–'} ·{' '}
              {snap.side}
            </div>
            <div>
              {cam
                ? `cam ${cam.width}×${cam.height}${cam.frameRate ? ` @ ${cam.frameRate}` : ''}`
                : 'cam –'}{' '}
              · {MODEL_QUALITIES.find((m) => m.id === settings.model)!.label}
            </div>
            {snap.quality?.sideOnRatio != null && (
              <div>side-on {snap.quality.sideOnRatio.toFixed(2)}</div>
            )}
          </div>
        )}
      </div>

      <AngleTiles angles={snap?.angles ?? null} />
    </main>
  );
}

function QualityBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="absolute inset-x-2 top-20 rounded-xl bg-amber-500 px-4 py-2 text-center text-xl font-bold text-black"
    >
      {message}
    </div>
  );
}

const CARD_LABEL: Partial<Record<MetricKey, string>> = {
  elbowRelease: 'Elbow',
  kneeDip: 'Knee dip',
  releaseHeightCm: 'Release',
  tempoMs: 'Tempo',
};

function AngleTiles({ angles }: { angles: JointAngles | null }) {
  const items: [string, number | null | undefined][] = [
    ['Elbow', angles?.elbow],
    ['Knee', angles?.knee],
    ['Hip', angles?.hip],
    ['Torso lean', angles?.torsoLean],
  ];
  return (
    <div className="grid grid-cols-4 gap-1 p-2" aria-live="off">
      {items.map(([label, v]) => (
        <div key={label} className="rounded-xl bg-panel p-2 text-center">
          <div className="text-xs uppercase text-white/60">{label}</div>
          <div className="text-2xl font-bold tabular-nums">
            {v === null || v === undefined ? '–' : `${Math.round(v)}°`}
          </div>
        </div>
      ))}
    </div>
  );
}
