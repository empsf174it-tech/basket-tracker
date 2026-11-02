import { LM, sideIndices } from './landmarks';
import { visible } from './geometry';
import type { Landmark, Pose, Side } from './types';

/**
 * Shoulder separation / torso length above which the body is too square to the camera.
 * Side-on, the shoulders overlap (ratio near 0); facing the camera the ratio is ~0.7-0.9.
 */
export const SIDE_ON_THRESHOLD = 0.35;
/** Landmarks this close to the image edge (normalised) count as cut off. */
const EDGE = 0.02;

export type FramingIssue = 'head' | 'wrist' | 'ankles';

export interface FrameQuality {
  /** Shoulder separation divided by torso length; null when the torso is not visible. */
  sideOnRatio: number | null;
  /** null = could not be measured this frame. */
  sideOn: boolean | null;
  framing: FramingIssue[];
  /** A rep may only be counted from frames where this is true. */
  countable: boolean;
}

export function assessFrame(
  pose: Pose,
  nearSide: Side,
  hand: Side,
  width: number,
  height: number,
  threshold = SIDE_ON_THRESHOLD,
): FrameQuality {
  const sideOnRatio = shoulderRatio(pose, nearSide, width, height);
  const sideOn = sideOnRatio === null ? null : sideOnRatio <= threshold;
  const framing = framingIssues(pose, nearSide, hand);
  return { sideOnRatio, sideOn, framing, countable: sideOn === true && framing.length === 0 };
}

/**
 * Uses the positions of both shoulders even when the far one has low visibility: MediaPipe still
 * estimates it, and side-on that estimate sits behind the near shoulder, which is what we want.
 */
export function shoulderRatio(
  pose: Pose,
  nearSide: Side,
  width: number,
  height: number,
): number | null {
  const near = sideIndices(nearSide);
  const ls = pose[LM.leftShoulder];
  const rs = pose[LM.rightShoulder];
  const lh = pose[LM.leftHip];
  const rh = pose[LM.rightHip];
  if (!ls || !rs || !lh || !rh) return null;
  if (!visible(pose[near.shoulder]) || !visible(pose[near.hip])) return null;
  const px = (l: Landmark) => ({ x: l.x * width, y: l.y * height });
  const [a, b, c, d] = [ls, rs, lh, rh].map(px) as [
    ReturnType<typeof px>,
    ReturnType<typeof px>,
    ReturnType<typeof px>,
    ReturnType<typeof px>,
  ];
  const sep = Math.hypot(a.x - b.x, a.y - b.y);
  const torso = Math.hypot((a.x + b.x) / 2 - (c.x + d.x) / 2, (a.y + b.y) / 2 - (c.y + d.y) / 2);
  return torso > 0 ? sep / torso : null;
}

export function framingIssues(pose: Pose, nearSide: Side, hand: Side): FramingIssue[] {
  const issues: FramingIssue[] = [];
  const inFrame = (l: Landmark) => l.x > EDGE && l.x < 1 - EDGE && l.y > EDGE && l.y < 1 - EDGE;

  const head = [LM.nose, LM.leftEye, LM.rightEye, LM.leftEar, LM.rightEar]
    .map((i) => pose[i])
    .filter(visible);
  if (!head.some(inFrame) || head.some((l) => l.y <= EDGE)) issues.push('head');

  // A wrist hidden behind the ball is fine; a wrist off the top of the picture is not.
  const wrist = pose[sideIndices(hand).wrist];
  if (wrist && (wrist.y <= EDGE || wrist.x <= EDGE || wrist.x >= 1 - EDGE)) issues.push('wrist');

  const ankle = pose[sideIndices(nearSide).ankle];
  if (!visible(ankle) || !inFrame(ankle)) issues.push('ankles');

  return issues;
}

export function framingMessage(q: FrameQuality | null): string | null {
  if (!q) return null;
  if (q.sideOn === false) return 'Turn more side-on';
  if (q.framing.length) {
    const what = q.framing
      .map((f) => ({ head: 'head', wrist: 'raised hand', ankles: 'feet' })[f])
      .join(' and ');
    return `Step back: ${what} cut off`;
  }
  return null;
}
