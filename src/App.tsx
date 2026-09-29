import { useState, useCallback, useRef, useMemo } from 'react';
import { Wagon, FireSource, Obstacle, Deployment, ToolMode, ObstacleType, AvailableResources, FireUnit, WaterSource, FireTrain } from './types';
import { calculateDeployment, generateDefaultWagons, getIdealResources, getTrainCorridor, distanceToRectContour, HOSE_CORRIDOR_DIST } from './utils/deployment';
import html2canvas from 'html2canvas';

const WAGON_GAP = 6;
const TRACK_Y = 300;
const HOSE_SEGMENT_LENGTH = 40; // 20m
const NOZZLE_DISTANCE_FROM_WAGON = 11; // 5-6m from wagon contour
const MIN_NOZZLE_DISTANCE_FROM_FIRE = 6; // 3m from fire

const OBSTACLE_DEFAULTS: Record<ObstacleType, { width: number; height: number; label: string; icon: string }> = {
  building: { width: 80, height: 60, label: 'Здание', icon: '🏢' },
  fence: { width: 100, height: 15, label: 'Забор', icon: '🚧' },
  equipment: { width: 40, height: 30, label: 'Техника', icon: '🚜' },
  depot: { width: 90, height: 50, label: 'Депо', icon: '🏭' },
  tree_group: { width: 50, height: 50, label: 'Деревья', icon: '🌲' },
  road: { width: 120, height: 25, label: 'Дорога', icon: '🛤' },
};

const DEFAULT_RESOURCES: AvailableResources = { ac: 2, al: 0, asr: 0, personnel: 12 };

type WagonType = 'passenger' | 'freight' | 'tank' | 'platform';
const WAGON_TYPE_INFO: Record<WagonType, { label: string; icon: string; color: string }> = {
  passenger: { label: 'Пассажирский', icon: '🚃', color: '#3a4a5a' },
  freight: { label: 'Грузовой', icon: '📦', color: '#5a4a3a' },
  tank: { label: 'Цистерна', icon: '🛢', color: '#3a5a35' },
  platform: { label: 'Платформа', icon: '🚛', color: '#4a4a4a' },
};

interface ManualUnit extends FireUnit {
  division: string;
  ptvDeployed: boolean;
}

interface DragState {
  type: 'unit' | 'nozzle' | 'obstacle' | 'branch' | 'firefighter' | 'personnel' | 'pump';
  id: string;
  unitId?: string;
  offsetX: number;
  offsetY: number;
}

interface CustomPositions {
  [unitId: string]: {
    branchPoint?: { x: number; y: number };
    nozzles?: Array<{ x: number; y: number }>;
  };
}

interface SelectedElement {
  type: 'unit' | 'obstacle' | 'firefighter' | 'branch';
  id: string;
  unitId?: string;
  startX: number;
  startY: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// Find shortest path avoiding obstacles and wagons
function findShortestPath(
  fromX: number, fromY: number, toX: number, toY: number,
  wagons: Wagon[], obstacles: Obstacle[]
): Array<{ x: number; y: number }> {
  // Check if direct line is clear
  const directClear = !lineCrossesBlockingObstacle(fromX, fromY, toX, toY, obstacles, wagons, 3);
  if (directClear) {
    return [{ x: fromX, y: fromY }, { x: toX, y: toY }];
  }

  // Need to find waypoints around obstacles
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [{ x: fromX, y: fromY }];

  // Perpendicular direction
  const perpX = -dy / len;
  const perpY = dx / len;

  // Try different offset distances and directions
  for (let offset = 30; offset <= 200; offset += 15) {
    for (const sign of [1, -1]) {
      const midX = (fromX + toX) / 2 + perpX * offset * sign;
      const midY = (fromY + toY) / 2 + perpY * offset * sign;

      if (midX < 5 || midX > 995 || midY < 5 || midY > 595) continue;
      if (isPointInBlockingObstacle(midX, midY, obstacles, wagons)) continue;

      if (!lineCrossesBlockingObstacle(fromX, fromY, midX, midY, obstacles, wagons, 3) &&
          !lineCrossesBlockingObstacle(midX, midY, toX, toY, obstacles, wagons, 3)) {
        return [{ x: fromX, y: fromY }, { x: midX, y: midY }, { x: toX, y: toY }];
      }
    }
  }

  // Fallback: direct path
  return [{ x: fromX, y: fromY }, { x: toX, y: toY }];
}

// Check if line crosses obstacles
function lineCrossesBlockingObstacle(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Obstacle[], wagons: Wagon[], margin: number = 0
): boolean {
  for (const obs of obstacles) {
    if (obs.type === 'road' || obs.type === 'tree_group' || obs.type === 'equipment') continue;
    if (lineIntersectsRect(x1, y1, x2, y2, obs.x, obs.y, obs.width, obs.height, margin)) {
      return true;
    }
  }
  for (const wagon of wagons) {
    if (lineIntersectsRect(x1, y1, x2, y2, wagon.x, wagon.y, wagon.width, wagon.height, margin)) {
      return true;
    }
  }
  return false;
}

function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number, margin: number = 0
): boolean {
  const steps = 30;
  const expandedRx = rx - margin;
  const expandedRy = ry - margin;
  const expandedRw = rw + margin * 2;
  const expandedRh = rh + margin * 2;
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= expandedRx && px <= expandedRx + expandedRw && 
        py >= expandedRy && py <= expandedRy + expandedRh) {
      return true;
    }
  }
  return false;
}

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

// Hose routing - shortest path from unit to fire
// Функция для генерации точек пятиугольника автомобиля (кабина + кузов + насос)
// Согласно боевому уставу: темный квадратик - насос, острый угол - кабина
function getFireTruckPoints(x: number, y: number, angle: number): string {
  // Автомобиль в масштабе: длина ~16 единиц (8м), ширина ~5 единиц (2.5м)
  const truckLength = 16;
  const truckWidth = 5;
  
  // Определяем направление кабины в зависимости от угла
  // Угол 0° - автомобиль смотрит вправо, кабина справа
  // Угол 90° - смотрит вниз
  // Угол 180° - смотрит влево, кабина слева
  // Угол 270° - смотрит вверх
  
  // Нормализуем угол
  const normalizedAngle = ((angle % 360) + 360) % 360;
  
  // Определяем, с какой стороны кабина (острый угол)
  const isCabinRight = normalizedAngle < 90 || normalizedAngle > 270;
  
  let points: Array<{x: number, y: number}>;
  
  if (isCabinRight) {
    // Кабина справа (острый угол справа)
    points = [
      { x: x - truckLength/2, y: y - truckWidth/2 }, // верхний левый (насос)
      { x: x - truckLength/2, y: y + truckWidth/2 }, // нижний левый (насос)
      { x: x + truckLength/2 - 2, y: y + truckWidth/2 }, // нижний правый
      { x: x + truckLength/2 + 2, y: y }, // острый угол кабины (справа)
      { x: x + truckLength/2 - 2, y: y - truckWidth/2 }, // верхний правый
    ];
  } else {
    // Кабина слева (острый угол слева)
    points = [
      { x: x - truckLength/2 - 2, y: y }, // острый угол кабины (слева)
      { x: x - truckLength/2 + 2, y: y + truckWidth/2 }, // нижний левый
      { x: x + truckLength/2, y: y + truckWidth/2 }, // нижний правый (насос)
      { x: x + truckLength/2, y: y - truckWidth/2 }, // верхний правый (насос)
      { x: x - truckLength/2 + 2, y: y - truckWidth/2 }, // верхний левый
    ];
  }
  
  return points.map(p => `${p.x},${p.y}`).join(' ');
}

// Функция для получения координат насоса автомобиля (внутри контура автомобиля)
function getPumpPosition(unitX: number, unitY: number, unitWidth: number, unitHeight: number, angle: number): { x: number; y: number } {
  // Реальные размеры автомобиля (как в getFireTruckPoints)
  const truckLength = 16;
  
  // Центр автомобиля (unitX, unitY - это верхний левый угол bounding box)
  const centerX = unitX + unitWidth / 2;
  const centerY = unitY + unitHeight / 2;
  
  // Нормализуем угол (угол указывает направление от автомобиля к пожару)
  const normalizedAngle = ((angle % 360) + 360) % 360;
  
  // Насос находится с той стороны автомобиля, которая обращена к пожару
  // Это обеспечивает, что рукав начинается непосредственно у автомобиля
  if (normalizedAngle >= 315 || normalizedAngle < 45) {
    // Пожар справа - насос справа
    return { x: centerX + truckLength / 2 - 1, y: centerY };
  } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
    // Пожар снизу - насос снизу
    return { x: centerX, y: centerY + 2 };
  } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
    // Пожар слева - насос слева
    return { x: centerX - truckLength / 2 + 1, y: centerY };
  } else {
    // Пожар сверху - насос сверху
    return { x: centerX, y: centerY - 2 };
  }
}

function routeHoseAlongCorridor(
  unitX: number, unitY: number, unitWidth: number, unitHeight: number,
  fireX: number, fireY: number,
  wagons: Wagon[], obstacles: Obstacle[],
  customBranchPoint?: { x: number; y: number },
  customNozzles?: Array<{ x: number; y: number }>,
  unitAngle?: number,
  customPumpPos?: { x: number; y: number }
): { path: Array<{ x: number; y: number }>; branchPoint: { x: number; y: number }; nozzles: Array<{ x: number; y: number }>; branchConnections: Array<{ x: number; y: number }> } {
  const unitCenterX = unitX + unitWidth / 2;
  const unitCenterY = unitY + unitHeight / 2;
  
  // Получаем координаты насоса (пользовательские или расчётные)
  const pumpPos = customPumpPos || (unitAngle !== undefined ? getPumpPosition(unitX, unitY, unitWidth, unitHeight, unitAngle) : { x: unitCenterX, y: unitCenterY });
  
  const angleToFire = Math.atan2(fireY - pumpPos.y, fireX - pumpPos.x);
  const distToFire = Math.sqrt((pumpPos.x - fireX) ** 2 + (pumpPos.y - fireY) ** 2);
  // Branch point: must be at least 30m (60 units) from tracks, max 40m (80 units) from unit
  const TRACK_TOP = 298; // 1.6m = 3.2 units gap between rails
  const TRACK_BOTTOM = 302;
  const MIN_BRANCH_DISTANCE_FROM_TRACKS = 60; // 30m = 60 SVG units
  const MAX_BRANCH_DISTANCE_FROM_UNIT = 80; // 40m = 80 SVG units
  
  let branchX: number, branchY: number;
  if (customBranchPoint) {
    branchX = customBranchPoint.x;
    branchY = customBranchPoint.y;
  } else {
    // Calculate initial branch position
    const branchDist = Math.min(distToFire * 0.7, MAX_BRANCH_DISTANCE_FROM_UNIT);
    branchX = pumpPos.x + Math.cos(angleToFire) * branchDist;
    branchY = pumpPos.y + Math.sin(angleToFire) * branchDist;
    
    // Determine which side of tracks the unit is on
    const unitAboveTracks = unitCenterY < TRACK_TOP;
    
    // Ensure branch is on same side as unit and at least 30m from tracks
    if (unitAboveTracks) {
      // Branch must be above tracks
      const minY = TRACK_TOP - MIN_BRANCH_DISTANCE_FROM_TRACKS;
      if (branchY > minY) {
        branchY = minY;
      }
    } else {
      // Branch must be below tracks
      const maxY = TRACK_BOTTOM + MIN_BRANCH_DISTANCE_FROM_TRACKS;
      if (branchY < maxY) {
        branchY = maxY;
      }
    }
    
    // Ensure branch is not too far from pump (max 40m)
    const distToPump = Math.sqrt((branchX - pumpPos.x) ** 2 + (branchY - pumpPos.y) ** 2);
    if (distToPump > MAX_BRANCH_DISTANCE_FROM_UNIT) {
      const scale = MAX_BRANCH_DISTANCE_FROM_UNIT / distToPump;
      branchX = pumpPos.x + (branchX - pumpPos.x) * scale;
      branchY = pumpPos.y + (branchY - pumpPos.y) * scale;
    }
  }

  // Find shortest path from pump to branch point
  const path = findShortestPath(pumpPos.x, pumpPos.y, branchX, branchY, wagons, obstacles);
  
  // Nozzles: 5-6m from fire wagon, at least 3m (6 units) from tracks on unit's side
  const nozzles: Array<{ x: number; y: number }> = [];  
  // Determine which side of tracks the unit is on
  const MIN_DISTANCE_FROM_TRACKS = 6; // 3m = 6 SVG units
  const unitAboveTracks = unitCenterY < TRACK_TOP;
  
  // Calculate default nozzle positions - both on same side as unit, at least 3m from tracks
  const defaultNozzles: Array<{ x: number; y: number }> = [];
  
  // Base positions near fire (20m = 40 units apart to ensure minimum 8m/16 units after adjustments)
  const baseNozzle1X = fireX - 20;
  const baseNozzle2X = fireX + 20;
  let baseNozzle1Y = fireY;
  let baseNozzle2Y = fireY;
  
  // Ensure minimum distance from tracks
  if (unitAboveTracks) {
    // Both nozzles above tracks
    const minY = TRACK_TOP - MIN_DISTANCE_FROM_TRACKS;
    baseNozzle1Y = Math.min(baseNozzle1Y, minY);
    baseNozzle2Y = Math.min(baseNozzle2Y, minY);
  } else {
    // Both nozzles below tracks
    const maxY = TRACK_BOTTOM + MIN_DISTANCE_FROM_TRACKS;
    baseNozzle1Y = Math.max(baseNozzle1Y, maxY);
    baseNozzle2Y = Math.max(baseNozzle2Y, maxY);
  }
  
  defaultNozzles.push({ x: baseNozzle1X, y: baseNozzle1Y });
  defaultNozzles.push({ x: baseNozzle2X, y: baseNozzle2Y });

  // Adjust nozzle positions to ensure minimum distance from wagon contour
  for (let i = 0; i < defaultNozzles.length; i++) {
    let nozzleX = defaultNozzles[i].x;
    let nozzleY = defaultNozzles[i].y;

    // Ensure minimum distance from fire
    const distToFireCheck = Math.sqrt((nozzleX - fireX) ** 2 + (nozzleY - fireY) ** 2);
    if (distToFireCheck < MIN_NOZZLE_DISTANCE_FROM_FIRE) {
      const angle = Math.atan2(nozzleY - fireY, nozzleX - fireX);
      nozzleX = fireX + Math.cos(angle) * (MIN_NOZZLE_DISTANCE_FROM_FIRE + 2);
      nozzleY = fireY + Math.sin(angle) * (MIN_NOZZLE_DISTANCE_FROM_FIRE + 2);
    }

    // Ensure distance from wagon contour
    for (let attempt = 0; attempt < 10; attempt++) {
      let tooClose = false;
      for (const wagon of wagons) {
        const dist = distanceToRectContour(nozzleX, nozzleY, wagon.x, wagon.y, wagon.width, wagon.height);
        if (dist < NOZZLE_DISTANCE_FROM_WAGON) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) break;
      const angle = Math.atan2(nozzleY - fireY, nozzleX - fireX);
      const currentDist = Math.sqrt((nozzleX - fireX) ** 2 + (nozzleY - fireY) ** 2);
      nozzleX = fireX + Math.cos(angle) * (currentDist + 3);
      nozzleY = fireY + Math.sin(angle) * (currentDist + 3);
    }

    defaultNozzles[i] = { x: nozzleX, y: nozzleY };
  }

  // Use custom positions if valid, otherwise use defaults
  if (customNozzles && customNozzles.length > 0) {
    for (let i = 0; i < defaultNozzles.length; i++) {
      const custom = customNozzles[i];
      // Check if custom position is valid (not zero/undefined)
      if (custom && (custom.x !== 0 || custom.y !== 0)) {
        nozzles.push({ x: custom.x, y: custom.y });
      } else {
        nozzles.push(defaultNozzles[i]);
      }
    }
  } else {
    nozzles.push(...defaultNozzles);
  }

  // Ensure minimum distance between nozzles (4m = 8 units) - STRICT RULE
  const MIN_DISTANCE_BETWEEN_NOZZLES = 8;
  if (nozzles.length >= 2) {
    // Repeat check multiple times to ensure compliance after all adjustments
    for (let iteration = 0; iteration < 5; iteration++) {
      for (let i = 0; i < nozzles.length; i++) {
        for (let j = i + 1; j < nozzles.length; j++) {
          const dist = Math.sqrt((nozzles[i].x - nozzles[j].x) ** 2 + (nozzles[i].y - nozzles[j].y) ** 2);
          if (dist < MIN_DISTANCE_BETWEEN_NOZZLES) {
            // Move nozzles apart
            const angle = Math.atan2(nozzles[j].y - nozzles[i].y, nozzles[j].x - nozzles[i].x);
            const moveDist = (MIN_DISTANCE_BETWEEN_NOZZLES - dist) / 2 + 1; // Add 1 unit buffer
            nozzles[i].x -= Math.cos(angle) * moveDist;
            nozzles[i].y -= Math.sin(angle) * moveDist;
            nozzles[j].x += Math.cos(angle) * moveDist;
            nozzles[j].y += Math.sin(angle) * moveDist;
          }
        }
      }
    }
  }

  // Calculate branch connections (отсечки) for hoses after branch point
  // Each hose segment is 20m (40 SVG units)
  const branchConnections: Array<{ x: number; y: number }> = [];
  const HOSE_SEGMENT_LENGTH = 40; // 20m = 40 SVG units
  
  for (const nozzle of nozzles) {
    const dx = nozzle.x - branchX;
    const dy = nozzle.y - branchY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // If distance is more than 20m, add connection points
    if (dist > HOSE_SEGMENT_LENGTH) {
      const numSegments = Math.floor(dist / HOSE_SEGMENT_LENGTH);
      const segDx = dx / dist;
      const segDy = dy / dist;
      
      for (let i = 1; i <= numSegments; i++) {
        const connX = branchX + segDx * (i * HOSE_SEGMENT_LENGTH);
        const connY = branchY + segDy * (i * HOSE_SEGMENT_LENGTH);
        branchConnections.push({ x: connX, y: connY });
      }
    }
  }

  return { path, branchPoint: { x: branchX, y: branchY }, nozzles, branchConnections };
}

export default function App() {
  const [wagons, setWagons] = useState<Wagon[]>(generateDefaultWagons());
  const [fireSource, setFireSource] = useState<FireSource | null>(null);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('none');
  const [obstacleType, setObstacleType] = useState<ObstacleType>('building');
  const [fireIntensity, setFireIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [fireType, setFireType] = useState<'wagon_body' | 'tank' | 'undercarriage' | 'cargo'>('wagon_body');
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [manualUnits, setManualUnits] = useState<ManualUnit[]>([]);
  const [placingUnit, setPlacingUnit] = useState<FireUnit['type'] | null>(null);
  const [fireTrains, setFireTrains] = useState<FireTrain[]>([]);
  const [selectedFireTrainId, setSelectedFireTrainId] = useState<string | null>(null);
  const [fireTrainPTW, setFireTrainPTW] = useState<Record<string, boolean>>({});
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedWagonId, setSelectedWagonId] = useState<number | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [customPumpPositions, setCustomPumpPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [resources, setResources] = useState<AvailableResources>(DEFAULT_RESOURCES);
  const [useCustomResources, setUseCustomResources] = useState(false);
  const [customPositions, setCustomPositions] = useState<CustomPositions>({});
  const [waterSources, setWaterSources] = useState<WaterSource[]>([]);
  const [waterSourceType, setWaterSourceType] = useState<'pond' | 'river'>('pond');
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [scale, setScale] = useState(1);
  const [rulerPoints, setRulerPoints] = useState<Array<{ x: number; y: number }>>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const idealResources = useMemo(() => fireSource ? getIdealResources(fireSource) : null, [fireSource]);

  const getSVGCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // Получаем текущий viewBox
    const viewBox = svg.viewBox.baseVal;
    // Преобразуем координаты мыши в координаты SVG
    const x = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const y = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;
    return { x, y };
  }, [scale]);

  const handleSVGClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragState) return;
    const { x, y } = getSVGCoords(e);

    if (placingUnit) {
      const newUnit: ManualUnit = {
        id: `manual-${Date.now()}`,
        type: placingUnit,
        name: placingUnit === 'asa' ? 'АСА' : placingUnit === 'aso' ? 'АСО' : 'АЦ-40',
        x: x - 22,
        y: y - 10,
        angle: 0,
        personnel: placingUnit === 'asa' ? 5 : placingUnit === 'aso' ? 3 : 7,
        hoses: 0,
        role: 'Добавлен вручную',
        safeDistance: 200,
        division: '',
        ptvDeployed: false,
      };
      setManualUnits(prev => [...prev, newUnit]);
      setPlacingUnit(null);
      return;
    }

    if (toolMode === 'fire') {
      const clickedWagon = wagons.find(w => x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height);
      if (clickedWagon) {
        setFireSource({ wagonId: clickedWagon.id, x, y, intensity: fireIntensity, type: fireType });
        setDeployment(null);
      }
    } else if (toolMode === 'obstacle') {
      const defaults = OBSTACLE_DEFAULTS[obstacleType];
      setObstacles(prev => [...prev, {
        id: `obs-${Date.now()}`,
        x: x - defaults.width / 2,
        y: y - defaults.height / 2,
        width: defaults.width,
        height: defaults.height,
        type: obstacleType,
        label: defaults.label,
      }]);
      setDeployment(null);
    } else if (toolMode === 'water') {
      if (waterSources.length >= 4) {
        alert('Максимум 4 водоисточника');
        return;
      }
      const labels = { pond: 'Водоём', river: 'Река' };
      const newWaterSource: WaterSource = {
        id: `water-${Date.now()}`,
        x,
        y,
        type: waterSourceType,
        label: labels[waterSourceType],
      };
      setWaterSources(prev => [...prev, newWaterSource]);
      setDeployment(null);
      setToolMode('none');
    } else if (toolMode === 'ruler') {
      // Добавляем точку для измерения
      setRulerPoints(prev => {
        const newPoints = [...prev, { x, y }];
        // Оставляем только последние 2 точки
        if (newPoints.length > 2) {
          return newPoints.slice(-2);
        }
        return newPoints;
      });
      return;
    } else {
      // Check wagon click for type change
      const clickedWagon = wagons.find(w => x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height);
      if (clickedWagon) {
        setSelectedWagonId(clickedWagon.id);
        setSelectedUnitId(null);
      } else {
        // Check unit click
        const allUnits = [...(deployment?.units || []), ...manualUnits];
        const clickedUnit = allUnits.find(u => {
          const w = u.type === 'asa' ? 55 : 44;
          return x >= u.x && x <= u.x + w && y >= u.y && y <= u.y + 20;
        });
        if (clickedUnit) {
          setSelectedUnitId(clickedUnit.id);
          setSelectedWagonId(null);
        } else {
          setSelectedWagonId(null);
          setSelectedUnitId(null);
        }
      }
    }
  }, [toolMode, wagons, fireIntensity, fireType, obstacleType, getSVGCoords, dragState, placingUnit, deployment, manualUnits, waterSourceType, rulerPoints]);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'unit' | 'nozzle' | 'obstacle' | 'branch' | 'firefighter', id: string, unitId?: string) => {
    // Allow dragging in select mode for all types
    // Allow dragging firefighters and branches in any mode (including 'none')
    if (toolMode !== 'select' && toolMode !== 'none') {
      if (type !== 'firefighter' && type !== 'branch') return;
    }
    e.stopPropagation();
    const { x, y } = getSVGCoords(e);

    if (type === 'obstacle') {
      const obs = obstacles.find(o => o.id === id);
      if (obs) {
        setDragState({ type, id, offsetX: x - obs.x, offsetY: y - obs.y });
      }
    } else if (type === 'unit') {
      const allUnits = [...(deployment?.units || []), ...manualUnits];
      const unit = allUnits.find(u => u.id === id);
      if (unit) {
        setDragState({ type, id, offsetX: x - unit.x, offsetY: y - unit.y });
      }
    } else if (type === 'branch' || type === 'firefighter') {
      // For branch points and firefighters, we need to track their position in customPositions
      setDragState({ type, id, unitId, offsetX: x, offsetY: y });
    }
  }, [toolMode, obstacles, getSVGCoords, deployment, manualUnits, selectedElements, fireSource, customPositions, wagons]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = getSVGCoords(e);
    
    // Рисование прямоугольника выделения
    if (isSelecting && selectionBox) {
      setSelectionBox({
        ...selectionBox,
        endX: x,
        endY: y
      });
      return;
    }
    
    // Групповое перемещение выделенных элементов
    if (dragState && selectedElements.length > 1) {
      const deltaX = x - dragState.offsetX;
      const deltaY = y - dragState.offsetY;
      
      selectedElements.forEach(elem => {
        let moveX = elem.startX + deltaX;
        let moveY = elem.startY + deltaY;
        
        // Ограничение перемещения: не дальше 2 км (400 единиц) от очага
        if (fireSource) {
          const distFromFire = Math.sqrt((moveX - fireSource.x) ** 2 + (moveY - fireSource.y) ** 2);
          if (distFromFire > 700) {
            const angle = Math.atan2(moveY - fireSource.y, moveX - fireSource.x);
            moveX = fireSource.x + Math.cos(angle) * 700;
            moveY = fireSource.y + Math.sin(angle) * 700;
          }
        }
        
        // Ограничение границами карты
        moveX = Math.max(10, Math.min(990, moveX));
        moveY = Math.max(10, Math.min(590, moveY));
        
        if (elem.type === 'unit') {
          // Проверяем, в каком массиве находится техника
          const isManualUnit = manualUnits.some(u => u.id === elem.id);
          const isDeploymentUnit = deployment?.units.some(u => u.id === elem.id);
          
          // Update manualUnits
          if (isManualUnit) {
            setManualUnits(prev => prev.map(u =>
              u.id === elem.id ? { ...u, x: moveX, y: moveY } : u
            ));
          }
          
          // Update deployment units
          if (isDeploymentUnit && deployment) {
            setDeployment({
              ...deployment,
              units: deployment.units.map(u =>
                u.id === elem.id ? { ...u, x: moveX, y: moveY } : u
              ),
            });
          }
        } else if (elem.type === 'obstacle') {
          setObstacles(prev => prev.map(o =>
            o.id === elem.id ? { ...o, x: moveX, y: moveY } : o
          ));
        } else if (elem.type === 'firefighter' && elem.unitId) {
          const nozzleIndex = parseInt(elem.id.split('-').pop() || '0');
          setCustomPositions(prev => {
            const positions = prev[elem.unitId!] || {};
            const nozzles = positions.nozzles || [];
            const newNozzles = [...nozzles];
            if (nozzleIndex < newNozzles.length) {
              newNozzles[nozzleIndex] = { x: moveX, y: moveY };
            }
            return {
              ...prev,
              [elem.unitId!]: {
                ...positions,
                nozzles: newNozzles
              }
            };
          });
        } else if (elem.type === 'branch' && elem.unitId) {
          setCustomPositions(prev => ({
            ...prev,
            [elem.unitId!]: {
              ...prev[elem.unitId!],
              branchPoint: { x: moveX, y: moveY }
            }
          }));
        }
      });
      return;
    }
    
    if (!dragState) return;

    if (dragState.type === 'obstacle') {
      let newX = x - dragState.offsetX;
      let newY = y - dragState.offsetY;
      
      // Ограничение границами карты
      newX = Math.max(10, Math.min(990, newX));
      newY = Math.max(10, Math.min(590, newY));
      
      setObstacles(prev => prev.map(o =>
        o.id === dragState.id ? { ...o, x: newX, y: newY } : o
      ));
    } else if (dragState.type === 'unit') {
      let newX = x - dragState.offsetX;
      let newY = y - dragState.offsetY;
      
      // Ограничение перемещения: не дальше 2 км (400 единиц) от очага
      if (fireSource) {
        const distFromFire = Math.sqrt((newX - fireSource.x) ** 2 + (newY - fireSource.y) ** 2);
        if (distFromFire > 700) {
          const angle = Math.atan2(newY - fireSource.y, newX - fireSource.x);
          newX = fireSource.x + Math.cos(angle) * 700;
          newY = fireSource.y + Math.sin(angle) * 700;
        }
      }
      
      // Ограничение границами карты
      newX = Math.max(10, Math.min(990, newX));
      newY = Math.max(10, Math.min(590, newY));
      
      // Проверяем, в каком массиве находится техника
      const isManualUnit = manualUnits.some(u => u.id === dragState.id);
      const isDeploymentUnit = deployment?.units.some(u => u.id === dragState.id);
      
      // Update manualUnits
      if (isManualUnit) {
        setManualUnits(prev => prev.map(u =>
          u.id === dragState.id ? { ...u, x: newX, y: newY } : u
        ));
      }
      
      // Update deployment units
      if (isDeploymentUnit && deployment) {
        setDeployment({
          ...deployment,
          units: deployment.units.map(u =>
            u.id === dragState.id ? { ...u, x: newX, y: newY } : u
          ),
        });
      }
    } else if (dragState.type === 'branch' && dragState.unitId) {
      // Update branch point position
      let branchX = x;
      let branchY = y;
      
      // Ограничение перемещения: не дальше 2 км (400 единиц) от очага
      if (fireSource) {
        const distFromFire = Math.sqrt((branchX - fireSource.x) ** 2 + (branchY - fireSource.y) ** 2);
        if (distFromFire > 700) {
          const angle = Math.atan2(branchY - fireSource.y, branchX - fireSource.x);
          branchX = fireSource.x + Math.cos(angle) * 700;
          branchY = fireSource.y + Math.sin(angle) * 700;
        }
      }
      
      // Ограничение границами карты
      branchX = Math.max(10, Math.min(990, branchX));
      branchY = Math.max(10, Math.min(590, branchY));
      
      setCustomPositions(prev => ({
        ...prev,
        [dragState.unitId!]: {
          ...prev[dragState.unitId!],
          branchPoint: { x: branchX, y: branchY }
        }
      }));
    } else if (dragState.type === 'firefighter' && dragState.unitId) {
      // Update nozzle position (firefighter/nozzle)
      const nozzleIndex = parseInt(dragState.id.split('-').pop() || '0');
      
      setCustomPositions(prev => {
        const positions = prev[dragState.unitId!] || {};
        const nozzles = positions.nozzles || [];
        const newNozzles = [...nozzles];
        
        // If this is the first drag for this unit, initialize all nozzle positions
        if (newNozzles.length === 0) {
          // Get the unit to calculate initial positions
          const allUnits = [...(deployment?.units || []), ...manualUnits];
          const unit = allUnits.find(u => u.id === dragState.unitId);
          
          if (unit && fireSource) {
            const unitWidth = unit.type === 'asa' ? 55 : 44;
            const unitCenterX = unit.x + unitWidth / 2;
            const unitCenterY = unit.y + 10;
            const angleToFire = Math.atan2(fireSource.y - unitCenterY, fireSource.x - unitCenterX);
            
            // Initialize both nozzle positions (for 2 nozzles per unit)
            const nozzleAngles = [angleToFire - 0.4, angleToFire + Math.PI + 0.4];
            for (const angle of nozzleAngles) {
              const nozzleX = fireSource.x + Math.cos(angle) * 12;
              const nozzleY = fireSource.y + Math.sin(angle) * 12;
              newNozzles.push({ x: nozzleX, y: nozzleY });
            }
          } else {
            // Не добавляем позиции, если не можем их корректно рассчитать
            return prev;
          }
        }
        
        // Update only the dragged nozzle
        if (nozzleIndex < newNozzles.length) {
          let nozzleX = x;
          let nozzleY = y;
          
          // Ограничение перемещения: не дальше 2 км (400 единиц) от очага
          if (fireSource) {
            const distFromFire = Math.sqrt((nozzleX - fireSource.x) ** 2 + (nozzleY - fireSource.y) ** 2);
            if (distFromFire > 700) {
              const angle = Math.atan2(nozzleY - fireSource.y, nozzleX - fireSource.x);
              nozzleX = fireSource.x + Math.cos(angle) * 700;
              nozzleY = fireSource.y + Math.sin(angle) * 700;
            }
          }
          
          // Ограничение границами карты
          nozzleX = Math.max(10, Math.min(990, nozzleX));
          nozzleY = Math.max(10, Math.min(590, nozzleY));
          
          newNozzles[nozzleIndex] = { x: nozzleX, y: nozzleY };
        }
        
        return {
          ...prev,
          [dragState.unitId!]: {
            ...positions,
            nozzles: newNozzles
          }
        };
      });
    } else if (dragState.type === 'personnel') {
      // Update personnel position
      const personnelIndex = parseInt(dragState.id.split('-')[1]);
      let newX = x - dragState.offsetX;
      let newY = y - dragState.offsetY;
      
      // Ограничение перемещения: не дальше 100 м (200 единиц) от очага
      if (fireSource) {
        const distFromFire = Math.sqrt((newX - fireSource.x) ** 2 + (newY - fireSource.y) ** 2);
        if (distFromFire > 200) {
          const angle = Math.atan2(newY - fireSource.y, newX - fireSource.x);
          newX = fireSource.x + Math.cos(angle) * 200;
          newY = fireSource.y + Math.sin(angle) * 200;
        }
      }
      
      // Ограничение границами карты
      newX = Math.max(10, Math.min(990, newX));
      newY = Math.max(10, Math.min(590, newY));
      
      if (deployment) {
        const newPersonnelPositions = [...(deployment.personnelPositions || [])];
        if (personnelIndex < newPersonnelPositions.length) {
          newPersonnelPositions[personnelIndex] = { x: newX, y: newY };
          setDeployment({
            ...deployment,
            personnelPositions: newPersonnelPositions
          });
        }
      }
    } else if (dragState.type === 'pump' && dragState.unitId) {
      // Update pump position (start of hose)
      let newX = x - dragState.offsetX;
      let newY = y - dragState.offsetY;
      
      // Ограничение границами карты
      newX = Math.max(10, Math.min(990, newX));
      newY = Math.max(10, Math.min(590, newY));
      
      setCustomPumpPositions(prev => ({
        ...prev,
        [dragState.unitId!]: { x: newX, y: newY }
      }));
    }
  }, [dragState, getSVGCoords, deployment, customPositions, manualUnits, fireSource, isSelecting, selectionBox, selectedElements, customPumpPositions]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
    
    // Завершить выделение прямоугольником
    if (isSelecting && selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);
      
      const newSelected: SelectedElement[] = [];
      
      // Проверить технику
      const allUnits = [...(deployment?.units || []), ...manualUnits];
      allUnits.forEach(unit => {
        const unitWidth = unit.type === 'asa' ? 55 : 44;
        if (unit.x >= minX && unit.x + unitWidth <= maxX &&
            unit.y >= minY && unit.y + 20 <= maxY) {
          newSelected.push({
            type: 'unit',
            id: unit.id,
            startX: unit.x,
            startY: unit.y
          });
        }
      });
      
      // Проверить препятствия
      obstacles.forEach(obs => {
        if (obs.x >= minX && obs.x + obs.width <= maxX &&
            obs.y >= minY && obs.y + obs.height <= maxY) {
          newSelected.push({
            type: 'obstacle',
            id: obs.id,
            startX: obs.x,
            startY: obs.y
          });
        }
      });
      
      // Проверить ствольщиков
      if (fireSource) {
        allUnits.filter(u => u.type !== 'aso' && (u.hoses > 0 || (u as any).ptvDeployed)).forEach(unit => {
          const unitWidth = unit.type === 'asa' ? 55 : 44;
          const customPos = customPositions[unit.id];
          const routing = routeHoseAlongCorridor(
            unit.x, unit.y, unitWidth, 20, fireSource.x, fireSource.y, wagons, obstacles,
            customPos?.branchPoint,
            customPos?.nozzles,
            unit.angle,
            customPumpPositions[unit.id]
          );
          
          routing.nozzles.forEach((nozzle, idx) => {
            if (nozzle.x >= minX && nozzle.x <= maxX &&
                nozzle.y >= minY && nozzle.y <= maxY) {
              newSelected.push({
                type: 'firefighter',
                id: `${unit.id}-${idx}`,
                unitId: unit.id,
                startX: nozzle.x,
                startY: nozzle.y
              });
            }
          });
          
          // Проверить разветвления
          if (routing.branchPoint.x >= minX && routing.branchPoint.x <= maxX &&
              routing.branchPoint.y >= minY && routing.branchPoint.y <= maxY) {
            newSelected.push({
              type: 'branch',
              id: unit.id,
              unitId: unit.id,
              startX: routing.branchPoint.x,
              startY: routing.branchPoint.y
            });
          }
        });
      }
      
      setSelectedElements(newSelected);
      setIsSelecting(false);
      setSelectionBox(null);
    }
  }, [isSelecting, selectionBox, deployment, manualUnits, obstacles, fireSource, customPositions, wagons]);

  const handleDeploy = useCallback(() => {
    const result = calculateDeployment(wagons, fireSource, obstacles, useCustomResources ? resources : null, waterSources);
    setDeployment(result);
  }, [wagons, fireSource, obstacles, resources, useCustomResources, waterSources]);

  const handleReset = useCallback(() => {
    setFireSource(null);
    setObstacles([]);
    setDeployment(null);
    setManualUnits([]);
    setWaterSources([]);
    setFireTrains([]);
    setFireTrainPTW({});
    setSelectedFireTrainId(null);
    setCustomPumpPositions({});
    setToolMode('none');
  }, []);

  const handleScreenshotScene = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      alert('Не удалось найти элемент карты');
      return;
    }
    
    try {
      // Клонируем SVG для модификации
      const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
      
      // Устанавливаем размеры
      svgClone.setAttribute('width', '1000');
      svgClone.setAttribute('height', '600');
      
      // Сериализуем SVG в строку
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      
      // Создаём Data URL
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      // Создаём изображение
      const img = new Image();
      img.onload = () => {
        // Создаём canvas
        const canvas = document.createElement('canvas');
        canvas.width = 2000; // 2x для высокого качества
        canvas.height = 1200;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          alert('Не удалось создать контекст canvas');
          URL.revokeObjectURL(url);
          return;
        }
        
        // Рисуем фон
        ctx.fillStyle = '#1e2a1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Рисуем SVG
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Копируем в буфер обмена
        canvas.toBlob((blob) => {
          if (blob && navigator.clipboard && navigator.clipboard.write) {
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).then(() => {
              alert('Скриншот обстановки скопирован в буфер обмена');
            }).catch((err) => {
              console.error('Ошибка копирования в буфер:', err);
              // Fallback: скачиваем файл
              const link = document.createElement('a');
              link.download = `пожарная-обстановка-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
              alert('Скриншот сохранён в файл');
            });
          } else {
            // Fallback: скачиваем файл
            const link = document.createElement('a');
            link.download = `пожарная-обстановка-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            alert('Скриншот сохранён в файл');
          }
          URL.revokeObjectURL(url);
        }, 'image/png');
      };
      
      img.onerror = () => {
        alert('Ошибка загрузки SVG изображения');
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } catch (error) {
      console.error('Ошибка при создании скриншота:', error);
      alert('Не удалось создать скриншот обстановки');
    }
  }, []);

  const handleScreenshotFullScreen = useCallback(async () => {
    const appElement = document.querySelector('.min-h-screen') as HTMLElement;
    if (!appElement) {
      alert('Не удалось найти элемент приложения');
      return;
    }
    
    try {
      const canvas = await html2canvas(appElement, {
        backgroundColor: '#111827',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Убеждаемся, что все стили скопированы
          const clonedElement = clonedDoc.querySelector('.min-h-screen') as HTMLElement;
          if (clonedElement) {
            clonedElement.style.overflow = 'visible';
          }
        }
      });
      
      // Копируем в буфер обмена
      canvas.toBlob((blob) => {
        if (blob && navigator.clipboard && navigator.clipboard.write) {
          navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]).then(() => {
            alert('Скриншот экрана скопирован в буфер обмена');
          }).catch((err) => {
            console.error('Ошибка копирования в буфер:', err);
            // Fallback: скачиваем файл
            const link = document.createElement('a');
            link.download = `полный-экран-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            alert('Скриншот сохранён в файл');
          });
        } else {
          // Fallback: скачиваем файл
          const link = document.createElement('a');
          link.download = `полный-экран-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          alert('Скриншот сохранён в файл');
        }
      }, 'image/png');
    } catch (error) {
      console.error('Ошибка при создании скриншота:', error);
      alert('Не удалось создать скриншот экрана');
    }
  }, []);

  const changeWagonType = useCallback((wagonId: number, newType: WagonType) => {
    const newWagons = wagons.map(w => {
      if (w.id === wagonId) {
        const height = 7; // 3.5m = 7 SVG units (wagon width)
        return { ...w, type: newType, height, y: TRACK_Y - height / 2, label: `${WAGON_TYPE_INFO[newType].label} №${w.id}` };
      }
      return w;
    });
    setWagons(newWagons);
    setSelectedWagonId(null);
    
    // Автоматический пересчёт расстановки после изменения типа вагона
    if (fireSource) {
      const newDeployment = calculateDeployment(newWagons, fireSource, obstacles, useCustomResources ? resources : null, waterSources);
      setDeployment(newDeployment);
    } else {
      setDeployment(null);
    }
  }, [wagons, fireSource, obstacles, resources, useCustomResources, waterSources]);

  const changeAllWagonsType = useCallback((newType: WagonType) => {
    const newWagons = wagons.map(w => {
      const height = 7; // 3.5m = 7 SVG units (wagon width)
      return { ...w, type: newType, height, y: TRACK_Y - height / 2, label: `${WAGON_TYPE_INFO[newType].label} №${w.id}` };
    });
    setWagons(newWagons);
    
    // Автоматический пересчёт расстановки после изменения типа всех вагонов
    if (fireSource) {
      const newDeployment = calculateDeployment(newWagons, fireSource, obstacles, useCustomResources ? resources : null, waterSources);
      setDeployment(newDeployment);
    } else {
      setDeployment(null);
    }
  }, [wagons, fireSource, obstacles, resources, useCustomResources, waterSources]);

  const changeUnitType = useCallback((unitId: string, newType: FireUnit['type']) => {
    const newName = newType === 'asa' ? 'АСА' : newType === 'aso' ? 'АСО' : 'АЦ-40';
    const newPersonnel = newType === 'asa' ? 5 : newType === 'aso' ? 3 : 7;
    
    setManualUnits(prev => prev.map(u =>
      u.id === unitId ? { ...u, type: newType, name: newName, personnel: newPersonnel } : u
    ));
    
    // Автоматический пересчёт расстановки после изменения типа техники
    if (fireSource) {
      const newDeployment = calculateDeployment(wagons, fireSource, obstacles, useCustomResources ? resources : null, waterSources);
      setDeployment(newDeployment);
    }
    setSelectedUnitId(null);
  }, [deployment]);

  const updateUnitDivision = useCallback((unitId: string, division: string) => {
    setManualUnits(prev => prev.map(u =>
      u.id === unitId ? { ...u, division } : u
    ));
  }, []);

  const deployPTV = useCallback((unitId: string) => {
    setManualUnits(prev => prev.map(u =>
      u.id === unitId ? { ...u, ptvDeployed: true, hoses: 2 } : u
    ));
  }, []);

  const fireWagonLabel = useMemo(() => {
    if (!fireSource) return '';
    const w = wagons.find(w => w.id === fireSource.wagonId);
    return w ? w.label : '';
  }, [fireSource, wagons]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 px-4 py-2 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center">
              <span className="text-lg">🚒</span>
            </div>
            <div>
              <h1 className="text-sm font-bold">Расстановка сил и средств ПО</h1>
              <p className="text-[10px] text-gray-400">Тушение пожаров ЖД составов • v1.2.1</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowResources(true)} className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-xs font-semibold">📋 Силы</button>
            <div className="flex gap-1">
              <button onClick={() => setPlacingUnit('ac')} className={`px-2 py-1.5 rounded text-xs ${placingUnit === 'ac' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>+АЦ</button>
              <button onClick={() => setPlacingUnit('asa')} className={`px-2 py-1.5 rounded text-xs ${placingUnit === 'asa' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>+АСА</button>
              <button onClick={() => setPlacingUnit('aso')} className={`px-2 py-1.5 rounded text-xs ${placingUnit === 'aso' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>+АСО</button>
              <button onClick={() => {
                // Добавление пожарного поезда
                const trainId = `train-${Date.now()}`;
                
                // Рассчитываем позицию для пожарного поезда
                // Находим правую границу основного поезда
                const mainTrainRightEdge = Math.max(...wagons.map(w => w.x + w.width));
                
                // Позиция пожарного поезда: 50 метров (100 единиц) от основного поезда
                const startX = mainTrainRightEdge + 100;
                
                // Проверяем, помещается ли поезд на карте
                if (startX + 3 * 56 > 990) {
                  alert('Недостаточно места для пожарного поезда');
                  return;
                }
                
                const trainWagons: Wagon[] = [];
                for (let i = 0; i < 3; i++) {
                  const isTank = i === 1; // 1 цистерна в середине
                  trainWagons.push({
                    id: i + 1,
                    x: startX + i * 56,
                    y: TRACK_Y - 3.5, // На тех же путях
                    width: 50,
                    height: 7,
                    type: isTank ? 'tank' : 'freight',
                    label: isTank ? `Цистерна ПП ${i + 1}` : `Вагон ПП ${i + 1}`,
                  });
                }
                setFireTrains(prev => [...prev, { id: trainId, wagons: trainWagons }]);
              }} className="px-2 py-1.5 rounded text-xs bg-red-700 hover:bg-red-600">+Пожарный поезд</button>
            </div>
            <button onClick={handleDeploy} disabled={!fireSource} className="px-4 py-1.5 bg-gradient-to-r from-red-600 to-red-700 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold text-xs">🚀 Расставить</button>
            <button onClick={() => setShowHelp(true)} className="px-2 py-1.5 bg-gray-700 rounded-lg text-xs">❓</button>
            <button onClick={handleReset} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 rounded-lg text-xs font-semibold">🗑 Сброс обстановки</button>
            <button onClick={handleScreenshotScene} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-semibold">📷 Скриншот обстановки</button>
            <button onClick={handleScreenshotFullScreen} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-semibold">🖥 Скриншот экрана</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[270px] bg-gray-800/95 border-r border-gray-700 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 overflow-y-auto flex-1 space-y-3">
            <div>
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Инструменты</h3>
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => setToolMode(toolMode === 'fire' ? 'none' : 'fire')} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'fire' ? 'bg-orange-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>🔥 Очаг</button>
                <button onClick={() => setToolMode(toolMode === 'obstacle' ? 'none' : 'obstacle')} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'obstacle' ? 'bg-yellow-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>🧱 Препятствия</button>
                <button onClick={() => setToolMode(toolMode === 'water' ? 'none' : 'water')} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'water' ? 'bg-cyan-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>💧 Водоисточник</button>
                <button onClick={() => setToolMode(toolMode === 'select' ? 'none' : 'select')} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'select' ? 'bg-blue-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>✋ Перемещение</button>
                <button onClick={() => setToolMode(toolMode === 'selection' ? 'none' : 'selection')} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'selection' ? 'bg-purple-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>⬚ Выделение области</button>
                <button onClick={() => { setToolMode(toolMode === 'ruler' ? 'none' : 'ruler'); setRulerPoints([]); }} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'ruler' ? 'bg-pink-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>📏 Линейка</button>
                {toolMode === 'ruler' && rulerPoints.length > 0 && (
                  <button onClick={() => setRulerPoints([])} className="px-2 py-1.5 rounded text-[11px] font-medium bg-pink-700 hover:bg-pink-600">🗑 Сброс</button>
                )}
                <button onClick={() => setToolMode('none')} className={`px-2 py-1.5 rounded text-[11px] font-medium ${toolMode === 'none' ? 'bg-green-600' : 'bg-gray-700/80 hover:bg-gray-600'}`}>👁 Просмотр</button>
              </div>
            </div>

            {/* Масштабирование */}
            <div className="p-2 bg-gray-700/50 rounded-lg">
              <label className="text-[10px] text-gray-400 block mb-1">Масштаб: {Math.round(scale * 100)}%</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                <span>50%</span>
                <span>100%</span>
                <span>200%</span>
              </div>
            </div>

            {toolMode === 'fire' && (
              <div className="p-2.5 bg-orange-900/20 rounded-lg border border-orange-500/30">
                <h3 className="text-[11px] font-semibold text-orange-400 mb-1.5">🔥 Параметры пожара</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Интенсивность</label>
                    <div className="flex gap-1">
                      {([['low', 'Слабая'], ['medium', 'Средняя'], ['high', 'Сильная']] as const).map(([val, label]) => (
                        <button key={val} onClick={() => setFireIntensity(val)} className={`flex-1 px-1 py-1 rounded text-[10px] font-medium ${fireIntensity === val ? val === 'low' ? 'bg-yellow-700' : val === 'medium' ? 'bg-orange-700' : 'bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Характер</label>
                    <select value={fireType} onChange={e => setFireType(e.target.value as FireSource['type'])} className="w-full px-2 py-1 bg-gray-700 rounded text-[10px] border border-gray-600">
                      <option value="wagon_body">Корпус вагона</option>
                      <option value="tank">Цистерна (ГЖ/ЛЖ)</option>
                      <option value="undercarriage">Ходовая часть</option>
                      <option value="cargo">Груз на платформе</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-orange-300/70 italic">👆 Кликните на вагон</p>
                </div>
              </div>
            )}

            {toolMode === 'obstacle' && (
              <div className="p-2.5 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
                <h3 className="text-[11px] font-semibold text-yellow-400 mb-1.5">🧱 Тип препятствия</h3>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(OBSTACLE_DEFAULTS) as ObstacleType[]).map(type => (
                    <button key={type} onClick={() => setObstacleType(type)} className={`px-1.5 py-1 rounded text-[10px] font-medium flex items-center gap-1 ${obstacleType === type ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                      <span className="text-xs">{OBSTACLE_DEFAULTS[type].icon}</span>
                      <span>{OBSTACLE_DEFAULTS[type].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {toolMode === 'water' && (
              <div className="p-2.5 bg-cyan-900/20 rounded-lg border border-cyan-500/30">
                <h3 className="text-[11px] font-semibold text-cyan-400 mb-1.5">💧 Тип водоисточника</h3>
                <div className="space-y-1">
                  <button onClick={() => setWaterSourceType('pond')} className={`w-full px-2 py-1.5 rounded text-[10px] font-medium flex items-center gap-2 ${waterSourceType === 'pond' ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <span className="text-sm">🏊</span>
                    <span>Водоём</span>
                  </button>
                  <button onClick={() => setWaterSourceType('river')} className={`w-full px-2 py-1.5 rounded text-[10px] font-medium flex items-center gap-2 ${waterSourceType === 'river' ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <span className="text-sm">🌊</span>
                    <span>Река</span>
                  </button>
                </div>
                <p className="text-[9px] text-cyan-300/70 italic mt-2">👆 Кликните на карту для размещения (макс. 4)</p>
              </div>
            )}

            {waterSources.length > 0 && toolMode !== 'water' && (
              <div className="p-2 bg-cyan-900/20 rounded-lg border border-cyan-500/30">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[10px] font-semibold text-cyan-400">💧 Водоисточники ({waterSources.length}/4)</h3>
                  <button onClick={() => setWaterSources([])} className="text-[9px] text-cyan-400 hover:text-cyan-300">Очистить все</button>
                </div>
                <div className="space-y-1">
                  {waterSources.map(ws => (
                    <div key={ws.id} className="flex items-center justify-between text-[9px] text-gray-300">
                      <span>{ws.type === 'pond' ? '🏊' : '🌊'} {ws.label}</span>
                      <button onClick={() => setWaterSources(prev => prev.filter(w => w.id !== ws.id))} className="text-red-400 hover:text-red-300">✕</button>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-gray-400 mt-1">Техника размещается со стороны ближайшего водоисточника</p>
              </div>
            )}

            <div>
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Тип поезда</h3>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(WAGON_TYPE_INFO) as WagonType[]).map(type => (
                  <button key={type} onClick={() => changeAllWagonsType(type)} className="px-1.5 py-1 rounded text-[10px] font-medium flex items-center gap-1 bg-gray-700/80 hover:bg-gray-600">
                    <span className="text-xs">{WAGON_TYPE_INFO[type].icon}</span>
                    <span>{WAGON_TYPE_INFO[type].label}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedWagonId && (
              <div className="p-2.5 bg-purple-900/20 rounded-lg border border-purple-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] font-semibold text-purple-400">Вагон №{selectedWagonId}</h3>
                  <button onClick={() => setSelectedWagonId(null)} className="text-[9px] text-purple-400">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(WAGON_TYPE_INFO) as WagonType[]).map(type => (
                    <button key={type} onClick={() => changeWagonType(selectedWagonId, type)} className={`px-1.5 py-1 rounded text-[10px] font-medium flex items-center gap-1 ${wagons.find(w => w.id === selectedWagonId)?.type === type ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                      <span className="text-xs">{WAGON_TYPE_INFO[type].icon}</span>
                      <span>{WAGON_TYPE_INFO[type].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedUnitId && (
              <div className="p-2.5 bg-cyan-900/20 rounded-lg border border-cyan-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] font-semibold text-cyan-400">
                    {[...(deployment?.units || []), ...manualUnits].find(u => u.id === selectedUnitId)?.name}
                  </h3>
                  <button onClick={() => setSelectedUnitId(null)} className="text-[9px] text-cyan-400">✕</button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[9px] text-gray-400 block mb-0.5">Тип техники:</label>
                    <div className="grid grid-cols-2 gap-1">
                      {(['ac', 'asa', 'aso'] as const).map(type => (
                        <button key={type} onClick={() => changeUnitType(selectedUnitId, type)} className={`px-1.5 py-1 rounded text-[9px] font-medium ${[...(deployment?.units || []), ...manualUnits].find(u => u.id === selectedUnitId)?.type === type ? 'bg-cyan-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
                          {type === 'asa' ? 'АСА' : type === 'aso' ? 'АСО' : 'АЦ'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400 block mb-0.5">Подразделение:</label>
                    <input
                      type="text"
                      placeholder="Напр.: ПЧ-12"
                      value={(manualUnits.find(u => u.id === selectedUnitId) as ManualUnit | undefined)?.division || ''}
                      onChange={e => updateUnitDivision(selectedUnitId, e.target.value)}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-[10px] border border-gray-600"
                    />
                  </div>
                  {(() => {
                    const selectedManualUnit = manualUnits.find(u => u.id === selectedUnitId);
                    if (selectedManualUnit && !selectedManualUnit.ptvDeployed && selectedManualUnit.type !== 'aso') {
                      return (
                        <button onClick={() => deployPTV(selectedUnitId)} className="w-full py-1.5 bg-green-600 hover:bg-green-500 rounded text-[10px] font-semibold">
                          🔧 Расставить ПТВ
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {selectedFireTrainId && (
              <div className="p-2.5 bg-red-900/20 rounded-lg border border-red-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] font-semibold text-red-400">🚂 Пожарный поезд</h3>
                  <button onClick={() => setSelectedFireTrainId(null)} className="text-[9px] text-red-400">✕</button>
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] text-gray-300">Выбран пожарный поезд</p>
                  {(() => {
                    const isPTWDeployed = fireTrainPTW[selectedFireTrainId];
                    if (!isPTWDeployed && fireSource) {
                      return (
                        <button 
                          onClick={() => {
                            setFireTrainPTW(prev => ({ ...prev, [selectedFireTrainId]: true }));
                          }}
                          className="w-full py-1.5 bg-green-600 hover:bg-green-500 rounded text-[10px] font-semibold"
                        >
                          🔧 Расставить ПТВ
                        </button>
                      );
                    } else if (isPTWDeployed) {
                      return (
                        <button 
                          onClick={() => {
                            setFireTrainPTW(prev => ({ ...prev, [selectedFireTrainId]: false }));
                          }}
                          className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 rounded text-[10px] font-semibold"
                        >
                          ❌ Убрать ПТВ
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {fireSource && (
              <div className="p-2 bg-red-900/20 rounded-lg border border-red-500/30">
                <h3 className="text-[10px] font-semibold text-red-400 mb-1">🔥 Очаг: {fireWagonLabel}</h3>
                <div className="text-[10px] text-gray-300 space-y-0.5">
                  <p>Интенсивность: {fireSource.intensity === 'low' ? 'Слабая' : fireSource.intensity === 'medium' ? 'Средняя' : 'Сильная'}</p>
                  <p>Тип: {fireSource.type === 'wagon_body' ? 'Корпус' : fireSource.type === 'tank' ? 'Цистерна' : fireSource.type === 'undercarriage' ? 'Ходовая' : 'Груз'}</p>
                </div>
              </div>
            )}

            {!deployment && manualUnits.length > 0 && (
              <div className="p-2.5 bg-blue-900/20 rounded-lg border border-blue-500/30">
                <h3 className="text-[11px] font-semibold text-blue-400 mb-1.5">📌 Добавленная техника</h3>
                <div className="space-y-1">
                  {manualUnits.map(unit => (
                    <div key={unit.id} className="flex items-center justify-between bg-gray-700/60 rounded px-2 py-1">
                      <span className="text-[10px] text-gray-300">{unit.name}</span>
                      <span className={`text-[9px] ${unit.ptvDeployed ? 'text-green-400' : 'text-yellow-400'}`}>
                        {unit.ptvDeployed ? '✓ ПТВ' : '⚠ Без ПТВ'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-gray-400 mt-2 italic">Выберите машину для расстановки ПТВ</p>
              </div>
            )}

            {deployment && (
              <div className="p-2.5 bg-green-900/20 rounded-lg border border-green-500/30">
                <h3 className="text-[11px] font-semibold text-green-400 mb-1.5">✅ Расстановка</h3>
                <div className="grid grid-cols-3 gap-1 mb-2">
                  <div className="bg-gray-700/80 rounded p-1 text-center">
                    <div className="text-sm font-bold">{deployment.units.length + manualUnits.filter(u => u.ptvDeployed).length}</div>
                    <div className="text-[8px] text-gray-400">Техника</div>
                  </div>
                  <div className="bg-gray-700/80 rounded p-1 text-center">
                    <div className="text-sm font-bold">{deployment.totalPersonnel}</div>
                    <div className="text-[8px] text-gray-400">Л/с</div>
                  </div>
                  <div className="bg-gray-700/80 rounded p-1 text-center">
                    <div className="text-sm font-bold">{deployment.totalHoses}</div>
                    <div className="text-[8px] text-gray-400">Стволов</div>
                  </div>
                </div>
                {manualUnits.length > 0 && (
                  <div className="mb-2 p-1.5 bg-blue-900/20 rounded border border-blue-500/30">
                    <p className="text-[9px] text-blue-300">📌 Добавлено вручную: {manualUnits.length} ед.</p>
                    <p className="text-[8px] text-blue-400">С ПТВ: {manualUnits.filter(u => u.ptvDeployed).length} ед.</p>
                  </div>
                )}
                <p className="text-[9px] text-gray-400">{deployment.strategy}</p>
                {deployment.warnings.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {deployment.warnings.map((w, i) => (
                      <div key={i} className="text-[9px] text-yellow-300 bg-yellow-900/30 rounded px-1.5 py-0.5">{w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 p-2 flex flex-col overflow-hidden">
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden relative">
            <svg
              ref={svgRef}
              viewBox={`${500 - 500/scale} ${300 - 300/scale} ${1000/scale} ${600/scale}`}
              className="w-full h-full"
              onClick={handleSVGClick}
              onMouseDown={(e) => {
                // Начать выделение прямоугольником в режиме selection
                if (toolMode === 'selection') {
                  e.preventDefault();
                  const { x, y } = getSVGCoords(e);
                  setIsSelecting(true);
                  setSelectionBox({
                    startX: x,
                    startY: y,
                    endX: x,
                    endY: y
                  });
                  setSelectedElements([]);
                }
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: placingUnit ? 'cell' : toolMode === 'fire' ? 'crosshair' : toolMode === 'obstacle' ? 'cell' : toolMode === 'water' ? 'cell' : toolMode === 'select' ? 'move' : toolMode === 'selection' ? 'crosshair' : toolMode === 'ruler' ? 'crosshair' : 'pointer' }}
            >
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                </pattern>
                <radialGradient id="fireRadial">
                  <stop offset="0%" stopColor="#ffcc00" stopOpacity="0.9" />
                  <stop offset="30%" stopColor="#ff6600" stopOpacity="0.7" />
                  <stop offset="70%" stopColor="#ff3300" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
                </radialGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              <rect width="1000" height="600" fill="#1e2a1e" />
              <rect width="1000" height="600" fill="url(#grid)" />

              {/* Railway tracks */}
              <g>
                <rect x="55" y="294" width="890" height="12" fill="#3a3a3a" rx="2" />
                <rect x="55" y="295" width="890" height="10" fill="#444" rx="1" />
                {Array.from({ length: 50 }, (_, i) => (
                  <rect key={i} x={62 + i * 18} y="293" width="4" height="14" fill="#5a4a3a" rx="1" opacity="0.7" />
                ))}
                <line x1="60" y1="298" x2="940" y2="298" stroke="#aaa" strokeWidth="2" />
                <line x1="60" y1="302" x2="940" y2="302" stroke="#aaa" strokeWidth="2" />
              </g>

              {/* Wagons */}
              {wagons.map(wagon => {
                const isOnFire = fireSource?.wagonId === wagon.id;
                const isSelected = selectedWagonId === wagon.id;
                return (
                  <g key={wagon.id}>
                    <rect x={wagon.x + 2} y={wagon.y + 2} width={wagon.width} height={wagon.height} fill="rgba(0,0,0,0.3)" rx="3" />
                    <rect x={wagon.x} y={wagon.y} width={wagon.width} height={wagon.height}
                      fill={WAGON_TYPE_INFO[wagon.type].color}
                      stroke={isOnFire ? '#ff4500' : isSelected ? '#a855f7' : '#666'}
                      strokeWidth={isOnFire ? 2.5 : isSelected ? 2 : 1} rx="3" />
                    {wagon.type === 'tank' && (
                      <ellipse cx={wagon.x + wagon.width / 2} cy={wagon.y + wagon.height / 2} rx={wagon.width / 2 - 6} ry={wagon.height / 2 - 4} fill="none" stroke="#5a7a55" strokeWidth="1.5" />
                    )}
                    {wagon.type === 'passenger' && (
                      <>
                        {Array.from({ length: 8 }, (_, i) => (
                          <rect key={i} x={wagon.x + 2 + i * 6} y={wagon.y + 2} width="4" height="3" fill="#5a8aaa" rx="0.5" opacity="0.7" />
                        ))}
                      </>
                    )}
                    <text x={wagon.x + wagon.width / 2} y={wagon.y - 8} textAnchor="middle" fill={isOnFire ? '#ff8800' : '#aaa'} fontSize="5" fontFamily="sans-serif" fontWeight={isOnFire ? 'bold' : 'normal'}>{wagon.label}</text>
                  </g>
                );
              })}

              {/* Fire Trains */}
              {fireTrains.map(train => {
                const isSelected = selectedFireTrainId === train.id;
                return (
                  <g 
                    key={train.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFireTrainId(isSelected ? null : train.id);
                      setSelectedUnitId(null);
                      setSelectedWagonId(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {train.wagons.map(wagon => (
                      <g key={wagon.id}>
                        <rect x={wagon.x} y={wagon.y} width={wagon.width} height={wagon.height}
                          fill="#c62828"
                          stroke={isSelected ? "#4fc3f7" : "#8b0000"}
                          strokeWidth={isSelected ? 2 : 1} rx="3" />
                        {wagon.type === 'tank' && (
                          <ellipse cx={wagon.x + wagon.width / 2} cy={wagon.y + wagon.height / 2} rx={wagon.width / 2 - 6} ry={wagon.height / 2 - 2} fill="none" stroke="#8b0000" strokeWidth="1" />
                        )}
                        <text x={wagon.x + wagon.width / 2} y={wagon.y - 8} textAnchor="middle" fill="#ff6666" fontSize="4" fontFamily="sans-serif" fontWeight="bold">{wagon.label}</text>
                      </g>
                    ))}
                    <text x={train.wagons[0].x + (train.wagons[train.wagons.length - 1].x + train.wagons[train.wagons.length - 1].width - train.wagons[0].x) / 2} y={train.wagons[0].y - 15} textAnchor="middle" fill="#ff4444" fontSize="8" fontFamily="sans-serif" fontWeight="bold">ПОЖАРНЫЙ ПОЕЗД</text>
                  </g>
                );
              })}

              {/* Fire Train PTW - 4 nozzles from fire train */}
              {fireSource && fireTrains.length > 0 && fireTrains.filter(train => fireTrainPTW[train.id]).map(train => {
                const trainCenterX = train.wagons[0].x + (train.wagons[train.wagons.length - 1].x + train.wagons[train.wagons.length - 1].width - train.wagons[0].x) / 2;
                const trainCenterY = train.wagons[0].y + train.wagons[0].height / 2;
                
                // Two branch points: one above tracks, one below
                const branchAbove = { x: trainCenterX, y: 268 }; // 10m above tracks
                const branchBelow = { x: trainCenterX, y: 332 }; // 10m below tracks
                
                // Four nozzles: 2 from each branch
                const nozzles = [
                  { x: fireSource.x - 15, y: 275 }, // Above, left
                  { x: fireSource.x + 15, y: 275 }, // Above, right
                  { x: fireSource.x - 15, y: 325 }, // Below, left
                  { x: fireSource.x + 15, y: 325 }, // Below, right
                ];
                
                // Calculate hose connections every 20m (40 units)
                const HOSE_SEGMENT_LENGTH = 40;
                const calculateConnections = (x1: number, y1: number, x2: number, y2: number) => {
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const connections: Array<{ x: number; y: number }> = [];
                  
                  if (dist > HOSE_SEGMENT_LENGTH) {
                    const numSegments = Math.floor(dist / HOSE_SEGMENT_LENGTH);
                    const segDx = dx / dist;
                    const segDy = dy / dist;
                    
                    for (let i = 1; i <= numSegments; i++) {
                      connections.push({
                        x: x1 + segDx * (i * HOSE_SEGMENT_LENGTH),
                        y: y1 + segDy * (i * HOSE_SEGMENT_LENGTH)
                      });
                    }
                  }
                  return connections;
                };
                
                const trainToAboveConnections = calculateConnections(trainCenterX, trainCenterY, branchAbove.x, branchAbove.y);
                const trainToBelowConnections = calculateConnections(trainCenterX, trainCenterY, branchBelow.x, branchBelow.y);
                
                return (
                  <g key={`train-ptw-${train.id}`}>
                    {/* Hoses from train to branches */}
                    <line x1={trainCenterX} y1={trainCenterY} x2={branchAbove.x} y2={branchAbove.y} stroke="#000" strokeWidth="3" />
                    <line x1={trainCenterX} y1={trainCenterY} x2={branchBelow.x} y2={branchBelow.y} stroke="#000" strokeWidth="3" />
                    
                    {/* Connection points on hoses from train to branches */}
                    {trainToAboveConnections.map((conn, idx) => (
                      <g key={`train-above-conn-${idx}`}>
                        <circle cx={conn.x} cy={conn.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                        <circle cx={conn.x} cy={conn.y} r="1.5" fill="#888" />
                      </g>
                    ))}
                    {trainToBelowConnections.map((conn, idx) => (
                      <g key={`train-below-conn-${idx}`}>
                        <circle cx={conn.x} cy={conn.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                        <circle cx={conn.x} cy={conn.y} r="1.5" fill="#888" />
                      </g>
                    ))}
                    
                    {/* Branch points */}
                    <rect x={branchAbove.x - 8} y={branchAbove.y - 6} width="16" height="12" fill="#1565c0" stroke="#fff" strokeWidth="1" rx="2" />
                    <text x={branchAbove.x} y={branchAbove.y + 2} textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">РТ-80</text>
                    
                    <rect x={branchBelow.x - 8} y={branchBelow.y - 6} width="16" height="12" fill="#1565c0" stroke="#fff" strokeWidth="1" rx="2" />
                    <text x={branchBelow.x} y={branchBelow.y + 2} textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">РТ-80</text>
                    
                    {/* Hoses from branches to nozzles */}
                    {nozzles.slice(0, 2).map((nozzle, idx) => (
                      <line key={`above-${idx}`} x1={branchAbove.x} y1={branchAbove.y} x2={nozzle.x} y2={nozzle.y} stroke="#000" strokeWidth="2.5" />
                    ))}
                    {nozzles.slice(2, 4).map((nozzle, idx) => (
                      <line key={`below-${idx}`} x1={branchBelow.x} y1={branchBelow.y} x2={nozzle.x} y2={nozzle.y} stroke="#000" strokeWidth="2.5" />
                    ))}
                    
                    {/* Connection points on hoses from branches to nozzles */}
                    {nozzles.slice(0, 2).map((nozzle, idx) => {
                      const connections = calculateConnections(branchAbove.x, branchAbove.y, nozzle.x, nozzle.y);
                      return connections.map((conn, cidx) => (
                        <g key={`above-nozzle-${idx}-conn-${cidx}`}>
                          <circle cx={conn.x} cy={conn.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                          <circle cx={conn.x} cy={conn.y} r="1.5" fill="#888" />
                        </g>
                      ));
                    })}
                    {nozzles.slice(2, 4).map((nozzle, idx) => {
                      const connections = calculateConnections(branchBelow.x, branchBelow.y, nozzle.x, nozzle.y);
                      return connections.map((conn, cidx) => (
                        <g key={`below-nozzle-${idx}-conn-${cidx}`}>
                          <circle cx={conn.x} cy={conn.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                          <circle cx={conn.x} cy={conn.y} r="1.5" fill="#888" />
                        </g>
                      ));
                    })}
                    
                    {/* Nozzles with firefighters */}
                    {nozzles.map((nozzle, idx) => {
                      const dx = fireSource.x - nozzle.x;
                      const dy = fireSource.y - nozzle.y;
                      const angle = Math.atan2(dy, dx);
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      const sprayLength = Math.min(dist * 0.3, 30);
                      const sprayX = nozzle.x + Math.cos(angle) * sprayLength;
                      const sprayY = nozzle.y + Math.sin(angle) * sprayLength;
                      
                      return (
                        <g key={`nozzle-${idx}`}>
                          {/* Water stream */}
                          <line x1={nozzle.x} y1={nozzle.y} x2={fireSource.x} y2={fireSource.y}
                            stroke="#4fc3f7" strokeWidth="2" opacity="0.6" strokeDasharray="4,3">
                            <animate attributeName="stroke-dashoffset" values="0;-14" dur="0.5s" repeatCount="indefinite" />
                          </line>
                          
                          {/* Spray cone */}
                          <path
                            d={`M ${nozzle.x} ${nozzle.y} L ${sprayX - Math.sin(angle) * 8} ${sprayY + Math.cos(angle) * 8} L ${sprayX + Math.sin(angle) * 8} ${sprayY - Math.cos(angle) * 8} Z`}
                            fill="#4fc3f7"
                            opacity="0.4"
                          >
                            <animate attributeName="opacity" values="0.3;0.5;0.3" dur="0.8s" repeatCount="indefinite" />
                          </path>
                          
                          {/* Firefighter */}
                          <circle cx={nozzle.x} cy={nozzle.y} r="5" fill="#e3f2fd" stroke="#1565c0" strokeWidth="1.5" />
                          <line
                            x1={nozzle.x}
                            y1={nozzle.y}
                            x2={nozzle.x + Math.cos(angle) * 8}
                            y2={nozzle.y + Math.sin(angle) * 8}
                            stroke="#1565c0"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <text x={nozzle.x} y={nozzle.y + 3} textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">🧑‍🚒</text>
                        </g>
                      );
                    })}
                    
                    {/* Personnel at branches */}
                    <circle cx={branchAbove.x} cy={branchAbove.y - 12} r="4" fill="#ffeb3b" opacity="0.6" />
                    <text x={branchAbove.x} y={branchAbove.y - 10} textAnchor="middle" fontSize="5">🧑‍🚒</text>
                    <circle cx={branchBelow.x} cy={branchBelow.y + 12} r="4" fill="#ffeb3b" opacity="0.6" />
                    <text x={branchBelow.x} y={branchBelow.y + 14} textAnchor="middle" fontSize="5">🧑‍🚒</text>
                  </g>
                );
              })}

              {/* Fire */}
              {fireSource && (
                <g>
                  <circle cx={fireSource.x} cy={fireSource.y} r={fireSource.intensity === 'high' ? 35 : fireSource.intensity === 'medium' ? 25 : 18} fill="url(#fireRadial)" opacity="0.7">
                    <animate attributeName="r" values={fireSource.intensity === 'high' ? "33;40;33" : fireSource.intensity === 'medium' ? "23;28;23" : "16;20;16"} dur="0.8s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={fireSource.x} cy={fireSource.y} r={fireSource.intensity === 'high' ? 12 : fireSource.intensity === 'medium' ? 9 : 6} fill="#ff4500" filter="url(#glow)" opacity="0.9">
                    <animate attributeName="r" values={fireSource.intensity === 'high' ? "10;14;10" : fireSource.intensity === 'medium' ? "7;11;7" : "5;8;5"} dur="0.5s" repeatCount="indefinite" />
                  </circle>
                  <text x={fireSource.x} y={fireSource.y + 3} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">🔥</text>
                </g>
              )}

              {/* Obstacles */}
              {obstacles.map(obs => (
                <g key={obs.id} onMouseDown={e => handleMouseDown(e, 'obstacle', obs.id)} style={{ cursor: toolMode === 'select' ? 'move' : 'default' }}>
                  <rect x={obs.x} y={obs.y} width={obs.width} height={obs.height}
                    fill={obs.type === 'building' ? '#3a3a5a' : obs.type === 'fence' ? '#5a4a3a' : obs.type === 'equipment' ? '#4a4a4a' : obs.type === 'depot' ? '#3a4a5a' : obs.type === 'tree_group' ? '#1a4a1a' : '#2a2a2a'}
                    fillOpacity="0.85" stroke={toolMode === 'select' ? '#4fc3f7' : '#777'}
                    strokeWidth={toolMode === 'select' ? 2 : 1} rx="3" />
                  <text x={obs.x + obs.width / 2} y={obs.y + obs.height / 2 + 4} textAnchor="middle" fontSize="14">{OBSTACLE_DEFAULTS[obs.type]?.icon}</text>
                </g>
              ))}

              {/* Water Sources */}
              {waterSources.map(ws => (
                <g key={ws.id}>
                  <circle cx={ws.x} cy={ws.y} r="15" fill="#0288d1" opacity="0.3">
                    <animate attributeName="r" values="15;18;15" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={ws.x} cy={ws.y} r="10" fill="#03a9f4" opacity="0.6" />
                  <text x={ws.x} y={ws.y + 4} textAnchor="middle" fontSize="12">
                    {ws.type === 'pond' ? '🏊' : '🌊'}
                  </text>
                  <text x={ws.x} y={ws.y - 18} textAnchor="middle" fill="#4fc3f7" fontSize="7" fontWeight="bold">{ws.label}</text>
                </g>
              ))}

              {/* Hose lines for deployment units */}
              {fireSource && deployment?.units.filter(u => u.hoses > 0).map(unit => {
                const unitWidth = unit.type === 'asa' ? 55 : 44;
                const fs = fireSource!;
                const customPos = customPositions[unit.id];
                const routing = routeHoseAlongCorridor(
                  unit.x, unit.y, unitWidth, 20, fs.x, fs.y, wagons, obstacles,
                  customPos?.branchPoint,
                  customPos?.nozzles,
                  unit.angle,
                  customPumpPositions[unit.id]
                );
                
                // Calculate connection points every 20m (40 units) along the path
                const connectionPoints: Array<{ x: number; y: number }> = [];
                let totalDist = 0;
                for (let i = 0; i < routing.path.length - 1; i++) {
                  const p1 = routing.path[i];
                  const p2 = routing.path[i + 1];
                  const segLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
                  if (segLen === 0) continue; // Skip zero-length segments
                  const segDx = (p2.x - p1.x) / segLen;
                  const segDy = (p2.y - p1.y) / segLen;
                  
                  let segDist = 0;
                  while (segDist < segLen) {
                    const nextConnDist = Math.ceil((totalDist + segDist) / 40) * 40;
                    const distInSeg = nextConnDist - totalDist;
                    if (distInSeg > segLen) break;
                    if (distInSeg > 0) {
                      connectionPoints.push({
                        x: p1.x + segDx * distInSeg,
                        y: p1.y + segDy * distInSeg
                      });
                    }
                    segDist = distInSeg + 1;
                  }
                  totalDist += segLen;
                }

                return (
                  <g key={`hose-${unit.id}`}>
                    {/* Draggable pump position (start of hose) */}
                    <g
                      onMouseDown={e => {
                        e.stopPropagation();
                        const { x, y } = getSVGCoords(e);
                        setDragState({
                          type: 'pump',
                          id: `pump-${unit.id}`,
                          unitId: unit.id,
                          offsetX: x - routing.path[0].x,
                          offsetY: y - routing.path[0].y
                        });
                      }}
                      style={{ cursor: 'move' }}
                    >
                      <circle cx={routing.path[0].x} cy={routing.path[0].y} r="5" fill="#ff6b00" stroke="#fff" strokeWidth="1.5" opacity="0.9" />
                      <circle cx={routing.path[0].x} cy={routing.path[0].y} r="2" fill="#fff" />
                    </g>
                    
                    {/* Main hose path */}
                    {routing.path.slice(0, -1).map((point, idx) => (
                      <line key={idx} x1={point.x} y1={point.y} x2={routing.path[idx + 1].x} y2={routing.path[idx + 1].y}
                        stroke="#000" strokeWidth="3.5" strokeLinecap="round" />
                    ))}
                    
                    {/* Connection points every 20m */}
                    {connectionPoints.map((point, idx) => (
                      <g key={`conn-${idx}`}>
                        <circle cx={point.x} cy={point.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                        <circle cx={point.x} cy={point.y} r="1.5" fill="#888" />
                      </g>
                    ))}
                    
                    {/* Branch hoses to nozzles */}
                    {routing.nozzles.map((nozzle, idx) => (
                      <line key={idx} x1={routing.branchPoint.x} y1={routing.branchPoint.y} x2={nozzle.x} y2={nozzle.y}
                        stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
                    ))}
                    
                    {/* Branch connections (отсечки) every 20m after branch point */}
                    {routing.branchConnections.map((conn, idx) => (
                      <g key={`branch-conn-${idx}`}>
                        <circle cx={conn.x} cy={conn.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                        <circle cx={conn.x} cy={conn.y} r="1.5" fill="#888" />
                      </g>
                    ))}

                    {/* Branch point RT-80 - draggable */}
                    <g 
                      onMouseDown={e => handleMouseDown(e, 'branch', unit.id, unit.id)}
                      style={{ cursor: 'move' }}
                    >
                      <rect x={routing.branchPoint.x - 8} y={routing.branchPoint.y - 6} width="16" height="12" fill="#1565c0" stroke="#fff" strokeWidth="1" rx="2" />
                      <text x={routing.branchPoint.x} y={routing.branchPoint.y + 2} textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">РТ-80</text>
                    </g>
                    
                    {/* Person at branch */}
                    <circle cx={routing.branchPoint.x} cy={routing.branchPoint.y - 12} r="4" fill="#ffeb3b" opacity="0.6" />
                    <text x={routing.branchPoint.x} y={routing.branchPoint.y - 10} textAnchor="middle" fontSize="5">🧑‍🚒</text>

                    {/* Nozzles with water streams - draggable */}
                    {routing.nozzles.map((nozzle, idx) => {
                      // Calculate direction from nozzle to fire
                      const dx = fs.x - nozzle.x;
                      const dy = fs.y - nozzle.y;
                      const angle = Math.atan2(dy, dx);
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      
                      // Check for NaN values
                      if (isNaN(nozzle.x) || isNaN(nozzle.y) || isNaN(angle) || isNaN(dist)) {
                        return null;
                      }
                      
                      // Water spray cone (visual indication of stream direction)
                      const sprayLength = Math.min(dist * 0.3, 30);
                      const sprayWidth = 8;
                      const sprayX = nozzle.x + Math.cos(angle) * sprayLength;
                      const sprayY = nozzle.y + Math.sin(angle) * sprayLength;
                      
                      return (
                        <g key={idx}>
                          {/* Water stream line */}
                          <line x1={nozzle.x} y1={nozzle.y} x2={fs.x} y2={fs.y}
                            stroke="#4fc3f7" strokeWidth="2" opacity="0.6" strokeDasharray="4,3">
                            <animate attributeName="stroke-dashoffset" values="0;-14" dur="0.5s" repeatCount="indefinite" />
                          </line>
                          
                          {/* Water spray cone (direction indicator) */}
                          <path
                            d={`M ${nozzle.x} ${nozzle.y} L ${sprayX - Math.sin(angle) * sprayWidth} ${sprayY + Math.cos(angle) * sprayWidth} L ${sprayX + Math.sin(angle) * sprayWidth} ${sprayY - Math.cos(angle) * sprayWidth} Z`}
                            fill="#4fc3f7"
                            opacity="0.4"
                          >
                            <animate attributeName="opacity" values="0.3;0.5;0.3" dur="0.8s" repeatCount="indefinite" />
                          </path>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Hose lines for manual units with PTW deployed */}
              {fireSource && manualUnits.filter(u => u.ptvDeployed).map(unit => {
                const unitWidth = unit.type === 'asa' ? 55 : 44;
                const fs = fireSource!;
                const customPos = customPositions[unit.id];
                const routing = routeHoseAlongCorridor(
                  unit.x, unit.y, unitWidth, 20, fs.x, fs.y, wagons, obstacles,
                  customPos?.branchPoint,
                  customPos?.nozzles,
                  unit.angle,
                  customPumpPositions[unit.id]
                );
                
                // Calculate connection points every 20m (40 units) along the path
                const connectionPoints: Array<{ x: number; y: number }> = [];
                let totalDist = 0;
                for (let i = 0; i < routing.path.length - 1; i++) {
                  const p1 = routing.path[i];
                  const p2 = routing.path[i + 1];
                  const segLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
                  if (segLen === 0) continue; // Skip zero-length segments
                  const segDx = (p2.x - p1.x) / segLen;
                  const segDy = (p2.y - p1.y) / segLen;
                  
                  let segDist = 0;
                  while (segDist < segLen) {
                    const nextConnDist = Math.ceil((totalDist + segDist) / 40) * 40;
                    const distInSeg = nextConnDist - totalDist;
                    if (distInSeg > segLen) break;
                    if (distInSeg > 0) {
                      connectionPoints.push({
                        x: p1.x + segDx * distInSeg,
                        y: p1.y + segDy * distInSeg
                      });
                    }
                    segDist = distInSeg + 1;
                  }
                  totalDist += segLen;
                }

                return (
                  <g key={`hose-${unit.id}`}>
                    {/* Draggable pump position (start of hose) */}
                    <g
                      onMouseDown={e => {
                        e.stopPropagation();
                        const { x, y } = getSVGCoords(e);
                        setDragState({
                          type: 'pump',
                          id: `pump-${unit.id}`,
                          unitId: unit.id,
                          offsetX: x - routing.path[0].x,
                          offsetY: y - routing.path[0].y
                        });
                      }}
                      style={{ cursor: 'move' }}
                    >
                      <circle cx={routing.path[0].x} cy={routing.path[0].y} r="5" fill="#ff6b00" stroke="#fff" strokeWidth="1.5" opacity="0.9" />
                      <circle cx={routing.path[0].x} cy={routing.path[0].y} r="2" fill="#fff" />
                    </g>
                    
                    {routing.path.slice(0, -1).map((point, idx) => (
                      <line key={idx} x1={point.x} y1={point.y} x2={routing.path[idx + 1].x} y2={routing.path[idx + 1].y}
                        stroke="#000" strokeWidth="3.5" strokeLinecap="round" />
                    ))}
                    
                    {/* Connection points every 20m */}
                    {connectionPoints.map((point, idx) => (
                      <g key={`conn-${idx}`}>
                        <circle cx={point.x} cy={point.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                        <circle cx={point.x} cy={point.y} r="1.5" fill="#888" />
                      </g>
                    ))}
                    
                    {routing.nozzles.map((nozzle, idx) => (
                      <line key={idx} x1={routing.branchPoint.x} y1={routing.branchPoint.y} x2={nozzle.x} y2={nozzle.y}
                        stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
                    ))}
                    
                    {/* Branch connections (отсечки) every 20m after branch point */}
                    {routing.branchConnections.map((conn, idx) => (
                      <g key={`branch-conn-${idx}`}>
                        <circle cx={conn.x} cy={conn.y} r="3" fill="#333" stroke="#666" strokeWidth="1" />
                        <circle cx={conn.x} cy={conn.y} r="1.5" fill="#888" />
                      </g>
                    ))}
                    
                    {/* Branch point RT-80 - draggable */}
                    <g 
                      onMouseDown={e => handleMouseDown(e, 'branch', unit.id, unit.id)}
                      style={{ cursor: 'move' }}
                    >
                      <rect x={routing.branchPoint.x - 8} y={routing.branchPoint.y - 6} width="16" height="12" fill="#1565c0" stroke="#fff" strokeWidth="1" rx="2" />
                      <text x={routing.branchPoint.x} y={routing.branchPoint.y + 2} textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold">РТ-80</text>
                    </g>
                    
                    <circle cx={routing.branchPoint.x} cy={routing.branchPoint.y - 12} r="4" fill="#ffeb3b" opacity="0.6" />
                    <text x={routing.branchPoint.x} y={routing.branchPoint.y - 10} textAnchor="middle" fontSize="5">🧑‍🚒</text>
                    
                    {routing.nozzles.map((nozzle, idx) => {
                      // Calculate direction from nozzle to fire
                      const dx = fs.x - nozzle.x;
                      const dy = fs.y - nozzle.y;
                      const angle = Math.atan2(dy, dx);
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      
                      // Water spray cone (visual indication of stream direction)
                      const sprayLength = Math.min(dist * 0.3, 30);
                      const sprayWidth = 8;
                      const sprayX = nozzle.x + Math.cos(angle) * sprayLength;
                      const sprayY = nozzle.y + Math.sin(angle) * sprayLength;
                      
                      return (
                        <g key={idx}>
                          {/* Water stream line */}
                          <line x1={nozzle.x} y1={nozzle.y} x2={fs.x} y2={fs.y}
                            stroke="#4fc3f7" strokeWidth="2" opacity="0.6" strokeDasharray="4,3">
                            <animate attributeName="stroke-dashoffset" values="0;-14" dur="0.5s" repeatCount="indefinite" />
                          </line>
                          
                          {/* Water spray cone (direction indicator) */}
                          <path
                            d={`M ${nozzle.x} ${nozzle.y} L ${sprayX - Math.sin(angle) * sprayWidth} ${sprayY + Math.cos(angle) * sprayWidth} L ${sprayX + Math.sin(angle) * sprayWidth} ${sprayY - Math.cos(angle) * sprayWidth} Z`}
                            fill="#4fc3f7"
                            opacity="0.4"
                          >
                            <animate attributeName="opacity" values="0.3;0.5;0.3" dur="0.8s" repeatCount="indefinite" />
                          </path>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Deployment units */}
              {deployment?.units.map(unit => {
                const isSelected = selectedUnitId === unit.id;
                const centerX = unit.x + 8;
                const centerY = unit.y + 2.5;
                const truckColor = unit.type === 'ac' ? '#b71c1c' : unit.type === 'asa' ? '#d32f2f' : '#4a148c';
                
                return (
                  <g 
                    key={unit.id} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUnitId(isSelected ? null : unit.id);
                    }}
                    onMouseDown={e => {
                      if (isSelected) {
                        handleMouseDown(e, 'unit', unit.id);
                      }
                    }}
                    style={{ cursor: isSelected ? 'move' : 'pointer' }}
                  >
                    {/* Тень */}
                    <polygon points={getFireTruckPoints(centerX + 0.5, centerY + 0.5, unit.angle)} fill="rgba(0,0,0,0.3)" />
                    
                    {/* Основной пятиугольник автомобиля */}
                    <polygon 
                      points={getFireTruckPoints(centerX, centerY, unit.angle)} 
                      fill={truckColor}
                      stroke={isSelected ? '#4fc3f7' : '#fff'} 
                      strokeWidth={isSelected ? 1.5 : 0.8}
                    />
                    
                    {/* Насос (темный квадратик) - с противоположной стороны от кабины */}
                    {(() => {
                      const normalizedAngle = ((unit.angle % 360) + 360) % 360;
                      const isCabinRight = normalizedAngle < 90 || normalizedAngle > 270;
                      return isCabinRight ? (
                        <rect x={centerX - 7} y={centerY - 1.5} width="3" height="3" fill="#333" />
                      ) : (
                        <rect x={centerX + 4} y={centerY - 1.5} width="3" height="3" fill="#333" />
                      );
                    })()}
                    
                    {/* Кабина (острый угол обозначен формой пятиугольника) */}
                    
                    <text x={centerX} y={unit.y - 3} textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold" fontFamily="sans-serif">{unit.name}</text>
                    <text x={centerX} y={unit.y + 12} textAnchor="middle" fill="#aaa" fontSize="5" fontFamily="sans-serif">{unit.role}</text>
                    
                    {/* Person near pump */}
                    {(() => {
                      const normalizedAngle = ((unit.angle % 360) + 360) % 360;
                      const isCabinRight = normalizedAngle < 90 || normalizedAngle > 270;
                      const pumpX = isCabinRight ? centerX - 5.5 : centerX + 5.5;
                      return (
                        <>
                          <circle cx={pumpX} cy={centerY + 4} r="2" fill="#ffeb3b" opacity="0.6" />
                          <text x={pumpX} y={centerY + 5} textAnchor="middle" fontSize="3">🧑‍🚒</text>
                        </>
                      );
                    })()}
                  </g>
                );
              })}

              {/* Manual units */}
              {manualUnits.map(unit => {
                const isSelected = selectedUnitId === unit.id;
                const centerX = unit.x + 8;
                const centerY = unit.y + 2.5;
                const truckColor = unit.type === 'ac' ? '#b71c1c' : unit.type === 'asa' ? '#d32f2f' : '#4a148c';
                
                return (
                  <g 
                    key={unit.id} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUnitId(isSelected ? null : unit.id);
                    }}
                    onMouseDown={e => {
                      if (isSelected) {
                        handleMouseDown(e, 'unit', unit.id);
                      }
                    }}
                    style={{ cursor: isSelected ? 'move' : 'pointer' }}
                  >
                    {/* Тень */}
                    <polygon points={getFireTruckPoints(centerX + 0.5, centerY + 0.5, unit.angle)} fill="rgba(0,0,0,0.3)" />
                    
                    {/* Основной пятиугольник автомобиля */}
                    <polygon 
                      points={getFireTruckPoints(centerX, centerY, unit.angle)} 
                      fill={truckColor}
                      stroke={isSelected ? '#4fc3f7' : '#fff'} 
                      strokeWidth={isSelected ? 1.5 : 0.8}
                    />
                    
                    {/* Насос (темный квадратик) - с противоположной стороны от кабины */}
                    {(() => {
                      const normalizedAngle = ((unit.angle % 360) + 360) % 360;
                      const isCabinRight = normalizedAngle < 90 || normalizedAngle > 270;
                      return isCabinRight ? (
                        <rect x={centerX - 7} y={centerY - 1.5} width="3" height="3" fill="#333" />
                      ) : (
                        <rect x={centerX + 4} y={centerY - 1.5} width="3" height="3" fill="#333" />
                      );
                    })()}
                    
                    <text x={centerX} y={unit.y - 3} textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold" fontFamily="sans-serif">{unit.name}</text>
                    {unit.division && (
                      <text x={centerX} y={unit.y + 12} textAnchor="middle" fill="#81d4fa" fontSize="5" fontFamily="sans-serif">{unit.division}</text>
                    )}
                    {!unit.ptvDeployed && (
                      <text x={centerX} y={unit.y + 20} textAnchor="middle" fill="#ffeb3b" fontSize="5" fontFamily="sans-serif">Нажмите ПТВ</text>
                    )}
                    
                    {/* Person near pump */}
                    {(() => {
                      const normalizedAngle = ((unit.angle % 360) + 360) % 360;
                      const isCabinRight = normalizedAngle < 90 || normalizedAngle > 270;
                      const pumpX = isCabinRight ? centerX - 5.5 : centerX + 5.5;
                      return (
                        <>
                          <circle cx={pumpX} cy={centerY + 4} r="2" fill="#ffeb3b" opacity="0.6" />
                          <text x={pumpX} y={centerY + 5} textAnchor="middle" fontSize="3">🧑‍🚒</text>
                        </>
                      );
                    })()}
                  </g>
                );
              })}

              {/* Compass */}
              <g transform="translate(955, 40)">
                <circle cx="0" cy="0" r="20" fill="rgba(0,0,0,0.6)" stroke="#555" strokeWidth="1" />
                <polygon points="0,-14 -3,0 0,-4 3,0" fill="#ff4444" />
                <polygon points="0,14 -3,0 0,4 3,0" fill="#ccc" />
                <text x="0" y="-15" textAnchor="middle" fill="#ff6666" fontSize="6" fontWeight="bold">С</text>
              </g>

              {/* Scale */}
              <g transform="translate(50, 565)">
                <line x1="0" y1="0" x2="100" y2="0" stroke="#888" strokeWidth="2" />
                <line x1="0" y1="-4" x2="0" y2="4" stroke="#888" strokeWidth="2" />
                <line x1="100" y1="-4" x2="100" y2="4" stroke="#888" strokeWidth="2" />
                <text x="50" y="13" textAnchor="middle" fill="#888" fontSize="7" fontFamily="sans-serif">≈ 50 м</text>
              </g>

              {/* Selection box */}
              {selectionBox && isSelecting && (
                <rect
                  x={Math.min(selectionBox.startX, selectionBox.endX)}
                  y={Math.min(selectionBox.startY, selectionBox.endY)}
                  width={Math.abs(selectionBox.endX - selectionBox.startX)}
                  height={Math.abs(selectionBox.endY - selectionBox.startY)}
                  fill="rgba(59, 130, 246, 0.2)"
                  stroke="#3b82f6"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
              )}

              {/* Selected elements highlights */}
              {selectedElements.map((elem, idx) => {
                if (elem.type === 'unit') {
                  const allUnits = [...(deployment?.units || []), ...manualUnits];
                  const unit = allUnits.find(u => u.id === elem.id);
                  if (unit) {
                    const unitWidth = unit.type === 'asa' ? 55 : 44;
                    return (
                      <rect
                        key={`sel-${idx}`}
                        x={unit.x - 3}
                        y={unit.y - 3}
                        width={unitWidth + 6}
                        height={26}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="4,2"
                      />
                    );
                  }
                } else if (elem.type === 'obstacle') {
                  const obs = obstacles.find(o => o.id === elem.id);
                  if (obs) {
                    return (
                      <rect
                        key={`sel-${idx}`}
                        x={obs.x - 3}
                        y={obs.y - 3}
                        width={obs.width + 6}
                        height={obs.height + 6}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="4,2"
                      />
                    );
                  }
                } else if (elem.type === 'firefighter' && elem.unitId) {
                  const nozzleIndex = parseInt(elem.id.split('-').pop() || '0');
                  const allUnits = [...(deployment?.units || []), ...manualUnits];
                  const unit = allUnits.find(u => u.id === elem.unitId);
                  if (unit && fireSource) {
                    const unitWidth = unit.type === 'asa' ? 55 : 44;
                    const customPos = customPositions[unit.id];
                    const routing = routeHoseAlongCorridor(
                      unit.x, unit.y, unitWidth, 20, fireSource.x, fireSource.y, wagons, obstacles,
                      customPos?.branchPoint,
                      customPos?.nozzles,
                      unit.angle,
                      customPumpPositions[unit.id]
                    );
                    if (routing.nozzles[nozzleIndex]) {
                      return (
                        <circle
                          key={`sel-${idx}`}
                          cx={routing.nozzles[nozzleIndex].x}
                          cy={routing.nozzles[nozzleIndex].y}
                          r="14"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2"
                          strokeDasharray="4,2"
                        />
                      );
                    }
                  }
                } else if (elem.type === 'branch' && elem.unitId) {
                  const allUnits = [...(deployment?.units || []), ...manualUnits];
                  const unit = allUnits.find(u => u.id === elem.unitId);
                  if (unit && fireSource) {
                    const unitWidth = unit.type === 'asa' ? 55 : 44;
                    const customPos = customPositions[unit.id];
                    const routing = routeHoseAlongCorridor(
                      unit.x, unit.y, unitWidth, 20, fireSource.x, fireSource.y, wagons, obstacles,
                      customPos?.branchPoint,
                      customPos?.nozzles,
                      unit.angle,
                      customPumpPositions[unit.id]
                    );
                    return (
                      <rect
                        key={`sel-${idx}`}
                        x={routing.branchPoint.x - 11}
                        y={routing.branchPoint.y - 9}
                        width={22}
                        height={18}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="4,2"
                      />
                    );
                  }
                }
                return null;
              })}

              {/* Ruler measurement */}
              {toolMode === 'ruler' && rulerPoints.length >= 1 && (
                <g>
                  {/* Первая точка всегда видна */}
                  <circle cx={rulerPoints[0].x} cy={rulerPoints[0].y} r="4" fill="#ec4899" />
                  
                  {/* Линия и вторая точка отображаются только когда есть две точки */}
                  {rulerPoints.length === 2 && (
                    <>
                      <line
                        x1={rulerPoints[0].x}
                        y1={rulerPoints[0].y}
                        x2={rulerPoints[1].x}
                        y2={rulerPoints[1].y}
                        stroke="#ec4899"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                      />
                      <circle cx={rulerPoints[1].x} cy={rulerPoints[1].y} r="4" fill="#ec4899" />
                      <text
                        x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                        y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 10}
                        textAnchor="middle"
                        fill="#ec4899"
                        fontSize="12"
                        fontWeight="bold"
                      >
                        {(() => {
                          const dx = rulerPoints[1].x - rulerPoints[0].x;
                          const dy = rulerPoints[1].y - rulerPoints[0].y;
                          const distance = Math.sqrt(dx * dx + dy * dy);
                          const meters = (distance * 0.5).toFixed(1);
                          return `${meters} м`;
                        })()}
                      </text>
                    </>
                  )}
                </g>
              )}

              {/* Personnel positions */}
              {deployment?.personnelPositions && deployment.personnelPositions.map((pos, idx) => (
                <g 
                  key={`personnel-${idx}`}
                  onMouseDown={e => {
                    if (toolMode === 'select' || toolMode === 'none') {
                      e.stopPropagation();
                      const { x, y } = getSVGCoords(e);
                      setDragState({
                        type: 'personnel',
                        id: `personnel-${idx}`,
                        offsetX: x - pos.x,
                        offsetY: y - pos.y
                      });
                    }
                  }}
                  style={{ cursor: toolMode === 'select' || toolMode === 'none' ? 'move' : 'default' }}
                >
                  <circle cx={pos.x} cy={pos.y} r="3" fill="#ff9800" opacity="0.8" />
                  <text x={pos.x} y={pos.y + 1.5} textAnchor="middle" fontSize="4">🧑</text>
                </g>
              ))}

              {/* Firefighters layer - always on top */}
              {fireSource && [...(deployment?.units.filter(u => u.hoses > 0) || []), ...manualUnits.filter(u => u.ptvDeployed)].map(unit => {
                const unitWidth = unit.type === 'asa' ? 55 : 44;
                const fs = fireSource!;
                const customPos = customPositions[unit.id];
                const routing = routeHoseAlongCorridor(
                  unit.x, unit.y, unitWidth, 20, fs.x, fs.y, wagons, obstacles,
                  customPos?.branchPoint,
                  customPos?.nozzles,
                  unit.angle,
                  customPumpPositions[unit.id]
                );

                return routing.nozzles.map((nozzle, idx) => {
                  const dx = fs.x - nozzle.x;
                  const dy = fs.y - nozzle.y;
                  const angle = Math.atan2(dy, dx);

                  // Check for NaN values
                  if (isNaN(nozzle.x) || isNaN(nozzle.y) || isNaN(angle)) {
                    return null;
                  }

                  return (
                    <g
                      key={`firefighter-top-${unit.id}-${idx}`}
                      onMouseDown={e => handleMouseDown(e, 'firefighter', `${unit.id}-${idx}`, unit.id)}
                      style={{ cursor: 'move' }}
                    >
                      {/* Larger hit area for easier dragging */}
                      <circle cx={nozzle.x} cy={nozzle.y} r="12" fill="transparent" />
                      
                      {/* Firefighter circle */}
                      <circle cx={nozzle.x} cy={nozzle.y} r="5" fill="#e3f2fd" stroke="#1565c0" strokeWidth="1.5" />
                      
                      {/* Direction indicator */}
                      <line
                        x1={nozzle.x}
                        y1={nozzle.y}
                        x2={nozzle.x + Math.cos(angle) * 8}
                        y2={nozzle.y + Math.sin(angle) * 8}
                        stroke="#1565c0"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      
                      {/* Firefighter icon */}
                      <text x={nozzle.x} y={nozzle.y + 3} textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">🧑‍🚒</text>
                      
                      {/* Highlight ring when in select mode */}
                      {(toolMode === 'select' || toolMode === 'none' || toolMode === 'selection') && (
                        <circle cx={nozzle.x} cy={nozzle.y} r="9" fill="none" stroke="#ffeb3b" strokeWidth="1" opacity="0.8">
                          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                      )}
                    </g>
                  );
                });
              })}
            </svg>

            {placingUnit && (
              <div className="absolute top-2 left-2 bg-red-600/90 backdrop-blur-sm rounded px-3 py-2 border border-red-400">
                <span className="text-xs text-white font-semibold">👆 Кликните на карту для размещения {placingUnit === 'asa' ? 'аварийно-спасательного (АСА)' : placingUnit === 'aso' ? 'машины связи и освещения (АСО)' : 'автоцистерны (АЦ)'}</span>
              </div>
            )}
            
            {!placingUnit && (
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1 border border-gray-600/50">
                <span className="text-[10px] text-gray-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  {toolMode === 'none' ? 'Просмотр (клик на объект для выбора)' : 
                   toolMode === 'fire' ? 'Установка очага пожара' : 
                   toolMode === 'obstacle' ? 'Размещение препятствий' : 
                   toolMode === 'water' ? 'Размещение водоисточника' :
                   toolMode === 'selection' ? '⬚ Выделение области' :
                   toolMode === 'ruler' ? '📏 Линейка (кликните 2 точки)' :
                   'Перемещение объектов'}
                </span>
              </div>
            )}

            {/* Selection info */}
            {selectedElements.length > 0 && (
              <div className="absolute top-2 right-2 bg-blue-600/90 backdrop-blur-sm rounded px-3 py-2 border border-blue-400">
                <div className="text-xs text-white font-semibold mb-1">
                  Выделено: {selectedElements.length}
                </div>
                <div className="text-[10px] text-blue-100 space-y-0.5">
                  {selectedElements.filter(e => e.type === 'unit').length > 0 && (
                    <div>🚒 Техника: {selectedElements.filter(e => e.type === 'unit').length}</div>
                  )}
                  {selectedElements.filter(e => e.type === 'obstacle').length > 0 && (
                    <div>🧱 Препятствия: {selectedElements.filter(e => e.type === 'obstacle').length}</div>
                  )}
                  {selectedElements.filter(e => e.type === 'firefighter').length > 0 && (
                    <div>🧑‍🚒 Ствольщики: {selectedElements.filter(e => e.type === 'firefighter').length}</div>
                  )}
                  {selectedElements.filter(e => e.type === 'branch').length > 0 && (
                    <div>⚙️ Разветвления: {selectedElements.filter(e => e.type === 'branch').length}</div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedElements([])}
                  className="mt-1 text-[10px] text-blue-200 hover:text-white underline"
                >
                  Снять выделение
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {showResources && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowResources(false)}>
          <div className="bg-gray-800 rounded-xl p-5 w-[400px] border border-gray-600" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-3">📋 Задать количество сил</h2>
            {idealResources && (
              <p className="text-[10px] text-yellow-300 mb-3">💡 Рекомендуется: АЦ×{idealResources.ac}, АСА×{idealResources.al}, АСО×{idealResources.asr}, л/с {idealResources.personnel}ч.</p>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] text-gray-300 block mb-1">🚒 АЦ</label>
                <input type="number" min="0" max="20" value={resources.ac} onChange={e => setResources(prev => ({ ...prev, ac: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm border border-gray-600" />
              </div>
              <div>
                <label className="text-[11px] text-gray-300 block mb-1">🚑 АСА</label>
                <input type="number" min="0" max="10" value={resources.al} onChange={e => setResources(prev => ({ ...prev, al: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm border border-gray-600" />
              </div>
              <div>
                <label className="text-[11px] text-gray-300 block mb-1">📡 АСО</label>
                <input type="number" min="0" max="5" value={resources.asr} onChange={e => setResources(prev => ({ ...prev, asr: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm border border-gray-600" />
              </div>
              <div>
                <label className="text-[11px] text-gray-300 block mb-1">👨‍🚒 Л/с (чел.)</label>
                <input type="number" min="0" max="200" value={resources.personnel} onChange={e => setResources(prev => ({ ...prev, personnel: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm border border-gray-600" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setUseCustomResources(true); if (fireSource) setDeployment(calculateDeployment(wagons, fireSource, obstacles, resources, waterSources)); setShowResources(false); }} className="flex-1 py-2 bg-indigo-600 rounded-lg text-sm font-semibold">✅ Применить</button>
              <button onClick={() => setShowResources(false)} className="px-4 py-2 bg-gray-700 rounded-lg text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-gray-800 rounded-xl p-5 max-w-lg border border-gray-600" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-3">📖 Справка</h2>
            <div className="space-y-2 text-[12px] text-gray-300">
              <p><strong className="text-purple-400">Типы вагонов:</strong> Клик на вагон для смены типа. Кнопки "Тип поезда" для изменения всех вагонов сразу.</p>
              <p><strong className="text-red-400">+АЦ/+АСА/+АСО:</strong> Ручное добавление пожарной техники. Выберите тип и кликните на карту. АСО не имеет воды и ПТВ.</p>
              <p><strong className="text-red-400">+Пожарный поезд:</strong> Добавление пожарного поезда (3 вагона, 1 цистерна). Размещается на тех же путях на расстоянии 50 м от основного поезда.</p>
              <p><strong className="text-green-400">Расставить ПТВ:</strong> Выберите добавленную машину и нажмите кнопку для автоматической прокладки рукавной линии к очагу пожара.</p>
              <p><strong className="text-cyan-400">Перемещение:</strong> Режим "Перемещение" позволяет двигать технику, разветвления РТ-80, ствольщиков и препятствия. Ствольщиков и разветвления можно перемещать в любом режиме. Рукава и струи пересчитываются автоматически.</p>
              <p><strong className="text-blue-400">Выделение:</strong> В режиме "Перемещение" или "Просмотр" можно выделить несколько элементов прямоугольной областью (кликните на пустое место и тяните). Все выделенные элементы можно перемещать одновременно.</p>
              <p><strong className="text-yellow-400">Подразделение:</strong> Выберите машину и укажите принадлежность к подразделению (например, "ПЧ-12").</p>
              <p><strong className="text-blue-400">Смена типа техники:</strong> Кликните на размещённую машину для изменения её типа (АЦ/АСА/АСО).</p>
              <div className="mt-3 pt-2 border-t border-gray-700 text-[11px] text-gray-400 space-y-1">
                <p>🔗 <strong>Рукавные линии:</strong> прокладываются вдоль вагонов на расстоянии 5м снаружи по кратчайшему пути.</p>
                <p>🧑‍🚒 <strong>Личный состав:</strong> отображается у каждой машины (1 чел.) и у каждого разветвления РТ-80.</p>
                <p>🎯 <strong>Ствольщики:</strong> размещаются на расстоянии 5-6м от вагона с очагом пожара с противоположных сторон.</p>
                <p>🛡 <strong>Безопасность:</strong> техника располагается не ближе 100м от очага пожара.</p>
                <p>⚙️ <strong>Рукава:</strong> каждый рукав длиной 20м, соединения отмечены кружками на схеме. Рукава прокладываются по кратчайшему пути от машины к очагу.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-4 w-full py-2 bg-gray-700 rounded-lg text-sm">Понятно</button>
          </div>
        </div>
      )}
    </div>
  );
}
