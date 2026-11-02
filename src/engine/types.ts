/** A single pose landmark in normalised image coordinates (0..1), as produced by MediaPipe. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type Pose = Landmark[];
export type Side = 'left' | 'right';
export type SideSetting = 'auto' | Side;

/** Point in pixel space (y grows downward). */
export interface Point {
  x: number;
  y: number;
}

export interface JointAngles {
  elbow: number | null;
  knee: number | null;
  hip: number | null;
  torsoLean: number | null;
}

/** Throttled snapshot handed to the UI (at most ~10 Hz). */
export interface EngineSnapshot {
  running: boolean;
  poseDetected: boolean;
  side: Side;
  angles: JointAngles;
  fps: number;
  inferenceMs: number;
  delegate: 'GPU' | 'CPU' | null;
}
