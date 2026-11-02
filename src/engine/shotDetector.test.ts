import { describe, expect, it } from 'vitest';
import { LM } from './landmarks';
import { ShotDetector, type DetectorFrame } from './shotDetector';
import type { Pose } from './types';

const W = 1000;
const H = 1000;
type XY = readonly [number, number];

interface Key {
  t: number;
  hip: XY;
  knee: XY;
  ankle: XY;
  shoulder: XY;
  elbow: XY;
  wrist: XY;
}

const head: XY = [510, 230];

// A side-on right-handed shot, in pixels (y grows downward).
const STAND = {
  hip: [500, 500],
  knee: [500, 700],
  ankle: [500, 900],
  shoulder: [500, 300],
} as const;
const DIP = { hip: [460, 560], knee: [560, 720], ankle: [500, 900], shoulder: [480, 360] } as const;
const ARMS_DOWN = { elbow: [510, 400], wrist: [540, 480] } as const;

function shotKeys(t0: number): Key[] {
  return [
    { t: t0, ...STAND, ...ARMS_DOWN },
    { t: t0 + 600, ...STAND, elbow: [530, 380], wrist: [560, 330] },
    { t: t0 + 1000, ...DIP, elbow: [530, 400], wrist: [570, 350] },
    // set point: elbow bent ~90°, wrist above the head
    { t: t0 + 1300, ...STAND, elbow: [540, 300], wrist: [540, 200] },
    // release: arm straight, feet 40 px off the ground
    {
      t: t0 + 1450,
      hip: [500, 460],
      knee: [500, 660],
      ankle: [500, 860],
      shoulder: [500, 260],
      elbow: [540, 180],
      wrist: [580, 100],
    },
    { t: t0 + 1900, ...STAND, elbow: [540, 220], wrist: [580, 140] },
    { t: t0 + 2400, ...STAND, ...ARMS_DOWN },
    { t: t0 + 3000, ...STAND, ...ARMS_DOWN },
  ];
}

function lerp(a: XY, b: XY, f: number): XY {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function poseFrom(k: Omit<Key, 't'>): Pose {
  const pose: Pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const set = (i: number, [x, y]: XY) => (pose[i] = { x: x / W, y: y / H, z: 0, visibility: 0.99 });
  set(LM.nose, [520, 245]);
  set(LM.rightEye, head);
  set(LM.rightShoulder, k.shoulder);
  set(LM.rightElbow, k.elbow);
  set(LM.rightWrist, k.wrist);
  set(LM.rightHip, k.hip);
  set(LM.rightKnee, k.knee);
  set(LM.rightAnkle, k.ankle);
  return pose;
}

function framesFor(keys: Key[], fps = 30): DetectorFrame[] {
  const out: DetectorFrame[] = [];
  const end = keys[keys.length - 1]!.t;
  for (let t = keys[0]!.t; t <= end; t += 1000 / fps) {
    const i = keys.findIndex((k, j) => j + 1 < keys.length && t >= k.t && t <= keys[j + 1]!.t);
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const f = (t - a.t) / (b.t - a.t);
    const parts = ['hip', 'knee', 'ankle', 'shoulder', 'elbow', 'wrist'] as const;
    const k = Object.fromEntries(parts.map((p) => [p, lerp(a[p], b[p], f)])) as Omit<Key, 't'>;
    out.push({ t, pose: poseFrom(k), side: 'right', width: W, height: H });
  }
  return out;
}

function run(frames: DetectorFrame[]) {
  const d = new ShotDetector({ hand: 'right', heightCm: 180 });
  return frames.map((f) => d.push(f)).filter((s) => s !== null);
}

describe('ShotDetector', () => {
  it('detects one shot and measures it', () => {
    const shots = run(framesFor(shotKeys(0)));
    expect(shots).toHaveLength(1);
    const m = shots[0]!.metrics;
    expect(m.elbowRelease).toBeGreaterThan(175);
    expect(m.elbowSet).toBeGreaterThan(80);
    expect(m.elbowSet).toBeLessThan(110);
    expect(m.kneeDip).toBeLessThan(150);
    expect(m.tempoMs).toBeGreaterThan(300);
    expect(m.tempoMs).toBeLessThan(600);
    expect(m.forearmAngle).toBeCloseTo(63.4, 0);
    // 600 px shoulder-to-ankle chain ≈ 0.779 × 180 cm, so 40 px of lift ≈ 9 cm.
    expect(m.jumpCm).toBeGreaterThan(7);
    expect(m.jumpCm).toBeLessThan(11);
    // Wrist ~795 px above the ankle / 4.28 px per cm + ankle height 7 cm ≈ 193 cm
    // (the test figure has short arms, so this is lower than a real 180 cm player).
    expect(m.releaseHeightCm).toBeGreaterThan(185);
    expect(m.releaseHeightCm).toBeLessThan(200);
    expect(shots[0]!.frames.length).toBeGreaterThan(30);
  });

  it('counts back-to-back shots separately', () => {
    const shots = run([...framesFor(shotKeys(0)), ...framesFor(shotKeys(3100))]);
    expect(shots).toHaveLength(2);
  });

  it('ignores the wrist going up without first being low (not armed)', () => {
    const keys = shotKeys(0).slice(3); // starts with the hand already up
    expect(run(framesFor(keys))).toHaveLength(0);
  });

  it('closes a long follow-through hold once, without double counting', () => {
    const hold: Key[] = [
      ...shotKeys(0).slice(0, 6),
      { t: 4000, ...STAND, elbow: [540, 220], wrist: [580, 140] },
      { t: 4500, ...STAND, ...ARMS_DOWN },
    ];
    expect(run(framesFor(hold))).toHaveLength(1);
  });

  it('rejects arms raised with a bent elbow', () => {
    const keys = shotKeys(0).map((k) =>
      k.wrist[1] < 230 ? { ...k, elbow: [540, 300] as XY, wrist: [540, 200] as XY } : k,
    );
    expect(run(framesFor(keys))).toHaveLength(0);
  });
});
