import type { Landmark, Pose } from './types';

/**
 * One Euro filter (Casiez et al., 2012): an adaptive low-pass filter whose cutoff rises with speed,
 * so slow motion is smoothed heavily (less jitter) and fast motion lags little.
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.02,
    public dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param t timestamp in seconds */
  filter(x: number, t: number): number {
    if (this.xPrev === null || this.tPrev === null || t <= this.tPrev) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = t - this.tPrev;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

/** Applies independent One Euro filters to x, y, z of every landmark. Visibility is passed through. */
export class PoseSmoother {
  private filters: OneEuroFilter[][] = [];

  constructor(
    private minCutoff = 1.5,
    private beta = 0.5,
  ) {}

  /** @param tMs timestamp in milliseconds */
  smooth(pose: Pose, tMs: number): Pose {
    const t = tMs / 1000;
    return pose.map((lm: Landmark, i) => {
      let f = this.filters[i];
      if (!f) {
        f = [0, 1, 2].map(() => new OneEuroFilter(this.minCutoff, this.beta));
        this.filters[i] = f;
      }
      return {
        x: f[0]!.filter(lm.x, t),
        y: f[1]!.filter(lm.y, t),
        z: f[2]!.filter(lm.z, t),
        visibility: lm.visibility,
      };
    });
  }

  reset(): void {
    this.filters = [];
  }
}
