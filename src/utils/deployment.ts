import { Wagon, FireSource, Obstacle, FireUnit, Deployment, AvailableResources } from '../types';

const WAGON_GAP = 6;
const TRACK_Y = 300;
const TRACK_START_X = 80;

// Minimum distance from fire (100m = 200 SVG units)
const MIN_DISTANCE_FROM_FIRE = 200;

function getSafeDistance(fireSource: FireSource): number {
  return MIN_DISTANCE_FROM_FIRE;
}

function rectIntersects(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function isPositionBlocked(
  x: number, y: number, w: number, h: number,
  obstacles: Obstacle[]
): boolean {
  for (const obs of obstacles) {
    if (rectIntersects(x, y, w, h, obs.x, obs.y, obs.width, obs.height)) {
      return true;
    }
  }
  return false;
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function findAccessiblePosition(
  targetX: number, targetY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[],
  preferredSide: 'top' | 'bottom' | 'left' | 'right',
  minDistance: number,
  maxDistance: number,
  safeDistance: number,
  occupiedPositions: Array<{ x: number; y: number; w: number; h: number }>
): { x: number; y: number; angle: number } | null {
  const offsets = {
    top: [
      { dx: 0, dy: -1, angle: 90 },
      { dx: -0.4, dy: -1, angle: 110 },
      { dx: 0.4, dy: -1, angle: 70 },
      { dx: -0.7, dy: -0.9, angle: 130 },
      { dx: 0.7, dy: -0.9, angle: 50 },
      { dx: -1, dy: -0.5, angle: 150 },
      { dx: 1, dy: -0.5, angle: 30 },
      { dx: -1, dy: 0, angle: 170 },
      { dx: 1, dy: 0, angle: 10 },
    ],
    bottom: [
      { dx: 0, dy: 1, angle: 270 },
      { dx: -0.4, dy: 1, angle: 250 },
      { dx: 0.4, dy: 1, angle: 290 },
      { dx: -0.7, dy: 0.9, angle: 230 },
      { dx: 0.7, dy: 0.9, angle: 310 },
      { dx: -1, dy: 0.5, angle: 210 },
      { dx: 1, dy: 0.5, angle: 330 },
      { dx: -1, dy: 0, angle: 190 },
      { dx: 1, dy: 0, angle: 350 },
    ],
    left: [
      { dx: -1, dy: 0, angle: 0 },
      { dx: -1, dy: -0.4, angle: 20 },
      { dx: -1, dy: 0.4, angle: 340 },
      { dx: -0.8, dy: -0.8, angle: 40 },
      { dx: -0.8, dy: 0.8, angle: 320 },
    ],
    right: [
      { dx: 1, dy: 0, angle: 180 },
      { dx: 1, dy: -0.4, angle: 160 },
      { dx: 1, dy: 0.4, angle: 200 },
      { dx: 0.8, dy: -0.8, angle: 140 },
      { dx: 0.8, dy: 0.8, angle: 220 },
    ],
  };

  const dirs = offsets[preferredSide];

  for (const dir of dirs) {
    for (let dist = Math.max(minDistance, safeDistance); dist <= maxDistance; dist += 8) {
      const px = targetX + dir.dx * dist;
      const py = targetY + dir.dy * dist;

      if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;

      const distToFire = distanceBetween(px + unitWidth / 2, py + unitHeight / 2, targetX, targetY);
      if (distToFire < safeDistance) continue;

      if (isPositionBlocked(px, py, unitWidth, unitHeight, obstacles)) continue;

      let collidesWithUnit = false;
      for (const pos of occupiedPositions) {
        if (rectIntersects(px - 8, py - 8, unitWidth + 16, unitHeight + 16, pos.x, pos.y, pos.w, pos.h)) {
          collidesWithUnit = true;
          break;
        }
      }
      if (collidesWithUnit) continue;

      return { x: px, y: py, angle: dir.angle };
    }
  }

  return null;
}

export function calculateDeployment(
  wagons: Wagon[],
  fireSource: FireSource | null,
  obstacles: Obstacle[],
  resources?: AvailableResources | null
): Deployment | null {
  if (!fireSource) return null;

  const fireWagon = wagons.find(w => w.id === fireSource.wagonId);
  if (!fireWagon) return null;

  const units: FireUnit[] = [];
  const warnings: string[] = [];
  let unitId = 1;

  const fireX = fireSource.x;
  const fireY = fireSource.y;
  const safeDist = getSafeDistance(fireSource);

  // Available resources tracking
  let availAC = resources ? resources.ac : 10;
  let availAL = resources ? resources.al : 3;
  let availASR = resources ? resources.asr : 1;
  let availPersonnel = resources ? resources.personnel : 100;

  const occupiedPositions: Array<{ x: number; y: number; w: number; h: number }> = [];

  const addUnit = (unit: Omit<FireUnit, 'id' | 'safeDistance'>): boolean => {
    if (unit.type === 'aca' || unit.type === 'ac') {
      if (availAC <= 0) return false;
      if (availPersonnel < unit.personnel) return false;
      availAC--;
    } else if (unit.type === 'al') {
      if (availAL <= 0) return false;
      if (availPersonnel < unit.personnel) return false;
      availAL--;
    } else if (unit.type === 'asr') {
      if (availASR <= 0) return false;
      if (availPersonnel < unit.personnel) return false;
      availASR--;
    }
    availPersonnel -= unit.personnel;

    units.push({
      ...unit,
      id: `unit-${unitId++}`,
      safeDistance: safeDist,
    });
    occupiedPositions.push({ x: unit.x, y: unit.y, w: 50, h: 22 });
    return true;
  };

  // === DETERMINE REQUIRED FORCES ===
  const intensityMult = fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1.5 : 1;

  // Calculate ideal number of AC units
  const idealAC = Math.ceil(2 * intensityMult) + (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0);
  const idealAL = (fireSource.type === 'wagon_body' || fireSource.type === 'tank') ? 1 : 0;
  const idealASR = 1;

  // === PRIMARY ATTACK - Always try to place at least 2 AC ===
  // Top side - first AC
  const topPos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, 'top', 30, 350, safeDist, occupiedPositions);
  if (topPos && availAC > 0) {
    addUnit({
      type: 'aca',
      name: 'АЦ-40 (1/6)',
      x: topPos.x,
      y: topPos.y,
      angle: topPos.angle,
      personnel: 7,
      hoses: Math.ceil(2 * intensityMult),
      role: 'Ствол №1 (верх)',
    });
  }

  // Bottom side - second AC
  const bottomPos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, 'bottom', 30, 350, safeDist, occupiedPositions);
  if (bottomPos && availAC > 0) {
    addUnit({
      type: 'aca',
      name: 'АЦ-40 (2/6)',
      x: bottomPos.x,
      y: bottomPos.y,
      angle: bottomPos.angle,
      personnel: 7,
      hoses: Math.ceil(2 * intensityMult),
      role: 'Ствол №2 (низ)',
    });
  }

  // === FLANK POSITIONS ===
  if (fireSource.intensity === 'medium' || fireSource.intensity === 'high') {
    const leftPos = findAccessiblePosition(
      fireWagon.x - 10, fireY, 50, 22, obstacles, 'top', 35, 320, safeDist, occupiedPositions
    );
    if (leftPos && availAC > 0) {
      addUnit({
        type: 'ac',
        name: 'АЦ-40 (3/6)',
        x: leftPos.x,
        y: leftPos.y,
        angle: leftPos.angle,
        personnel: 6,
        hoses: 2,
        role: 'Левый фланг',
      });
    }
  }

  if (fireSource.intensity === 'high') {
    const rightPos = findAccessiblePosition(
      fireWagon.x + fireWagon.width + 10, fireY, 50, 22, obstacles, 'top', 35, 320, safeDist, occupiedPositions
    );
    if (rightPos && availAC > 0) {
      addUnit({
        type: 'ac',
        name: 'АЦ-40 (4/6)',
        x: rightPos.x,
        y: rightPos.y,
        angle: rightPos.angle,
        personnel: 6,
        hoses: 2,
        role: 'Правый фланг',
      });
    }
  }

  // === AERIAL LADDER ===
  if (idealAL > 0 && availAL > 0) {
    const ladderPos = findAccessiblePosition(fireX, fireY, 55, 22, obstacles, 'top', 50, 340, safeDist, occupiedPositions);
    if (ladderPos) {
      addUnit({
        type: 'al',
        name: 'АЛ-30(40)',
        x: ladderPos.x,
        y: ladderPos.y,
        angle: ladderPos.angle,
        personnel: 5,
        hoses: 1,
        role: 'Подача сверху',
      });
    }
  }

  // === SUPPORT ===
  if (availASR > 0) {
    const reservePos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, 'top', 80, 360, safeDist, occupiedPositions);
    if (reservePos) {
      addUnit({
        type: 'asr',
        name: 'АСР',
        x: reservePos.x,
        y: reservePos.y,
        angle: reservePos.angle,
        personnel: 3,
        hoses: 0,
        role: 'Штаб / связь',
      });
    }
  }

  // === GENERATE WARNINGS ===
  if (resources) {
    const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;
    const deployedAL = units.filter(u => u.type === 'al').length;

    if (deployedAC < idealAC) {
      warnings.push(`⚠ Недостаточно АЦ: требуется ${idealAC}, имеется ${resources.ac}, размещено ${deployedAC}`);
    }
    if (idealAL > 0 && deployedAL < idealAL) {
      warnings.push(`⚠ Недостаточно АЛ: требуется ${idealAL}, размещено ${deployedAL}`);
    }

    const totalPersonnelNeeded = Math.ceil((7 * 2 + 6 * (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0) + 5 * idealAL + 3) * intensityMult);
    if (resources.personnel < totalPersonnelNeeded) {
      warnings.push(`⚠ Недостаточно л/состава: оптимально ${totalPersonnelNeeded} чел., имеется ${resources.personnel}`);
    }
  }

  // === STRATEGY ===
  let strategy = '';
  const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;

  if (deployedAC >= 4) {
    strategy = 'Атака с 3-4 направлений. Полная локализация и ликвидация. ';
  } else if (deployedAC >= 2) {
    strategy = 'Атака с 2 направлений (верх/низ). ';
  } else if (deployedAC === 1) {
    strategy = 'Единственное направление атаки. Ограниченные силы. ';
  } else {
    strategy = 'Недостаточно сил для эффективной атаки! ';
  }

  if (fireSource.intensity === 'high') {
    strategy += 'Охлаждение смежных вагонов. ';
  }
  if (fireSource.type === 'tank') {
    strategy += 'Подача пены на цистерну. ';
  }
  strategy += `Безопасное расстояние: ${(safeDist * 0.5).toFixed(0)} м.`;

  const totalPersonnel = units.reduce((sum, u) => sum + u.personnel, 0);
  const totalHoses = units.reduce((sum, u) => sum + u.hoses, 0);

  return {
    units,
    totalPersonnel,
    totalHoses,
    strategy,
    warnings,
    safeRadius: safeDist,
  };
}

export function generateDefaultWagons(): Wagon[] {
  const types: Array<'passenger' | 'freight' | 'tank' | 'platform'> = [
    'freight', 'freight', 'tank', 'passenger', 'freight', 'freight', 'platform', 'freight'
  ];
  const labels = [
    'Грузовой №1', 'Грузовой №2', 'Цистерна №1', 'Пассажирский №1',
    'Грузовой №3', 'Грузовой №4', 'Платформа №1', 'Грузовой №5'
  ];

  const wagons: Wagon[] = [];
  let currentX = TRACK_START_X;

  for (let i = 0; i < types.length; i++) {
    const width = types[i] === 'platform' ? 80 : 90;
    const height = types[i] === 'tank' ? 32 : types[i] === 'passenger' ? 28 : 26;
    wagons.push({
      id: i + 1,
      x: currentX,
      y: TRACK_Y - height / 2,
      width,
      height,
      type: types[i],
      label: labels[i],
    });
    currentX += width + WAGON_GAP;
  }

  return wagons;
}

export function getIdealResources(fireSource: FireSource): { ac: number; al: number; asr: number; personnel: number } {
  const intensityMult = fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1.5 : 1;
  const ac = Math.ceil(2 * intensityMult) + (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0);
  const al = (fireSource.type === 'wagon_body' || fireSource.type === 'tank') ? 1 : 0;
  const asr = 1;
  const personnel = Math.ceil((7 * 2 + 6 * (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0) + 5 * al + 3) * intensityMult);
  return { ac, al, asr, personnel };
}
