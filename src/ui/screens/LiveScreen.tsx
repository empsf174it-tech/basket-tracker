import { useEffect, useRef, useState } from 'react';
import { SessionRecorder } from '../../db/repo';
import { CameraError, WakeLock, openCamera, stopStream, streamIsLive } from '../../engine/camera';
import { formatMetric, type MetricKey, type ShotMetrics } from '../../engine/metrics';
import { FormPipeline } from '../../engine/pipeline';
import { ShotDetector } from '../../engine/shotDetector';
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
    const { mirrored, analysisSide, facing, hand, heightCm } = useSettings.getState();
    const pipeline = new FormPipeline({ mirrored, side: analysisSide });
    pipelineRef.current = pipeline;
    const wake = new WakeLock();
    let stream: MediaStream | null = null;
    let objectUrl: string | null = null;
    let cancelled = false;

    const detector = new ShotDetector({ hand, heightCm });
    const recorder = new SessionRecorder({ hand, heightCm, source: source.kind });

    const unsub = pipeline.onSnapshot(setSnap);
    const unsubFrames = pipeline.onFrame((ev) => {
      const shot = detector.push(ev);
      if (!shot) return;
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

    const startCamera = async () => {
      stream = await openCamera(facing);
      if (cancelled) return stopStream(stream);
      video.srcObject = stream;
      await video.play();
    };

    const run = async () => {
      try {
        await pipeline.init({
          wasmBaseUrl: `${BASE}mediapipe/wasm`,
          modelUrl: `${BASE}mediapipe/pose_landmarker_lite.task`,
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
  }, [source]);

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

        {status.kind === 'ready' && snap && !snap.poseDetected && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-lg">
            Step into frame, side-on
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
            {snap.fps} fps · {snap.inferenceMs.toFixed(0)} ms · {snap.delegate ?? '–'} · {snap.side}
          </div>
        )}
      </div>

      <AngleTiles angles={snap?.angles ?? null} />
    </main>
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
