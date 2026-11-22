export interface CrewComposition {
  driver: number;
  nozzles: number;
  branchOperator: number;
  free: number;
  canDeployPTV: boolean;
}

const MAX_NOZZLES_PER_AC = 2;

export function computeCrewComposition(type: string, personnel: number): CrewComposition {
  const p = Math.max(0, Math.floor(Number(personnel) || 0));
  if (p === 0) return { driver: 0, nozzles: 0, branchOperator: 0, free: 0, canDeployPTV: false };

  const driver = 1;

  if (type === 'aso' || type === 'aux') {
    return { driver, nozzles: 0, branchOperator: 0, free: p - driver, canDeployPTV: false };
  }

  const nozzles = Math.min(MAX_NOZZLES_PER_AC, p - driver);
  const branchOperator = p >= 4 ? 1 : 0;
  const free = Math.max(0, p - driver - nozzles - branchOperator);
  return { driver, nozzles, branchOperator, free, canDeployPTV: nozzles > 0 };
}

export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

export const UNIT_LIMITS = { ac: 20, asa: 10, aso: 5, train: 1, aux: 20 } as const;

export function clampUnitCount(type: keyof typeof UNIT_LIMITS, value: number): number {
  const max = UNIT_LIMITS[type] ?? 99;
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(max, n));
}