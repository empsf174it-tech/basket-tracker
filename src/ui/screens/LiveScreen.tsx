import { useEffect, useRef, useState } from 'react';
import { CameraError, WakeLock, openCamera, stopStream, streamIsLive } from '../../engine/camera';
import { FormPipeline } from '../../engine/pipeline';
import { shotType } from '../../engine/shotTypes';
import type { EngineSnapshot, JointAngles } from '../../engine/types';
import { useApp } from '../../store/app';
import { useSettings } from '../../store/settings';

const BASE = import.meta.env.BASE_URL;

type Status = { kind: 'loading'; msg: string } | { kind: 'ready' } | { kind: 'error'; msg: string };

export function LiveScreen() {
  const settings = useSettings();
  const { source, go } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<FormPipeline | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading', msg: 'Loading pose model…' });
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);

  useEffect(() => {
    pipelineRef.current?.setOptions({
      mirrored: settings.mirrored,
      side: settings.analysisSide,
    });
  }, [settings.mirrored, settings.analysisSide]);

  useEffect(() => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const { mirrored, analysisSide, facing } = useSettings.getState();
    const pipeline = new FormPipeline({ mirrored, side: analysisSide });
    pipelineRef.current = pipeline;
    const wake = new WakeLock();
    let stream: MediaStream | null = null;
    let objectUrl: string | null = null;
    let cancelled = false;

    const unsub = pipeline.onSnapshot(setSnap);

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
        <div className="flex-1 text-center text-lg font-bold">
          {shotType(settings.shotType).label}
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
