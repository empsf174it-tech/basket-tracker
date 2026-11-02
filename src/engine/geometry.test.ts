import { describe, expect, it } from 'vitest';
import {
  angleAt,
  angleFromHorizontal,
  angleFromVertical,
  jointAngles,
  nearestSide,
} from './geometry';
import type { Landmark, Pose } from './types';

const lm = (x: number, y: number, z = 0, visibility = 1): Landmark => ({ x, y, z, visibility });

describe('geometry', () => {
  it('computes interior angles', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleAt({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180);
  });

  it('measures from vertical and horizontal (y down)', () => {
    expect(angleFromVertical({ x: 0, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(0);
    expect(angleFromVertical({ x: 0, y: 10 }, { x: 10, y: 0 })).toBeCloseTo(45);
    expect(angleFromHorizontal({ x: 0, y: 10 }, { x: 10, y: 0 })).toBeCloseTo(45);
    expect(angleFromHorizontal({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45);
  });

  it('computes joint angles and nulls invisible joints', () => {
    const pose: Pose = Array.from({ length: 33 }, () => lm(0, 0, 0, 0));
    // right side: shoulder above hip, straight leg, arm bent 90°
    pose[12] = lm(0.5, 0.3);
    pose[14] = lm(0.5, 0.4);
    pose[16] = lm(0.6, 0.4);
    pose[24] = lm(0.5, 0.6);
    pose[26] = lm(0.5, 0.75);
    pose[28] = lm(0.5, 0.9);
    const a = jointAngles(pose, 'right', 100, 100);
    expect(a.elbow).toBeCloseTo(90);
    expect(a.knee).toBeCloseTo(180);
    expect(a.hip).toBeCloseTo(180);
    expect(a.torsoLean).toBeCloseTo(0);
    expect(jointAngles(pose, 'left', 100, 100).elbow).toBeNull();
  });

  it('picks the nearer, more visible side', () => {
    // odd indices are left-side landmarks in BlazePose for the body chain we score
    const pose: Pose = Array.from({ length: 33 }, (_, i) =>
      i % 2 === 1 ? lm(0, 0, -0.2, 0.95) : lm(0, 0, 0.2, 0.4),
    );
    expect(nearestSide(pose)).toBe('left');
  });
});
