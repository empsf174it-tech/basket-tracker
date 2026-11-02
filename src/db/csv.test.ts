import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';

describe('buildCsv', () => {
  it('writes a header and one row per shot with blanks for missing metrics', () => {
    const csv = buildCsv(
      [{ id: 1, startedAt: Date.UTC(2026, 10, 2, 10), heightCm: 180, hand: 'right' }],
      [
        {
          id: 7,
          sessionId: 1,
          shotType: 'FT',
          timestamp: Date.UTC(2026, 10, 2, 10, 5),
          metrics: { elbowRelease: 171.5, kneeDip: null },
        },
      ],
    );
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toContain('elbowRelease_deg');
    expect(header).toContain('releaseHeightCm_cm');
    const cols = header!.split(',');
    const vals = row!.split(',');
    expect(vals).toHaveLength(cols.length);
    expect(vals[cols.indexOf('shot_type')]).toBe('FT');
    expect(vals[cols.indexOf('hand')]).toBe('right');
    expect(vals[cols.indexOf('elbowRelease_deg')]).toBe('171.5');
    expect(vals[cols.indexOf('kneeDip_deg')]).toBe('');
    expect(vals[cols.indexOf('time')]).toBe('2026-11-02T10:05:00.000Z');
  });
});
