import { Wagon, FireSource, Obstacle, FireUnit, Deployment, AvailableResources, WaterSource } from '../types';

const WAGON_GAP = 6;
const TRACK_Y = 300;
const TRACK_START_X = 279; // Center wagons on canvas (8 wagons × 50 + 7 gaps × 6 = 442, center at 500)
const MIN_DISTANCE_FROM_FIRE = 80; // 40m (min distance from fire)
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

// Find position near water source (about 7.5m = 15 units away)
function findPositionNearWaterSource(
  waterSource: WaterSource,
  fireX: number, fireY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[], wagons: Wagon[],
  occupiedPositions: Array<{ x: number; y: number; w: number; h: number }>
): { x: number; y: number; angle: number } | null {
  const DISTANCE_FROM_WATER = 15; // 7.5m = 15 SVG units
  const TRACK_TOP = 298;
  const TRACK_BOTTOM = 302;
  
  // Try positions around water source
  for (let i = 0; i < 72; i++) {
    const angle = (i * Math.PI * 2) / 72;
    const px = waterSource.x + Math.cos(angle) * DISTANCE_FROM_WATER - unitWidth / 2;
    const py = waterSource.y + Math.sin(angle) * DISTANCE_FROM_WATER - unitHeight / 2;
    
    // Check bounds
    if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;
    
    // Must be on same side of tracks as water source
    const waterAboveTracks = waterSource.y < TRACK_TOP;
    const unitAboveTracks = py + unitHeight / 2 < TRACK_TOP;
    if (waterAboveTracks !== unitAboveTracks) continue;
    
    // Check if position is blocked
    if (isPositionBlocked(px, py, unitWidth, unitHeight, obstacles, wagons)) continue;
    
    // Check collision with other units
    let collidesWithUnit = false;
    for (const pos of occupiedPositions) {
      if (rectIntersects(px, py, unitWidth, unitHeight, pos.x, pos.y, pos.w, pos.h)) {
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

// Find position for unit: max 100m from fire, min 15m from tracks, min 100m from other units
function findPositionOnSafeCircle(
  fireX: number, fireY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[], wagons: Wagon[],
  safeDistance: number,
  waterSource: WaterSource | null,
  occupiedPositions: Array<{ x: number; y: number; w: number; h: number }>,
  angleOffset: number = 0
): { x: number; y: number; angle: number } | null {
  const TRACK_TOP = 298;
  const TRACK_BOTTOM = 302;
  const MIN_DISTANCE_FROM_TRACKS = 30; // 15m = 30 SVG units
  const MAX_DISTANCE_FROM_FIRE = 200; // 100m = 200 SVG units
  const MIN_DISTANCE_BETWEEN_UNITS = 200; // 100m = 200 SVG units

  // Try 72 angles around the fire (every 5 degrees) for better coverage
  for (let i = 0; i < 72; i++) {
    const angle = (i * Math.PI * 2) / 72 + angleOffset;
    
    // Try different distances with smaller step (every 8 units)
    for (let distance = safeDistance; distance <= MAX_DISTANCE_FROM_FIRE; distance += 8) {
      const px = fireX + Math.cos(angle) * distance - unitWidth / 2;
      const py = fireY + Math.sin(angle) * distance - unitHeight / 2;      
      // Check bounds
      if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;
      
      // Check minimum distance from tracks (must be at least 20m above or below)
      const unitCenterY = py + unitHeight / 2;
      const distToTopTrack = Math.abs(unitCenterY - TRACK_TOP);
      const distToBottomTrack = Math.abs(unitCenterY - TRACK_BOTTOM);
      const minDistToTracks = Math.min(distToTopTrack, distToBottomTrack);
      if (minDistToTracks < MIN_DISTANCE_FROM_TRACKS) continue;
      
      // Check if position is blocked
      if (isPositionBlocked(px, py, unitWidth, unitHeight, obstacles, wagons)) continue;
      
      // Check collision with other units (including 100m minimum distance)
      let collidesWithUnit = false;
      for (const pos of occupiedPositions) {
        // Check direct overlap
        if (rectIntersects(px, py, unitWidth, unitHeight, pos.x, pos.y, pos.w, pos.h)) {
          collidesWithUnit = true;
          break;
        }
        // Check minimum distance between units (100m = 200 units)
        const unitCenterX = px + unitWidth / 2;
        const unitCenterY = py + unitHeight / 2;
        const otherCenterX = pos.x + pos.w / 2;
        const otherCenterY = pos.y + pos.h / 2;
        const distBetweenUnits = Math.sqrt((unitCenterX - otherCenterX) ** 2 + (unitCenterY - otherCenterY) ** 2);
        if (distBetweenUnits < MIN_DISTANCE_BETWEEN_UNITS) {
          collidesWithUnit = true;
          break;
        }
      }
      if (collidesWithUnit) continue;
      
      // Calculate angle for unit orientation (facing fire)
      const unitAngle = Math.atan2(fireY - (py + unitHeight / 2), fireX - (px + unitWidth / 2)) * 180 / Math.PI;
      
      return { x: px, y: py, angle: unitAngle };
    }
  }
  
  return null;
}

export function calculateDeployment(
  wagons: Wagon[],
  fireSource: FireSource | null,
  obstacles: Obstacle[],
  resources?: AvailableResources | null,
  waterSources?: WaterSource[]
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
    if (unit.type === 'ac') {
      if (availAC <= 0 || availPersonnel < unit.personnel) return false;
      availAC--;
    } else if (unit.type === 'asa') {
      if (availAL <= 0 || availPersonnel < unit.personnel) return false;
      availAL--;
    } else if (unit.type === 'aso') {
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
  
  // Find nearest water source to fire
  const nearestWaterSource = waterSources && waterSources.length > 0 
    ? waterSources.reduce((nearest, ws) => {
        const dist = Math.sqrt((ws.x - fireX) ** 2 + (ws.y - fireY) ** 2);
        const nearestDist = Math.sqrt((nearest.x - fireX) ** 2 + (nearest.y - fireY) ** 2);
        return dist < nearestDist ? ws : nearest;
      })
    : null;
  
  // Place all available AC units around the fire
  let acCount = 0;
  const maxIterations = 100; // Защита от бесконечного цикла
  let iterations = 0;
  
  while (availAC > 0 && iterations < maxIterations) {
    iterations++;
    // First unit goes near water source, others use normal logic
    const isFirstUnit = acCount === 0 && nearestWaterSource !== null;
    const pos = isFirstUnit 
      ? findPositionNearWaterSource(nearestWaterSource!, fireX, fireY, 50, 22, obstacles, wagons, occupiedPositions)
      : findPositionOnSafeCircle(
          fireX, fireY, 50, 22, obstacles, wagons, safeDist, nearestWaterSource, occupiedPositions, acCount * Math.PI / 6
        );
    if (pos) {
      const success = addUnit({ 
        type: 'ac', 
        name: `АЦ-40 (${acCount + 1})`, 
        x: pos.x, 
        y: pos.y, 
        angle: pos.angle, 
        personnel: 7, 
        hoses: Math.ceil(2 * intensityMult), 
        role: `Позиция ${acCount + 1}` 
      });
      if (success) {
        acCount++;
      } else {
        break; // Не удалось добавить единицу (нехватка ресурсов)
      }
    } else {
      break; // No more positions available
    }
  }
  
  if (iterations >= maxIterations) {
    warnings.push('⚠ Достигнут лимит итераций расстановки');
  }

  // Place ASA if needed
  if (idealAL > 0 && availAL > 0) {
    const pos = findPositionOnSafeCircle(
      fireX, fireY, 55, 22, obstacles, wagons, safeDist, nearestWaterSource, occupiedPositions, 0.5
    );
    if (pos) {
      addUnit({ type: 'asa', name: 'АСА', x: pos.x, y: pos.y, angle: pos.angle, personnel: 5, hoses: 1, role: 'Аварийно-спасательный' });
    }
  }

  // Place ASO
  if (availASR > 0) {
    const pos = findPositionOnSafeCircle(
      fireX, fireY, 50, 22, obstacles, wagons, safeDist, nearestWaterSource, occupiedPositions, 1.0
    );
    if (pos) {
      addUnit({ type: 'aso', name: 'АСО', x: pos.x, y: pos.y, angle: pos.angle, personnel: 3, hoses: 0, role: 'Связь и освещение' });
    }
  }

  // Warnings
  if (resources) {
    const deployedAC = units.filter(u => u.type === 'ac').length;
    const deployedASA = units.filter(u => u.type === 'asa').length;
    if (deployedAC < totalACNeeded) warnings.push(`⚠ Размещено ${deployedAC} из ${totalACNeeded} АЦ`);
    if (idealAL > 0 && deployedASA < idealAL) warnings.push(`⚠ Недостаточно АСА: требуется ${idealAL}, размещено ${deployedASA}`);
  }

  let strategy = '';
  const deployedAC = units.filter(u => u.type === 'ac').length;
  if (deployedAC >= 4) strategy = 'Атака с 4 направлений. ';
  else if (deployedAC >= 2) strategy = `Атака с ${deployedAC} направлений. `;
  else if (deployedAC === 1) strategy = 'Единственное направление. ';
  else strategy = 'Недостаточно сил! ';
  if (nearestWaterSource) strategy += 'С приоритетом от водоисточника. ';
  if (fireSource.type === 'tank') strategy += 'Подача пены на цистерну. ';
  strategy += `Безопасное расстояние: ${(safeDist * 0.5).toFixed(0)} м.`;

  // Generate personnel positions
  const totalPersonnel = units.reduce((s, u) => s + u.personnel, 0);
  const personnelPositions = generatePersonnelPositions(
    fireX, fireY,
    totalPersonnel,
    units,
    obstacles,
    wagons
  );

  return {
    units,
    totalPersonnel,
    totalHoses: units.reduce((s, u) => s + u.hoses, 0),
    strategy,
    warnings,
    safeRadius: safeDist,
    personnelPositions,
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
    const width = 50; // 25m = 50 SVG units
    const height = 7; // 3.5m = 7 SVG units (wagon width)
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

// Generate random positions for personnel
function generatePersonnelPositions(
  fireX: number, fireY: number,
  totalPersonnel: number,
  units: FireUnit[],
  obstacles: Obstacle[],
  wagons: Wagon[]
): Array<{ x: number; y: number }> {
  const TRACK_TOP = 298;
  const TRACK_BOTTOM = 302;
  const MIN_DISTANCE_FROM_FIRE = 40; // 20m = 40 SVG units
  const MAX_DISTANCE_FROM_FIRE = 300; // 150m = 300 SVG units
  
  const positions: Array<{ x: number; y: number }> = [];
  
  // Determine which side of tracks most units are on
  const unitsAboveTracks = units.filter(u => (u.y + 10) < TRACK_TOP).length;
  const unitsBelowTracks = units.filter(u => (u.y + 10) > TRACK_BOTTOM).length;
  const preferAbove = unitsAboveTracks >= unitsBelowTracks;
  
  // Calculate how many people should be on each side (90% on same side as units)
  const peopleOnPreferredSide = Math.ceil(totalPersonnel * 0.9);
  const peopleOnOtherSide = totalPersonnel - peopleOnPreferredSide;
  
  // Generate positions for people on preferred side
  let attempts = 0;
  let generated = 0;
  while (generated < peopleOnPreferredSide && attempts < 1000) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const distance = MIN_DISTANCE_FROM_FIRE + Math.random() * (MAX_DISTANCE_FROM_FIRE - MIN_DISTANCE_FROM_FIRE);
    const px = fireX + Math.cos(angle) * distance;
    const py = fireY + Math.sin(angle) * distance;
    
    // Check if on preferred side
    const isOnPreferredSide = preferAbove ? py < TRACK_TOP : py > TRACK_BOTTOM;
    if (!isOnPreferredSide) continue;
    
    // Check bounds
    if (px < 10 || px > 990 || py < 10 || py > 590) continue;
    
    // Check distance from fire
    const distFromFire = Math.sqrt((px - fireX) ** 2 + (py - fireY) ** 2);
    if (distFromFire < MIN_DISTANCE_FROM_FIRE || distFromFire > MAX_DISTANCE_FROM_FIRE) continue;
    
    // Check if blocked by obstacles or wagons
    if (isPositionBlocked(px - 3, py - 3, 6, 6, obstacles, wagons)) continue;
    
    positions.push({ x: px, y: py });
    generated++;
  }
  
  // Generate positions for people on other side
  attempts = 0;
  generated = 0;
  while (generated < peopleOnOtherSide && attempts < 500) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const distance = MIN_DISTANCE_FROM_FIRE + Math.random() * (MAX_DISTANCE_FROM_FIRE - MIN_DISTANCE_FROM_FIRE);
    const px = fireX + Math.cos(angle) * distance;
    const py = fireY + Math.sin(angle) * distance;
    
    // Check if on other side
    const isOnOtherSide = preferAbove ? py > TRACK_BOTTOM : py < TRACK_TOP;
    if (!isOnOtherSide) continue;
    
    // Check bounds
    if (px < 10 || px > 990 || py < 10 || py > 590) continue;
    
    // Check distance from fire
    const distFromFire = Math.sqrt((px - fireX) ** 2 + (py - fireY) ** 2);
    if (distFromFire < MIN_DISTANCE_FROM_FIRE || distFromFire > MAX_DISTANCE_FROM_FIRE) continue;
    
    // Check if blocked by obstacles or wagons
    if (isPositionBlocked(px - 3, py - 3, 6, 6, obstacles, wagons)) continue;
    
    positions.push({ x: px, y: py });
    generated++;
  }
  
  return positions;
}

export { getTrainCorridor, distanceToRectContour, HOSE_CORRIDOR_DIST };
