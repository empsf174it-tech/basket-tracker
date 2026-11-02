import type { Side } from './types';

/** MediaPipe BlazePose landmark indices. */
export const LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export interface SideIndices {
  eye: number;
  ear: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  hip: number;
  knee: number;
  ankle: number;
  heel: number;
  foot: number;
}

export function sideIndices(side: Side): SideIndices {
  return side === 'left'
    ? {
        eye: LM.leftEye,
        ear: LM.leftEar,
        shoulder: LM.leftShoulder,
        elbow: LM.leftElbow,
        wrist: LM.leftWrist,
        hip: LM.leftHip,
        knee: LM.leftKnee,
        ankle: LM.leftAnkle,
        heel: LM.leftHeel,
        foot: LM.leftFootIndex,
      }
    : {
        eye: LM.rightEye,
        ear: LM.rightEar,
        shoulder: LM.rightShoulder,
        elbow: LM.rightElbow,
        wrist: LM.rightWrist,
        hip: LM.rightHip,
        knee: LM.rightKnee,
        ankle: LM.rightAnkle,
        heel: LM.rightHeel,
        foot: LM.rightFootIndex,
      };
}

/** Skeleton edges drawn on the overlay (body only, no face). */
export const SKELETON_EDGES: ReadonlyArray<readonly [number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
];
