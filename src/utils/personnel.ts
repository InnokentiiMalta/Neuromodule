export interface PersonnelDistribution {
  nozzles: number;        // ствольщики
  atVehicle: number;      // у автомобиля
  atBranch: number;       // на разветвлении
  free: number;           // свободные
}

export function distributePersonnel(
  vehicleType: 'ac' | 'asa' | 'aso' | 'train',
  total: number
): PersonnelDistribution {
  const N = Math.max(0, Math.floor(total));

  if (vehicleType === 'aso') {
    return {
      nozzles: 0,
      atVehicle: N >= 1 ? 1 : 0,
      atBranch: 0,
      free: N >= 2 ? N - 1 : 0,
    };
  }

  if (vehicleType === 'train') {
    const capped = Math.min(N, 16);
    const nozzles = Math.min(capped - 1, 4);
    const atVehicle = capped >= 2 ? 1 : 0;
    const atBranch = capped >= 6 ? 1 : 0;
    const free = Math.max(0, capped - nozzles - atVehicle - atBranch);
    return { nozzles, atVehicle, atBranch, free };
  }

  // ac, asa
  const capped = Math.min(N, 6);
  const nozzles = Math.min(capped - 1, 2);
  const atVehicle = capped >= 2 ? 1 : 0;
  const atBranch = capped >= 4 ? 1 : 0;
  const free = Math.max(0, capped - nozzles - atVehicle - atBranch);
  return { nozzles: Math.max(0, nozzles), atVehicle, atBranch, free };
}
