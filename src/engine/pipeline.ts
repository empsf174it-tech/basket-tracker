import { jointAngles, resolveSide } from './geometry';
import { drawOverlay } from './overlay';
import { PoseRunner, type PoseRunnerOptions } from './poseRunner';
import { PoseSmoother } from './smoothing';
import type { EngineSnapshot, JointAngles, Pose, Side, SideSetting } from './types';

export interface PipelineOptions {
  side: SideSetting;
  mirrored: boolean;
}

export interface FrameEvent {
  /** Monotonic timestamp in ms. */
  t: number;
  pose: Pose | null;
  side: Side;
  angles: JointAngles;
  /** Video size in pixels (landmarks are normalised to this). */
  width: number;
  height: number;
}

type Listener<T> = (v: T) => void;

const EMPTY_ANGLES: JointAngles = { elbow: null, knee: null, hip: null, torsoLean: null };
const SNAPSHOT_INTERVAL_MS = 100;

/**
 * Per-frame loop: video -> pose -> smoothing -> angles -> overlay. Runs entirely outside React.
 * The UI subscribes to a throttled snapshot (~10 Hz). Later stages attach the shot detector via
 * onFrame without touching the UI.
 */
export class FormPipeline {
  private runner = new PoseRunner();
  private smoother = new PoseSmoother();
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private running = false;
  private frameHandle: number | null = null;
  private usingVfc = false;
  private lastTs = 0;
  private lastSnapshotAt = 0;
  private fpsWindow: number[] = [];
  private inferenceMs = 0;
  private latest: FrameEvent = {
    t: 0,
    pose: null,
    side: 'right',
    angles: EMPTY_ANGLES,
    width: 0,
    height: 0,
  };
  private snapshotListeners = new Set<Listener<EngineSnapshot>>();
  private frameListeners = new Set<Listener<FrameEvent>>();

  constructor(private opts: PipelineOptions) {}

  init(runnerOpts: PoseRunnerOptions): Promise<void> {
    return this.runner.init(runnerOpts);
  }

  setOptions(patch: Partial<PipelineOptions>): void {
    this.opts = { ...this.opts, ...patch };
  }

  attach(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  onSnapshot(cb: Listener<EngineSnapshot>): () => void {
    this.snapshotListeners.add(cb);
    return () => this.snapshotListeners.delete(cb);
  }

  /** Every processed frame; for engine-side consumers only (never React state). */
  onFrame(cb: Listener<FrameEvent>): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.smoother.reset();
    this.fpsWindow = [];
    this.schedule();
  }

  stop(): void {
    this.running = false;
    this.cancel();
    this.emitSnapshot(true);
  }

  dispose(): void {
    this.stop();
    this.runner.close();
    this.snapshotListeners.clear();
    this.frameListeners.clear();
  }

  private schedule(): void {
    const v = this.video;
    if (!this.running || !v) return;
    this.usingVfc = 'requestVideoFrameCallback' in v;
    this.frameHandle = this.usingVfc
      ? v.requestVideoFrameCallback(() => this.tick())
      : requestAnimationFrame(() => this.tick());
  }

  private cancel(): void {
    if (this.frameHandle === null) return;
    if (this.usingVfc) this.video?.cancelVideoFrameCallback(this.frameHandle);
    else cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private tick(): void {
    if (!this.running) return;
    try {
      this.process();
    } finally {
      this.schedule();
    }
  }

  private process(): void {
    const v = this.video;
    const c = this.canvas;
    if (!v || !c || !this.ctx || v.readyState < 2 || v.videoWidth === 0) return;

    if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }

    let t = performance.now();
    if (t <= this.lastTs) t = this.lastTs + 1; // MediaPipe requires strictly increasing timestamps
    this.lastTs = t;

    const raw = this.runner.detect(v, t);
    this.inferenceMs = performance.now() - t;

    if (!raw) this.smoother.reset();
    const pose = raw ? this.smoother.smooth(raw, t) : null;
    const side = pose ? resolveSide(pose, this.opts.side) : this.latest.side;
    const angles = pose ? jointAngles(pose, side, c.width, c.height) : EMPTY_ANGLES;
    this.latest = { t, pose, side, angles, width: c.width, height: c.height };

    drawOverlay(this.ctx, pose, side, angles, this.opts.mirrored);
    for (const cb of this.frameListeners) cb(this.latest);

    this.fpsWindow.push(t);
    while (this.fpsWindow.length && this.fpsWindow[0]! < t - 1000) this.fpsWindow.shift();
    this.emitSnapshot(false);
  }

  private emitSnapshot(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
    this.lastSnapshotAt = now;
    const snap: EngineSnapshot = {
      running: this.running,
      poseDetected: !!this.latest.pose,
      side: this.latest.side,
      angles: this.latest.angles,
      fps: this.fpsWindow.length,
      inferenceMs: this.inferenceMs,
      delegate: this.runner.delegate,
    };
    for (const cb of this.snapshotListeners) cb(snap);
  }
}
