import { Wagon, FireSource, Obstacle, FireUnit, Deployment, AvailableResources } from '../types';

const WAGON_GAP = 6;
const TRACK_Y = 300;
const TRACK_START_X = 80;
const MIN_DISTANCE_FROM_FIRE = 200; // 100m
const HOSE_CORRIDOR_DIST = 10; // 5m from wagon contour

function rectIntersects(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function isPositionBlocked(
  x: number, y: number, w: number, h: number,
  obstacles: Obstacle[], wagons: Wagon[]
): boolean {
  for (const obs of obstacles) {
    if (obs.type === 'road' || obs.type === 'tree_group' || obs.type === 'equipment') continue;
    if (rectIntersects(x, y, w, h, obs.x, obs.y, obs.width, obs.height)) return true;
  }
  for (const wagon of wagons) {
    if (rectIntersects(x, y, w, h, wagon.x, wagon.y, wagon.width, wagon.height)) return true;
  }
  return false;
}

function distanceBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// Distance from point to rectangle contour
function distanceToRectContour(px: number, py: number, rx: number, ry: number, rw: number, rh: number): number {
  if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return 0;
  const dx = Math.max(rx - px, 0, px - (rx + rw));
  const dy = Math.max(ry - py, 0, py - (ry + rh));
  return Math.sqrt(dx * dx + dy * dy);
}

// Get the "corridor" around the train (5m outside wagons)
// Returns the Y coordinates of the corridor (above and below the train)
function getTrainCorridor(wagons: Wagon[]): { topY: number; bottomY: number; leftX: number; rightX: number } {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const w of wagons) {
    minX = Math.min(minX, w.x);
    maxX = Math.max(maxX, w.x + w.width);
    minY = Math.min(minY, w.y);
    maxY = Math.max(maxY, w.y + w.height);
  }
  return {
    topY: minY - HOSE_CORRIDOR_DIST,
    bottomY: maxY + HOSE_CORRIDOR_DIST,
    leftX: minX - HOSE_CORRIDOR_DIST,
    rightX: maxX + HOSE_CORRIDOR_DIST,
  };
}

function findAccessiblePosition(
  targetX: number, targetY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[], wagons: Wagon[],
  preferredSide: 'top' | 'bottom' | 'left' | 'right',
  minDistance: number, maxDistance: number, safeDistance: number,
  occupiedPositions: Array<{ x: number; y: number; w: number; h: number }>
): { x: number; y: number; angle: number } | null {
  const offsets = {
    top: [
      { dx: 0, dy: -1, angle: 90 },
      { dx: -0.3, dy: -1, angle: 108 },
      { dx: 0.3, dy: -1, angle: 72 },
      { dx: -0.6, dy: -0.9, angle: 125 },
      { dx: 0.6, dy: -0.9, angle: 55 },
      { dx: -1, dy: -0.4, angle: 155 },
      { dx: 1, dy: -0.4, angle: 25 },
    ],
    bottom: [
      { dx: 0, dy: 1, angle: 270 },
      { dx: -0.3, dy: 1, angle: 252 },
      { dx: 0.3, dy: 1, angle: 288 },
      { dx: -0.6, dy: 0.9, angle: 235 },
      { dx: 0.6, dy: 0.9, angle: 305 },
      { dx: -1, dy: 0.4, angle: 205 },
      { dx: 1, dy: 0.4, angle: 335 },
    ],
    left: [
      { dx: -1, dy: 0, angle: 0 },
      { dx: -1, dy: -0.3, angle: 17 },
      { dx: -1, dy: 0.3, angle: 343 },
      { dx: -0.8, dy: -0.7, angle: 38 },
      { dx: -0.8, dy: 0.7, angle: 322 },
    ],
    right: [
      { dx: 1, dy: 0, angle: 180 },
      { dx: 1, dy: -0.3, angle: 163 },
      { dx: 1, dy: 0.3, angle: 197 },
      { dx: 0.8, dy: -0.7, angle: 142 },
      { dx: 0.8, dy: 0.7, angle: 218 },
    ],
  };

  const dirs = offsets[preferredSide];

  for (const dir of dirs) {
    for (let dist = Math.max(minDistance, safeDistance); dist <= maxDistance; dist += 6) {
      const px = targetX + dir.dx * dist;
      const py = targetY + dir.dy * dist;

      if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;

      const distToFire = distanceBetween(px + unitWidth / 2, py + unitHeight / 2, targetX, targetY);
      if (distToFire < safeDistance) continue;

      if (isPositionBlocked(px, py, unitWidth, unitHeight, obstacles, wagons)) continue;

      let collidesWithUnit = false;
      for (const pos of occupiedPositions) {
        if (rectIntersects(px - 3, py - 3, unitWidth + 6, unitHeight + 6, pos.x, pos.y, pos.w, pos.h)) {
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
  const safeDist = MIN_DISTANCE_FROM_FIRE;

  let availAC = resources ? resources.ac : 10;
  let availAL = resources ? resources.al : 3;
  let availASR = resources ? resources.asr : 1;
  let availPersonnel = resources ? resources.personnel : 100;

  const occupiedPositions: Array<{ x: number; y: number; w: number; h: number }> = [];

  const addUnit = (unit: Omit<FireUnit, 'id' | 'safeDistance'>): boolean => {
    if (unit.type === 'aca' || unit.type === 'ac') {
      if (availAC <= 0 || availPersonnel < unit.personnel) return false;
      availAC--;
    } else if (unit.type === 'al') {
      if (availAL <= 0 || availPersonnel < unit.personnel) return false;
      availAL--;
    } else if (unit.type === 'asr') {
      if (availASR <= 0 || availPersonnel < unit.personnel) return false;
      availASR--;
    }
    availPersonnel -= unit.personnel;

    units.push({ ...unit, id: `unit-${unitId++}`, safeDistance: safeDist });
    occupiedPositions.push({ x: unit.x, y: unit.y, w: 50, h: 22 });
    return true;
  };

  const intensityMult = fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1.5 : 1;
  const idealAC = Math.ceil(2 * intensityMult) + (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0);
  const idealAL = (fireSource.type === 'wagon_body' || fireSource.type === 'tank') ? 1 : 0;
  const idealASR = 1;

  // LEFT side
  const leftPos = findAccessiblePosition(fireWagon.x - 10, fireY, 50, 22, obstacles, wagons, 'left', 35, 400, safeDist, occupiedPositions);
  if (leftPos && availAC > 0) {
    addUnit({ type: 'aca', name: 'АЦ-40 (1/6)', x: leftPos.x, y: leftPos.y, angle: leftPos.angle, personnel: 7, hoses: Math.ceil(2 * intensityMult), role: 'Левый фланг' });
  }

  // RIGHT side
  const rightPos = findAccessiblePosition(fireWagon.x + fireWagon.width + 10, fireY, 50, 22, obstacles, wagons, 'right', 35, 400, safeDist, occupiedPositions);
  if (rightPos && availAC > 0) {
    addUnit({ type: 'ac', name: 'АЦ-40 (2/6)', x: rightPos.x, y: rightPos.y, angle: rightPos.angle, personnel: 7, hoses: Math.ceil(2 * intensityMult), role: 'Правый фланг' });
  }

  // TOP side
  const topPos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, wagons, 'top', 30, 400, safeDist, occupiedPositions);
  if (topPos && availAC > 0) {
    addUnit({ type: 'aca', name: 'АЦ-40 (3/6)', x: topPos.x, y: topPos.y, angle: topPos.angle, personnel: 6, hoses: 2, role: 'Верх' });
  }

  // BOTTOM side
  const bottomPos = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, wagons, 'bottom', 30, 400, safeDist, occupiedPositions);
  if (bottomPos && availAC > 0) {
    addUnit({ type: 'ac', name: 'АЦ-40 (4/6)', x: bottomPos.x, y: bottomPos.y, angle: bottomPos.angle, personnel: 6, hoses: 2, role: 'Низ' });
  }

  if (fireSource.intensity === 'high') {
    const lt = findAccessiblePosition(fireWagon.x - 20, fireY - 15, 50, 22, obstacles, wagons, 'top', 40, 380, safeDist, occupiedPositions);
    if (lt && availAC > 0) {
      addUnit({ type: 'ac', name: 'АЦ-40 (5/6)', x: lt.x, y: lt.y, angle: lt.angle, personnel: 6, hoses: 2, role: 'Доп. лево-верх' });
    }
    const rb = findAccessiblePosition(fireWagon.x + fireWagon.width + 20, fireY + 15, 50, 22, obstacles, wagons, 'bottom', 40, 380, safeDist, occupiedPositions);
    if (rb && availAC > 0) {
      addUnit({ type: 'ac', name: 'АЦ-40 (6/6)', x: rb.x, y: rb.y, angle: rb.angle, personnel: 6, hoses: 2, role: 'Доп. право-низ' });
    }
  }

  if (idealAL > 0 && availAL > 0) {
    const lp = findAccessiblePosition(fireX, fireY, 55, 22, obstacles, wagons, 'top', 50, 400, safeDist, occupiedPositions);
    if (lp) {
      addUnit({ type: 'al', name: 'АЛ-30(40)', x: lp.x, y: lp.y, angle: lp.angle, personnel: 5, hoses: 1, role: 'Подача сверху' });
    }
  }

  if (availASR > 0) {
    const rp = findAccessiblePosition(fireX, fireY, 50, 22, obstacles, wagons, 'top', 80, 420, safeDist, occupiedPositions);
    if (rp) {
      addUnit({ type: 'asr', name: 'АСР', x: rp.x, y: rp.y, angle: rp.angle, personnel: 3, hoses: 0, role: 'Штаб / связь' });
    }
  }

  // Warnings
  if (resources) {
    const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;
    const deployedAL = units.filter(u => u.type === 'al').length;
    if (deployedAC < idealAC) warnings.push(`⚠ Недостаточно АЦ: требуется ${idealAC}, имеется ${resources.ac}, размещено ${deployedAC}`);
    if (idealAL > 0 && deployedAL < idealAL) warnings.push(`⚠ Недостаточно АЛ: требуется ${idealAL}, размещено ${deployedAL}`);
  }

  let strategy = '';
  const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;
  if (deployedAC >= 4) strategy = 'Атака с 4 направлений. ';
  else if (deployedAC >= 2) strategy = 'Атака с 2 направлений. ';
  else if (deployedAC === 1) strategy = 'Единственное направление. ';
  else strategy = 'Недостаточно сил! ';
  if (fireSource.type === 'tank') strategy += 'Подача пены на цистерну. ';
  strategy += `Безопасное расстояние: ${(safeDist * 0.5).toFixed(0)} м.`;

  return {
    units,
    totalPersonnel: units.reduce((s, u) => s + u.personnel, 0),
    totalHoses: units.reduce((s, u) => s + u.hoses, 0),
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
    wagons.push({ id: i + 1, x: currentX, y: TRACK_Y - height / 2, width, height, type: types[i], label: labels[i] });
    currentX += width + WAGON_GAP;
  }
  return wagons;
}

export function getIdealResources(fireSource: FireSource): { ac: number; al: number; asr: number; personnel: number } {
  const m = fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1.5 : 1;
  const ac = Math.ceil(2 * m) + (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0);
  const al = (fireSource.type === 'wagon_body' || fireSource.type === 'tank') ? 1 : 0;
  return { ac, al, asr: 1, personnel: Math.ceil((7 * 2 + 6 * (fireSource.intensity === 'high' ? 4 : fireSource.intensity === 'medium' ? 2 : 0) + 5 * al + 3) * m) };
}

export { getTrainCorridor, distanceToRectContour, HOSE_CORRIDOR_DIST };
