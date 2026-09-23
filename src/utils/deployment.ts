import { Wagon, FireSource, Obstacle, FireUnit, Deployment } from '../types';

const WAGON_GAP = 4;
const TRACK_Y = 300;
const TRACK_START_X = 80;

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

function isLineBlocked(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Obstacle[]
): boolean {
  const steps = 30;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    for (const obs of obstacles) {
      if (px >= obs.x && px <= obs.x + obs.width && py >= obs.y && py <= obs.y + obs.height) {
        return true;
      }
    }
  }
  return false;
}

function findAccessiblePosition(
  targetX: number, targetY: number,
  unitWidth: number, unitHeight: number,
  obstacles: Obstacle[],
  preferredSide: 'top' | 'bottom' | 'left' | 'right',
  minDistance: number = 30,
  maxDistance: number = 140
): { x: number; y: number; angle: number } | null {
  const offsets = {
    top: [
      { dx: 0, dy: -1, angle: 90 },
      { dx: -0.7, dy: -1, angle: 125 },
      { dx: 0.7, dy: -1, angle: 55 },
      { dx: -1, dy: -0.7, angle: 145 },
      { dx: 1, dy: -0.7, angle: 35 },
      { dx: -1, dy: 0, angle: 180 },
      { dx: 1, dy: 0, angle: 0 },
    ],
    bottom: [
      { dx: 0, dy: 1, angle: 270 },
      { dx: -0.7, dy: 1, angle: 235 },
      { dx: 0.7, dy: 1, angle: 305 },
      { dx: -1, dy: 0.7, angle: 215 },
      { dx: 1, dy: 0.7, angle: 325 },
      { dx: -1, dy: 0, angle: 180 },
      { dx: 1, dy: 0, angle: 0 },
    ],
    left: [
      { dx: -1, dy: 0, angle: 0 },
      { dx: -1, dy: -0.5, angle: 25 },
      { dx: -1, dy: 0.5, angle: 335 },
      { dx: -0.7, dy: -1, angle: 55 },
      { dx: -0.7, dy: 1, angle: 305 },
    ],
    right: [
      { dx: 1, dy: 0, angle: 180 },
      { dx: 1, dy: -0.5, angle: 155 },
      { dx: 1, dy: 0.5, angle: 205 },
      { dx: 0.7, dy: -1, angle: 125 },
      { dx: 0.7, dy: 1, angle: 235 },
    ],
  };

  const dirs = offsets[preferredSide];

  for (const dir of dirs) {
    for (let dist = minDistance; dist <= maxDistance; dist += 12) {
      const px = targetX + dir.dx * dist;
      const py = targetY + dir.dy * dist;

      // Check bounds
      if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;

      // Check obstacle collision
      if (!isPositionBlocked(px, py, unitWidth, unitHeight, obstacles)) {
        // Check if line of sight is clear
        if (!isLineBlocked(px + unitWidth / 2, py + unitHeight / 2, targetX, targetY, obstacles)) {
          return { x: px, y: py, angle: dir.angle };
        }
      }
    }
  }

  // Second pass - allow blocked line of sight (hoses can go around)
  for (const dir of dirs) {
    for (let dist = minDistance; dist <= maxDistance; dist += 12) {
      const px = targetX + dir.dx * dist;
      const py = targetY + dir.dy * dist;

      if (px < 10 || px + unitWidth > 990 || py < 10 || py + unitHeight > 590) continue;

      if (!isPositionBlocked(px, py, unitWidth, unitHeight, obstacles)) {
        return { x: px, y: py, angle: dir.angle };
      }
    }
  }

  return null;
}

export function calculateDeployment(
  wagons: Wagon[],
  fireSource: FireSource | null,
  obstacles: Obstacle[]
): Deployment | null {
  if (!fireSource) return null;

  const fireWagon = wagons.find(w => w.id === fireSource.wagonId);
  if (!fireWagon) return null;

  const units: FireUnit[] = [];
  let unitId = 1;

  const fireX = fireSource.x;
  const fireY = fireSource.y;

  // Determine intensity-based requirements
  const intensityMultiplier = fireSource.intensity === 'high' ? 2 : fireSource.intensity === 'medium' ? 1.5 : 1;

  // === PRIMARY ATTACK POSITIONS ===

  // Position 1: Top side - primary attack
  const topPos1 = findAccessiblePosition(fireX, fireY, 50, 25, obstacles, 'top', 35, 110);
  if (topPos1) {
    units.push({
      id: `unit-${unitId++}`,
      type: 'aca',
      name: 'АЦ-40 (1/6)',
      x: topPos1.x,
      y: topPos1.y,
      angle: topPos1.angle,
      personnel: 7,
      hoses: Math.ceil(2 * intensityMultiplier),
      role: 'Основной ствол (верх)',
    });
  }

  // Position 2: Bottom side - primary attack
  const bottomPos1 = findAccessiblePosition(fireX, fireY, 50, 25, obstacles, 'bottom', 35, 110);
  if (bottomPos1) {
    units.push({
      id: `unit-${unitId++}`,
      type: 'aca',
      name: 'АЦ-40 (2/6)',
      x: bottomPos1.x,
      y: bottomPos1.y,
      angle: bottomPos1.angle,
      personnel: 7,
      hoses: Math.ceil(2 * intensityMultiplier),
      role: 'Основной ствол (низ)',
    });
  }

  // === FLANK POSITIONS (for medium/high intensity) ===
  if (fireSource.intensity === 'medium' || fireSource.intensity === 'high') {
    // Left flank
    const leftPos = findAccessiblePosition(
      fireWagon.x - 10, fireY, 50, 25, obstacles, 'top', 40, 120
    );
    if (leftPos) {
      units.push({
        id: `unit-${unitId++}`,
        type: 'ac',
        name: 'АЦ-40 (3/6)',
        x: leftPos.x,
        y: leftPos.y,
        angle: leftPos.angle,
        personnel: 6,
        hoses: Math.ceil(1.5 * intensityMultiplier),
        role: 'Левый фланг / защита смежных',
      });
    }
  }

  if (fireSource.intensity === 'high') {
    // Right flank
    const rightPos = findAccessiblePosition(
      fireWagon.x + fireWagon.width + 10, fireY, 50, 25, obstacles, 'top', 40, 120
    );
    if (rightPos) {
      units.push({
        id: `unit-${unitId++}`,
        type: 'ac',
        name: 'АЦ-40 (4/6)',
        x: rightPos.x,
        y: rightPos.y,
        angle: rightPos.angle,
        personnel: 6,
        hoses: 2,
        role: 'Правый фланг / защита смежных',
      });
    }

    // Undercarriage attack (if applicable)
    if (fireSource.type === 'undercarriage') {
      const underPos = findAccessiblePosition(fireX, fireY + 30, 50, 25, obstacles, 'bottom', 25, 80);
      if (underPos) {
        units.push({
          id: `unit-${unitId++}`,
          type: 'ac',
          name: 'АЦ-40 (5/6)',
          x: underPos.x,
          y: underPos.y,
          angle: underPos.angle,
          personnel: 6,
          hoses: 2,
          role: 'Атака ходовой части',
        });
      }
    }
  }

  // === SPECIALIZED UNITS ===

  // Aerial ladder for tall objects
  if (fireSource.type === 'wagon_body' || fireSource.type === 'tank') {
    const ladderPos = findAccessiblePosition(fireX, fireY, 60, 25, obstacles, 'top', 55, 140);
    if (ladderPos) {
      units.push({
        id: `unit-${unitId++}`,
        type: 'al',
        name: 'АЛ-30(40)',
        x: ladderPos.x,
        y: ladderPos.y,
        angle: ladderPos.angle,
        personnel: 5,
        hoses: 1,
        role: 'Подача ОТВ сверху',
      });
    }
  }

  // Foam unit for tank/LV fires
  if (fireSource.type === 'tank') {
    const foamPos = findAccessiblePosition(fireX, fireY, 50, 25, obstacles, 'bottom', 55, 130);
    if (foamPos) {
      units.push({
        id: `unit-${unitId++}`,
        type: 'ap',
        name: 'АП-40(50)',
        x: foamPos.x,
        y: foamPos.y,
        angle: foamPos.angle,
        personnel: 6,
        hoses: 2,
        role: 'Пенная атака цистерны',
      });
    }
  }

  // === SUPPORT UNITS ===

  // Command/communication vehicle
  const reservePos = findAccessiblePosition(fireX, fireY, 50, 25, obstacles, 'top', 90, 170);
  if (reservePos) {
    units.push({
      id: `unit-${unitId++}`,
      type: 'asr',
      name: 'АСР',
      x: reservePos.x,
      y: reservePos.y,
      angle: reservePos.angle,
      personnel: 4,
      hoses: 0,
      role: 'Штаб / связь / резерв',
    });
  }

  // === DETERMINE STRATEGY ===
  let strategy = '';

  if (fireSource.intensity === 'high') {
    strategy = 'Локализация и ликвидация с трёх-четырёх направлений. ';
    strategy += 'Охлаждение смежных вагонов. ';
    if (fireSource.type === 'tank') {
      strategy += 'Пенная атака на цистерну. Контроль растекания ГЖ. ';
    }
    strategy += 'Защита соседних путей и объектов.';
  } else if (fireSource.intensity === 'medium') {
    strategy = 'Атака с двух направлений (верх/низ). ';
    strategy += 'Защита смежных вагонов водяными завесами. ';
    if (fireSource.type === 'tank') {
      strategy += 'Пенное тушение резервуара. ';
    }
    strategy += 'Контроль распространения огня.';
  } else {
    strategy = 'Локализация пожара. ';
    strategy += 'Подача стволов с ближайших доступных направлений. ';
    strategy += 'Разведка и дотушивание.';
  }

  if (fireSource.type === 'undercarriage') {
    strategy += ' Особое внимание: тушение ходовой части снизу.';
  }

  // Check if obstacles significantly limit access
  const topAccess = findAccessiblePosition(fireX, fireY, 50, 25, obstacles, 'top', 30, 50);
  const bottomAccess = findAccessiblePosition(fireX, fireY, 50, 25, obstacles, 'bottom', 30, 50);
  if (!topAccess || !bottomAccess) {
    strategy += ' ⚠ Ограниченный доступ! Требуется прокладка дополнительных рукавных линий.';
  }

  const totalPersonnel = units.reduce((sum, u) => sum + u.personnel, 0);
  const totalHoses = units.reduce((sum, u) => sum + u.hoses, 0);

  return {
    units,
    totalPersonnel,
    totalHoses,
    strategy,
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
    const width = types[i] === 'platform' ? 90 : 100;
    wagons.push({
      id: i + 1,
      x: currentX,
      y: TRACK_Y - 20,
      width,
      height: 40,
      type: types[i],
      label: labels[i],
    });
    currentX += width + WAGON_GAP;
  }

  return wagons;
}
