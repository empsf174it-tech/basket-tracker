import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './smoothing';

describe('OneEuroFilter', () => {
  it('passes the first sample through and converges on a constant', () => {
    const f = new OneEuroFilter(1, 0);
    expect(f.filter(5, 0)).toBe(5);
    let v = 0;
    for (let i = 1; i <= 200; i++) v = f.filter(10, i / 30);
    expect(v).toBeCloseTo(10, 3);
  });

  it('reduces jitter on a noisy constant signal', () => {
    const f = new OneEuroFilter(1, 0);
    const out: number[] = [];
    for (let i = 0; i < 300; i++) out.push(f.filter(1 + (i % 2 ? 0.05 : -0.05), i / 30));
    const tail = out.slice(100);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.05);
  });
});
