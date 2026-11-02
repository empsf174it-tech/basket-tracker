/**
 * Shot types are data, not code paths, so new types (or court locations) can be added later.
 * distanceM is release point to rim centre; used by physics/targets in stage 3.
 */
export type ShotTypeId = 'FT' | '2PT' | '3PT';

export interface ShotTypeDef {
  id: ShotTypeId;
  label: string;
  distanceM: number;
  entryAngleBandDeg: readonly [number, number];
}

export const SHOT_TYPES: readonly ShotTypeDef[] = [
  { id: 'FT', label: 'Free Throw', distanceM: 4.19, entryAngleBandDeg: [49, 56] },
  { id: '2PT', label: '2-Pointer', distanceM: 5.0, entryAngleBandDeg: [47, 53] },
  { id: '3PT', label: '3-Pointer', distanceM: 6.75, entryAngleBandDeg: [44, 50] },
];

export function shotType(id: ShotTypeId): ShotTypeDef {
  return SHOT_TYPES.find((s) => s.id === id)!;
}
