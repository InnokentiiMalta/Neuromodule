import { computeCrewComposition } from './crew';

export interface PersonnelDistribution {
  nozzles: number;        // ствольщики
  atVehicle: number;      // у автомобиля
  atBranch: number;       // на разветвлении
  free: number;           // свободные
}

export function distributePersonnel(
  vehicleType: 'ac' | 'asa' | 'aso' | 'train' | 'aux',
  total: number,
  overrideNozzles?: number
): PersonnelDistribution {
  const N = Math.max(0, Math.floor(total));

  if (vehicleType === 'train') {
    const capped = Math.min(N, 16);
    const nozzles = Math.min(capped - 1, 4);
    const atVehicle = capped >= 2 ? 1 : 0;
    const atBranch = capped >= 7 ? 2 : (capped >= 6 ? 1 : 0);
    const free = Math.max(0, capped - nozzles - atVehicle - atBranch);
    return { nozzles, atVehicle, atBranch, free };
  }

  const capped = vehicleType === 'aso' || vehicleType === 'aux' ? N : Math.min(N, 6);
  const c = computeCrewComposition(vehicleType, capped);
  const nozzles = overrideNozzles !== undefined
    ? Math.max(0, Math.min(overrideNozzles, c.nozzles))
    : c.nozzles;
  const atVehicle = c.driver;
  const atBranch = nozzles > 0 ? c.branchOperator : 0;
  const free = Math.max(0, capped - nozzles - atVehicle - atBranch);
  return { nozzles, atVehicle, atBranch, free };
}
