import { Wagon, FireSource, Obstacle, FireUnit, Deployment, AvailableResources } from '../types';

const WAGON_GAP = 6;
const TRACK_Y = 300;
const TRACK_START_X = 80;

// Minimum distance from fire (100m = 200 SVG units)
const MIN_DISTANCE_FROM_FIRE = 200;

// Minimum distance for nozzle from fire (3m = 6 SVG units)
const MIN_NOZZLE_DISTANCE_FROM_FIRE = 6;

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
  obstacles: Obstacle[],
  wagons: Wagon[]
): boolean {
  for (const obs of obstacles) {
    if (rectIntersects(x, y, w, h, obs.x, obs.y, obs.width, obs.height)) {
      return true;
    }
  }
  // Check wagons
  for (const wagon of wagons) {
    if (rectIntersects(x, y, w, h, wagon.x, wagon.y, wagon.width, wagon.height)) {
      return true;
    }
  }
  return false;
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// Check if line segment intersects rectangle
function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) {
      return true;
    }
  }
  return false;
}

// Check if line crosses any blocking obstacle or wagon
function lineCrossesBlockingObstacle(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Obstacle[],
  wagons: Wagon[]
): boolean {
  // Check obstacles (except road, tree_group, equipment)
  for (const obs of obstacles) {
    if (obs.type === 'road' || obs.type === 'tree_group' || obs.type === 'equipment') continue;
    if (lineIntersectsRect(x1, y1, x2, y2, obs.x, obs.y, obs.width, obs.height)) {
      return true;
    }
  }
  // Check wagons
  for (const wagon of wagons) {
    if (lineIntersectsRect(x1, y1, x2, y2, wagon.x, wagon.y, wagon.width, wagon.height)) {
      return true;
    }
  }
  return false;
}

// Check if point is inside any blocking obstacle or wagon
function isPointInBlockingObstacle(x: number, y: number, obstacles: Obstacle[], wagons: Wagon[]): boolean {
  for (const obs of obstacles) {
    if (obs.type === 'road' || obs.type === 'tree_group' || obs.type === 'equipment') continue;
    if (x >= obs.x && x <= obs.x + obs.width && y >= obs.y && y <= obs.y + obs.height) {
      return true;
    }
  }
  for (const wagon of wagons) {
    if (x >= wagon.x && x <= wagon.x + wagon.width && y >= wagon.y && y <= wagon.y + wagon.height) {
      return true;
    }
  }
  return false;
}

// Find a point that avoids obstacles and wagons
function findAvoidancePoint(
  fromX: number, fromY: number, toX: number, toY: number,
  obstacles: Obstacle[], wagons: Wagon[]
): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: fromX, y: fromY };

  const nx = -dy / len;
  const ny = dx / len;

  // Try offsets perpendicular to the line
  for (let offset = 30; offset <= 180; offset += 15) {
    for (const sign of [1, -1]) {
      const midX = (fromX + toX) / 2 + nx * offset * sign;
      const midY = (fromY + toY) / 2 + ny * offset * sign;

      if (midX < 10 || midX > 990 || midY < 10 || midY > 590) continue;

      if (!isPointInBlockingObstacle(midX, midY, obstacles, wagons)) {
        if (!lineCrossesBlockingObstacle(fromX, fromY, midX, midY, obstacles, wagons) &&
            !lineCrossesBlockingObstacle(midX, midY, toX, toY, obstacles, wagons)) {
          return { x: midX, y: midY };
        }
      }
    }
  }

  return { x: (fromX + toX) / 2, y: (fromY + toY) / 2 };
}

function findAccessiblePosition(
  targetX: number, targetY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[],
  wagons: Wagon[],
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

      if (isPositionBlocked(px, py, unitWidth, unitHeight, obstacles, wagons)) continue;

      let collidesWithUnit = false;
      for (const pos of occupiedPositions) {
        if (rectIntersects(px - 5, py - 5, unitWidth + 10, unitHeight + 10, pos.x, pos.y, pos.w, pos.h)) {
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

  // Determine fire spread direction (along train = left/right)
  const intensityMult = fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1.5 : 1;
  const idealAC = Math.ceil(2 * intensityMult) + (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0);
  const idealAL = (fireSource.type === 'wagon_body' || fireSource.type === 'tank') ? 1 : 0;
  const idealASR = 1;

  // === PRIMARY ATTACK - LEFT AND RIGHT SIDES (fire spreads along train) ===
  
  // Left side (fire spreads left)
  const leftPos = findAccessiblePosition(
    fireWagon.x - 10, fireY, 50, 22, obstacles, wagons, 'left', 35, 400, safeDist, occupiedPositions
  );
  if (leftPos && availAC > 0) {
    addUnit({
      type: 'aca',
      name: 'АЦ-40 (1/6)',
      x: leftPos.x,
      y: leftPos.y,
      angle: leftPos.angle,
      personnel: 7,
      hoses: Math.ceil(2 * intensityMult),
      role: 'Левый фланг (против распространения)',
    });
  }

  // Right side (fire spreads right)
  const rightPos = findAccessiblePosition(
    fireWagon.x + fireWagon.width + 10, fireY, 50, 22, obstacles, wagons, 'right', 35, 400, safeDist, occupiedPositions
  );
  if (rightPos && availAC > 0) {
    addUnit({
      type: 'ac',
      name: 'АЦ-40 (2/6)',
      x: rightPos.x,
      y: rightPos.y,
      angle: rightPos.angle,
      personnel: 7,
      hoses: Math.ceil(2 * intensityMult),
      role: 'Правый фланг (против распространения)',
    });
  }

  // === SECONDARY ATTACK - TOP AND BOTTOM (opposite sides) ===
  
  // Top side (opposite to bottom)
  const topPos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, wagons, 'top', 30, 400, safeDist, occupiedPositions);
  if (topPos && availAC > 0) {
    addUnit({
      type: 'aca',
      name: 'АЦ-40 (3/6)',
      x: topPos.x,
      y: topPos.y,
      angle: topPos.angle,
      personnel: 6,
      hoses: 2,
      role: 'Верх (противоположная сторона)',
    });
  }

  // Bottom side (opposite to top)
  const bottomPos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, wagons, 'bottom', 30, 400, safeDist, occupiedPositions);
  if (bottomPos && availAC > 0) {
    addUnit({
      type: 'ac',
      name: 'АЦ-40 (4/6)',
      x: bottomPos.x,
      y: bottomPos.y,
      angle: bottomPos.angle,
      personnel: 6,
      hoses: 2,
      role: 'Низ (противоположная сторона)',
    });
  }

  // === ADDITIONAL FLANKS FOR HIGH INTENSITY ===
  if (fireSource.intensity === 'high') {
    // Additional left-top
    const leftTopPos = findAccessiblePosition(
      fireWagon.x - 20, fireY - 15, 50, 22, obstacles, wagons, 'top', 40, 300, safeDist, occupiedPositions
    );
    if (leftTopPos && availAC > 0) {
      addUnit({
        type: 'ac',
        name: 'АЦ-40 (5/6)',
        x: leftTopPos.x,
        y: leftTopPos.y,
        angle: leftTopPos.angle,
        personnel: 6,
        hoses: 2,
        role: 'Доп. ствол (лево-верх)',
      });
    }

    // Additional right-bottom
    const rightBottomPos = findAccessiblePosition(
      fireWagon.x + fireWagon.width + 20, fireY + 15, 50, 22, obstacles, wagons, 'bottom', 40, 300, safeDist, occupiedPositions
    );
    if (rightBottomPos && availAC > 0) {
      addUnit({
        type: 'ac',
        name: 'АЦ-40 (6/6)',
        x: rightBottomPos.x,
        y: rightBottomPos.y,
        angle: rightBottomPos.angle,
        personnel: 6,
        hoses: 2,
        role: 'Доп. ствол (право-низ)',
      });
    }
  }

  // === AERIAL LADDER ===
  if (idealAL > 0 && availAL > 0) {
    const ladderPos = findAccessiblePosition(fireX, fireY, 55, 22, obstacles, wagons, 'top', 50, 340, safeDist, occupiedPositions);
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
    const reservePos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, wagons, 'top', 80, 360, safeDist, occupiedPositions);
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

    const totalPersonnelNeeded = Math.ceil((7 * 2 + 6 * (fireSource.intensity === 'high' ? 4 : fireSource.intensity === 'medium' ? 2 : 0) + 5 * idealAL + 3) * intensityMult);
    if (resources.personnel < totalPersonnelNeeded) {
      warnings.push(`⚠ Недостаточно л/состава: оптимально ${totalPersonnelNeeded} чел., имеется ${resources.personnel}`);
    }
  }

  // === STRATEGY ===
  let strategy = '';
  const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;

  if (deployedAC >= 4) {
    strategy = 'Атака с 4 направлений: слева/справа (против распространения) + сверху/снизу (со стороны окон). ';
  } else if (deployedAC >= 2) {
    strategy = 'Атака слева и справа для локализации распространения пожара вдоль состава. ';
  } else if (deployedAC === 1) {
    strategy = 'Единственное направление атаки. Ограниченные силы. ';
  } else {
    strategy = 'Недостаточно сил для эффективной атаки! ';
  }

  if (fireSource.intensity === 'high') {
    strategy += 'Дополнительные стволы для усиления. ';
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
  const personnel = Math.ceil((7 * 2 + 6 * (fireSource.intensity === 'high' ? 4 : fireSource.intensity === 'medium' ? 2 : 0) + 5 * al + 3) * intensityMult);
  return { ac, al, asr, personnel };
}
