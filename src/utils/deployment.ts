import { Wagon, FireSource, Obstacle, FireUnit, Deployment, AvailableResources, WaterSource } from '../types';

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

function distanceToRectContour(px: number, py: number, rx: number, ry: number, rw: number, rh: number): number {
  if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return 0;
  const dx = Math.max(rx - px, 0, px - (rx + rw));
  const dy = Math.max(ry - py, 0, py - (ry + rh));
  return Math.sqrt(dx * dx + dy * dy);
}

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

// Find position on safe distance circle around fire, with priority towards water source
function findPositionOnSafeCircle(
  fireX: number, fireY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[], wagons: Wagon[],
  safeDistance: number,
  waterSource: WaterSource | null,
  occupiedPositions: Array<{ x: number; y: number; w: number; h: number }>,
  angleOffset: number = 0
): { x: number; y: number; angle: number } | null {
  // Generate angles to try, with priority towards water source
  const angles: number[] = [];
  
  if (waterSource) {
    // Priority: towards water source
    const angleToWater = Math.atan2(waterSource.y - fireY, waterSource.x - fireX);
    // Add angles around water source direction first
    for (let offset = 0; offset <= Math.PI; offset += Math.PI / 12) {
      angles.push(angleToWater + offset);
      angles.push(angleToWater - offset);
    }
  }
  
  // Add all other angles
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 18) {
    angles.push(angle + angleOffset);
  }
  
  // Remove duplicates and sort by priority
  const uniqueAngles = Array.from(new Set(angles.map(a => a % (Math.PI * 2))));
  
  // Try each angle
  for (const angle of uniqueAngles) {
    const px = fireX + Math.cos(angle) * safeDistance - unitWidth / 2;
    const py = fireY + Math.sin(angle) * safeDistance - unitHeight / 2;
    
    // Check bounds
    if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;
    
    // Check if position is blocked
    if (isPositionBlocked(px, py, unitWidth, unitHeight, obstacles, wagons)) continue;
    
    // Check collision with other units
    let collidesWithUnit = false;
    for (const pos of occupiedPositions) {
      if (rectIntersects(px - 5, py - 5, unitWidth + 10, unitHeight + 10, pos.x, pos.y, pos.w, pos.h)) {
        collidesWithUnit = true;
        break;
      }
    }
    if (collidesWithUnit) continue;
    
    // Calculate angle for unit orientation (facing fire)
    const unitAngle = Math.atan2(fireY - (py + unitHeight / 2), fireX - (px + unitWidth / 2)) * 180 / Math.PI;
    
    return { x: px, y: py, angle: unitAngle };
  }
  
  return null;
}

export function calculateDeployment(
  wagons: Wagon[],
  fireSource: FireSource | null,
  obstacles: Obstacle[],
  resources?: AvailableResources | null,
  waterSource?: WaterSource | null
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
  const totalACNeeded = Math.ceil(2 * intensityMult) + (fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1 : 0);
  const idealAL = (fireSource.type === 'wagon_body' || fireSource.type === 'tank') ? 1 : 0;
  
  // Place all available AC units around the fire
  let acCount = 0;
  while (availAC > 0) {
    const pos = findPositionOnSafeCircle(
      fireX, fireY, 50, 22, obstacles, wagons, safeDist, waterSource || null, occupiedPositions, acCount * 0.3
    );
    if (pos) {
      addUnit({ 
        type: acCount === 0 ? 'aca' : 'ac', 
        name: `АЦ-40 (${acCount + 1})`, 
        x: pos.x, 
        y: pos.y, 
        angle: pos.angle, 
        personnel: 7, 
        hoses: Math.ceil(2 * intensityMult), 
        role: `Позиция ${acCount + 1}` 
      });
      acCount++;
    } else {
      break; // No more positions available
    }
  }

  // Place AL if needed
  if (idealAL > 0 && availAL > 0) {
    const pos = findPositionOnSafeCircle(
      fireX, fireY, 55, 22, obstacles, wagons, safeDist, waterSource || null, occupiedPositions, 0.5
    );
    if (pos) {
      addUnit({ type: 'al', name: 'АЛ-30(40)', x: pos.x, y: pos.y, angle: pos.angle, personnel: 5, hoses: 1, role: 'Подача сверху' });
    }
  }

  // Place ASR
  if (availASR > 0) {
    const pos = findPositionOnSafeCircle(
      fireX, fireY, 50, 22, obstacles, wagons, safeDist, waterSource || null, occupiedPositions, 1.0
    );
    if (pos) {
      addUnit({ type: 'asr', name: 'АСР', x: pos.x, y: pos.y, angle: pos.angle, personnel: 3, hoses: 0, role: 'Штаб / связь' });
    }
  }

  // Warnings
  if (resources) {
    const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;
    const deployedAL = units.filter(u => u.type === 'al').length;
    if (deployedAC < totalACNeeded) warnings.push(`⚠ Размещено ${deployedAC} из ${totalACNeeded} АЦ`);
    if (idealAL > 0 && deployedAL < idealAL) warnings.push(`⚠ Недостаточно АЛ: требуется ${idealAL}, размещено ${deployedAL}`);
  }

  let strategy = '';
  const deployedAC = units.filter(u => u.type === 'aca' || u.type === 'ac').length;
  if (deployedAC >= 4) strategy = 'Атака с 4 направлений. ';
  else if (deployedAC >= 2) strategy = `Атака с ${deployedAC} направлений. `;
  else if (deployedAC === 1) strategy = 'Единственное направление. ';
  else strategy = 'Недостаточно сил! ';
  if (waterSource) strategy += 'С приоритетом от водоисточника. ';
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
