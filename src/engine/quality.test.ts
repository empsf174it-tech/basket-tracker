import { describe, expect, it } from 'vitest';
import { LM } from './landmarks';
import { assessFrame, framingMessage } from './quality';
import type { Pose } from './types';

type XY = readonly [number, number];

function pose(points: Partial<Record<keyof typeof LM, XY>>, visibility = 0.99): Pose {
  const p: Pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  for (const [name, [x, y]] of Object.entries(points) as [keyof typeof LM, XY][]) {
    p[LM[name]] = { x, y, z: 0, visibility };
  }
  return p;
}

// Side-on body in a portrait frame (normalised coords).
const SIDE_ON = {
  nose: [0.52, 0.2],
  rightEye: [0.51, 0.18],
  rightShoulder: [0.5, 0.3],
  leftShoulder: [0.49, 0.3],
  rightHip: [0.5, 0.55],
  leftHip: [0.49, 0.55],
  rightWrist: [0.55, 0.45],
  rightAnkle: [0.5, 0.92],
} as const;

describe('assessFrame', () => {
  it('accepts a side-on, fully framed body', () => {
    const q = assessFrame(pose(SIDE_ON), 'right', 'right', 720, 1280);
    expect(q.sideOn).toBe(true);
    expect(q.framing).toEqual([]);
    expect(q.countable).toBe(true);
    expect(framingMessage(q)).toBeNull();
  });

  it('flags a body facing the camera', () => {
    // Shoulders 0.2 of the width apart vs a 0.25-height torso -> ratio ~0.45 at 720x1280.
    const q = assessFrame(
      pose({
        ...SIDE_ON,
        leftShoulder: [0.3, 0.3],
        rightShoulder: [0.5, 0.3],
        leftHip: [0.35, 0.55],
      }),
      'right',
      'right',
      720,
      1280,
    );
    expect(q.sideOnRatio!).toBeGreaterThan(0.35);
    expect(q.sideOn).toBe(false);
    expect(q.countable).toBe(false);
    expect(framingMessage(q)).toBe('Turn more side-on');
  });

  it('flags a raised wrist off the top of the frame and cut-off feet', () => {
    const q = assessFrame(
      pose({ ...SIDE_ON, rightWrist: [0.55, -0.03], rightAnkle: [0.5, 0.995] }),
      'right',
      'right',
      720,
      1280,
    );
    expect(q.framing).toEqual(['wrist', 'ankles']);
    expect(q.countable).toBe(false);
    expect(framingMessage(q)).toBe('Step back: raised hand and feet cut off');
  });

  it('does not flag a wrist that is only hidden behind the ball', () => {
    const p = pose(SIDE_ON);
    p[LM.rightWrist] = { x: 0.55, y: 0.45, z: 0, visibility: 0.1 };
    expect(assessFrame(p, 'right', 'right', 720, 1280).framing).toEqual([]);
  });

  it('cannot judge side-on when the near torso is not visible', () => {
    const p = pose(SIDE_ON);
    p[LM.rightHip] = { ...p[LM.rightHip]!, visibility: 0.1 };
    const q = assessFrame(p, 'right', 'right', 720, 1280);
    expect(q.sideOn).toBeNull();
    expect(q.countable).toBe(false);
  });
});
