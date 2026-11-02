/** Per-shot measurements. Keys are stable: they are stored in the database and exported as CSV columns. */
export const METRICS = [
  { key: 'elbowRelease', label: 'Elbow at release', short: 'Elbow', unit: '°' },
  { key: 'elbowSet', label: 'Elbow at set point', short: 'Set', unit: '°' },
  { key: 'kneeDip', label: 'Knee at deepest dip', short: 'Knee', unit: '°' },
  { key: 'hipDip', label: 'Hip at deepest dip', short: 'Hip', unit: '°' },
  { key: 'torsoLean', label: 'Torso lean at release', short: 'Lean', unit: '°' },
  { key: 'forearmAngle', label: 'Forearm angle at release', short: 'Forearm', unit: '°' },
  { key: 'releaseHeightCm', label: 'Release height (est.)', short: 'Release', unit: 'cm' },
  { key: 'jumpCm', label: 'Jump height (est.)', short: 'Jump', unit: 'cm' },
  { key: 'tempoMs', label: 'Dip to release', short: 'Tempo', unit: 'ms' },
] as const;

export type MetricKey = (typeof METRICS)[number]['key'];
export type ShotMetrics = Record<MetricKey, number | null>;

export function formatMetric(key: MetricKey, v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const unit = METRICS.find((m) => m.key === key)!.unit;
  if (unit === 'ms') return `${(v / 1000).toFixed(2)} s`;
  return `${Math.round(v)}${unit === '°' ? '°' : ` ${unit}`}`;
}

/** Mean of the non-null values, or null if there are none. */
export function mean(values: (number | null | undefined)[]): number | null {
  const ok = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
}
