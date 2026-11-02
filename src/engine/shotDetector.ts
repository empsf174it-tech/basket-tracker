import { angleAt, angleFromHorizontal, angleFromVertical, toPx, visible } from './geometry';
import { LM, sideIndices } from './landmarks';
import type { ShotMetrics } from './metrics';
import type { Point, Pose, Side } from './types';

export interface DetectorFrame {
  /** Monotonic timestamp in ms. */
  t: number;
  pose: Pose | null;
  /** Body side nearest the camera (used for legs and torso). */
  side: Side;
  width: number;
  height: number;
}

export interface DetectorConfig {
  /** Shooting hand (used for the arm). */
  hand: Side;
  heightCm: number;
}

export interface DetectedShot {
  tStart: number;
  tRelease: number;
  tEnd: number;
  metrics: ShotMetrics;
  /** Poses from the dip to the end of the follow-through; t is relative to release (ms). */
  frames: { t: number; pose: Pose }[];
}

const BUFFER_MS = 4000;
/** How far before release to look for the dip. */
const LOOKBACK_MS = 2000;
/** Max time the wrist may stay above the head before the shot is closed (long follow-through). */
const MAX_RISE_MS = 1500;
/** Arm must extend at least this much, otherwise it was not a shot (e.g. a stretch or a catch). */
const MIN_RELEASE_ELBOW = 130;
/** Release = first frame within this many degrees of the fullest elbow extension. */
const RELEASE_TOLERANCE_DEG = 3;

// Drillis & Contini body proportions (fraction of standing height).
const SHOULDER_TO_ANKLE = 0.818 - 0.039;
const ANKLE_HEIGHT = 0.039;

interface Sample {
  t: number;
  pose: Pose;
  side: Side;
  w: number;
  h: number;
}

/**
 * Detects shots from a stream of poses with a small state machine:
 *   armed   – shooting wrist seen below the shoulder (ball at waist/chest)
 *   rising  – wrist goes above the head
 *   done    – wrist comes back below the shoulder, or the follow-through times out
 * The finished window is then measured. A new shot needs the wrist below the shoulder again.
 */
export class ShotDetector {
  private buf: Sample[] = [];
  private armed = false;
  private riseStart: number | null = null;

  constructor(private cfg: DetectorConfig) {}

  setConfig(patch: Partial<DetectorConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  reset(): void {
    this.buf = [];
    this.armed = false;
    this.riseStart = null;
  }

  push(f: DetectorFrame): DetectedShot | null {
    const timedOut = this.riseStart !== null && f.t - this.riseStart > MAX_RISE_MS;
    if (!f.pose) return timedOut ? this.finish(false) : null;

    const s: Sample = { t: f.t, pose: f.pose, side: f.side, w: f.width, h: f.height };
    this.buf.push(s);
    while (this.buf.length && this.buf[0]!.t < f.t - BUFFER_MS) this.buf.shift();

    const wrist = shootingWrist(s, this.cfg.hand);
    const shoulder =
      point(s, sideIndices(this.cfg.hand).shoulder) ?? point(s, sideIndices(s.side).shoulder);
    const head = headTop(s);
    if (!wrist || !shoulder || !head) return timedOut ? this.finish(false) : null;

    const belowShoulder = wrist.y > shoulder.y;
    const aboveHead = wrist.y < head.y;

    if (this.riseStart === null) {
      if (belowShoulder) this.armed = true;
      else if (aboveHead && this.armed) this.riseStart = f.t;
      return null;
    }
    if (belowShoulder || timedOut) return this.finish(belowShoulder);
    return null;
  }

  private finish(nowBelowShoulder: boolean): DetectedShot | null {
    const start = this.riseStart!;
    this.riseStart = null;
    this.armed = nowBelowShoulder;
    const end = this.buf.length ? this.buf[this.buf.length - 1]!.t : start;
    return analyseShot(this.buf, start, end, this.cfg);
  }
}

/** Measures one shot from the buffered samples. Returns null if it does not look like a shot. */
export function analyseShot(
  buf: readonly Sample[],
  tStart: number,
  tEnd: number,
  cfg: DetectorConfig,
): DetectedShot | null {
  const H = cfg.heightCm;
  const arm = sideIndices(cfg.hand);

  // Release: first frame near the fullest elbow extension while the hand is up.
  const up = buf.filter((s) => s.t >= tStart - 300 && s.t <= tEnd);
  const elbows = up.map((s) => ({ s, a: tri(s, arm.shoulder, arm.elbow, arm.wrist) }));
  const maxElbow = Math.max(...elbows.map((e) => e.a ?? -Infinity));
  if (!Number.isFinite(maxElbow) || maxElbow < MIN_RELEASE_ELBOW) return null;
  const release = elbows.find((e) => e.a !== null && e.a >= maxElbow - RELEASE_TOLERANCE_DEG)!;
  const r = release.s;
  const tRelease = r.t;

  // Dip: deepest knee bend in the lookback window before release.
  const pre = buf.filter((s) => s.t >= tRelease - LOOKBACK_MS && s.t <= tRelease);
  let kneeDip: number | null = null;
  let tDip: number | null = null;
  let hipDip: number | null = null;
  for (const s of pre) {
    const leg = sideIndices(s.side);
    const k = tri(s, leg.hip, leg.knee, leg.ankle);
    if (k !== null && (kneeDip === null || k < kneeDip)) {
      kneeDip = k;
      tDip = s.t;
    }
    const hp = tri(s, leg.shoulder, leg.hip, leg.knee);
    if (hp !== null && (hipDip === null || hp < hipDip)) hipDip = hp;
  }

  // Set point: most bent elbow between the dip and release.
  let elbowSet: number | null = null;
  for (const s of pre) {
    if (tDip !== null && s.t < tDip) continue;
    const e = tri(s, arm.shoulder, arm.elbow, arm.wrist);
    if (e !== null && (elbowSet === null || e < elbowSet)) elbowSet = e;
  }

  const rLeg = sideIndices(r.side);
  const rShoulder = point(r, rLeg.shoulder);
  const rHip = point(r, rLeg.hip);
  const torsoLean = rShoulder && rHip ? angleFromVertical(rHip, rShoulder) : null;
  const rElbow = point(r, arm.elbow);
  const rWrist = point(r, arm.wrist);
  const forearmAngle = rElbow && rWrist ? angleFromHorizontal(rElbow, rWrist) : null;

  // Scale: shoulder-hip-knee-ankle segment lengths do not change when the body bends.
  const scales: number[] = [];
  let groundY: number | null = null;
  for (const s of pre) {
    const leg = sideIndices(s.side);
    const [sh, hp, kn, an] = [leg.shoulder, leg.hip, leg.knee, leg.ankle].map((i) => point(s, i));
    if (sh && hp && kn && an)
      scales.push((dist(sh, hp) + dist(hp, kn) + dist(kn, an)) / (SHOULDER_TO_ANKLE * H));
    if (an && (groundY === null || an.y > groundY)) groundY = an.y;
  }
  const pxPerCm = median(scales);
  const rAnkle = point(r, rLeg.ankle);
  const releaseHeightCm =
    pxPerCm && groundY !== null && rWrist
      ? (groundY - rWrist.y) / pxPerCm + ANKLE_HEIGHT * H
      : null;
  const jumpCm =
    pxPerCm && groundY !== null && rAnkle ? Math.max(0, (groundY - rAnkle.y) / pxPerCm) : null;

  const frames = buf
    .filter((s) => s.t >= tRelease - LOOKBACK_MS && s.t <= tEnd)
    .map((s) => ({ t: Math.round(s.t - tRelease), pose: compactPose(s.pose) }));

  return {
    tStart,
    tRelease,
    tEnd,
    frames,
    metrics: {
      elbowRelease: round1(maxElbow),
      elbowSet: round1(elbowSet),
      kneeDip: round1(kneeDip),
      hipDip: round1(hipDip),
      torsoLean: round1(torsoLean),
      forearmAngle: round1(forearmAngle),
      releaseHeightCm: round1(releaseHeightCm),
      jumpCm: round1(jumpCm),
      tempoMs: tDip !== null ? Math.round(tRelease - tDip) : null,
    },
  };
}

function point(s: Sample, i: number): Point | null {
  const lm = s.pose[i];
  return visible(lm) ? toPx(lm, s.w, s.h) : null;
}

function tri(s: Sample, a: number, b: number, c: number): number | null {
  const pa = point(s, a);
  const pb = point(s, b);
  const pc = point(s, c);
  if (!pa || !pb || !pc) return null;
  const v = angleAt(pa, pb, pc);
  return Number.isNaN(v) ? null : v;
}

/** Shooting-hand wrist, falling back to the other wrist if it is hidden behind the body. */
function shootingWrist(s: Sample, hand: Side): Point | null {
  return (
    point(s, sideIndices(hand).wrist) ??
    point(s, sideIndices(hand === 'left' ? 'right' : 'left').wrist)
  );
}

/** Highest visible point of the face (smallest y). */
function headTop(s: Sample): Point | null {
  let best: Point | null = null;
  for (const i of [LM.nose, LM.leftEye, LM.rightEye, LM.leftEar, LM.rightEar]) {
    const p = point(s, i);
    if (p && (!best || p.y < best.y)) best = p;
  }
  return best;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function round1(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

/** Rounds landmarks so stored frames stay small (~4 decimals is sub-pixel at 720p). */
function compactPose(p: Pose): Pose {
  const r = (v: number, d: number) => Math.round(v * d) / d;
  return p.map((l) => ({
    x: r(l.x, 1e4),
    y: r(l.y, 1e4),
    z: r(l.z, 1e4),
    visibility: r(l.visibility, 100),
  }));
}
