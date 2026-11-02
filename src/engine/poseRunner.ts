import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Pose } from './types';

/** PoseLandmarker model variant: lite is fastest, heavy is most accurate. */
export type ModelQuality = 'lite' | 'full' | 'heavy';

export const MODEL_QUALITIES: readonly { id: ModelQuality; label: string }[] = [
  { id: 'lite', label: 'Speed' },
  { id: 'full', label: 'Balanced' },
  { id: 'heavy', label: 'Accurate' },
];

export function modelFile(q: ModelQuality): string {
  return `pose_landmarker_${q}.task`;
}

export interface PoseRunnerOptions {
  /** URL of the folder containing the MediaPipe wasm files. */
  wasmBaseUrl: string;
  /** URL of the pose_landmarker .task model. */
  modelUrl: string;
}

/**
 * Thin wrapper around MediaPipe PoseLandmarker. Kept minimal (init / detect / close) so it can be
 * moved behind a Web Worker message boundary later without changing callers.
 */
export class PoseRunner {
  private landmarker: PoseLandmarker | null = null;
  delegate: 'GPU' | 'CPU' | null = null;

  async init(opts: PoseRunnerOptions): Promise<void> {
    if (this.landmarker) return;
    const fileset = await FilesetResolver.forVisionTasks(opts.wasmBaseUrl);
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: opts.modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      this.landmarker = await make('GPU');
      this.delegate = 'GPU';
    } catch {
      this.landmarker = await make('CPU');
      this.delegate = 'CPU';
    }
  }

  /** @param timestampMs must be strictly increasing across calls */
  detect(source: TexImageSource, timestampMs: number): Pose | null {
    if (!this.landmarker) return null;
    const res = this.landmarker.detectForVideo(source, timestampMs);
    const lms = res.landmarks[0];
    if (!lms) return null;
    return lms.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 }));
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
