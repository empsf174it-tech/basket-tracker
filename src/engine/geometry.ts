import { sideIndices } from './landmarks';
import type { JointAngles, Landmark, Point, Pose, Side, SideSetting } from './types';

export const MIN_VISIBILITY = 0.5;

const RAD2DEG = 180 / Math.PI;

/** Convert a normalised landmark into pixel space so angles are not distorted by aspect ratio. */
export function toPx(lm: Landmark, width: number, height: number): Point {
  return { x: lm.x * width, y: lm.y * height };
}

/** Interior angle ABC in degrees (0..180), with B as the vertex. */
export function angleAt(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * RAD2DEG;
}

/** Angle of segment from->to measured from vertical (0 = straight up/down), in degrees. */
export function angleFromVertical(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = from.y - to.y; // flip so up is positive
  return Math.abs(Math.atan2(dx, dy) * RAD2DEG);
}

/** Angle of segment from->to above horizontal, in degrees (-90..90; positive = pointing up). */
export function angleFromHorizontal(from: Point, to: Point): number {
  const dx = Math.abs(to.x - from.x);
  const dy = from.y - to.y;
  return Math.atan2(dy, dx) * RAD2DEG;
}

export function visible(lm: Landmark | undefined): lm is Landmark {
  return !!lm && lm.visibility >= MIN_VISIBILITY;
}

/**
 * Pick the body side nearest the camera. MediaPipe z is smaller for points closer to the camera;
 * we combine that with visibility of the arm and leg chain on each side.
 */
export function nearestSide(pose: Pose): Side {
  const score = (side: Side) => {
    const s = sideIndices(side);
    let total = 0;
    for (const i of [s.shoulder, s.elbow, s.wrist, s.hip, s.knee, s.ankle]) {
      const lm = pose[i];
      if (lm) total += lm.visibility - lm.z;
    }
    return total;
  };
  return score('left') >= score('right') ? 'left' : 'right';
}

export function resolveSide(pose: Pose, setting: SideSetting): Side {
  return setting === 'auto' ? nearestSide(pose) : setting;
}

/** Joint angles on one side of the body. Any angle whose landmarks are not visible is null. */
export function jointAngles(pose: Pose, side: Side, width: number, height: number): JointAngles {
  const s = sideIndices(side);
  const p = (i: number): Point | null => {
    const lm = pose[i];
    return visible(lm) ? toPx(lm, width, height) : null;
  };
  const shoulder = p(s.shoulder);
  const elbow = p(s.elbow);
  const wrist = p(s.wrist);
  const hip = p(s.hip);
  const knee = p(s.knee);
  const ankle = p(s.ankle);
  const tri = (a: Point | null, b: Point | null, c: Point | null) =>
    a && b && c ? angleAt(a, b, c) : null;
  return {
    elbow: tri(shoulder, elbow, wrist),
    knee: tri(hip, knee, ankle),
    hip: tri(shoulder, hip, knee),
    torsoLean: shoulder && hip ? angleFromVertical(hip, shoulder) : null,
  };
}
