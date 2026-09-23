import { useState, useCallback, useRef, useMemo } from 'react';
import { Wagon, FireSource, Obstacle, Deployment, ToolMode, ObstacleType, AvailableResources } from './types';
import { calculateDeployment, generateDefaultWagons, getIdealResources } from './utils/deployment';

const WAGON_GAP = 6;

const OBSTACLE_DEFAULTS: Record<ObstacleType, { width: number; height: number; label: string; icon: string }> = {
  building: { width: 80, height: 60, label: 'Здание', icon: '🏢' },
  fence: { width: 100, height: 15, label: 'Забор', icon: '🚧' },
  equipment: { width: 40, height: 30, label: 'Техника', icon: '🚜' },
  depot: { width: 90, height: 50, label: 'Депо', icon: '🏭' },
  tree_group: { width: 50, height: 50, label: 'Деревья', icon: '🌲' },
  road: { width: 120, height: 25, label: 'Дорога', icon: '🛤' },
};

const DEFAULT_RESOURCES: AvailableResources = {
  ac: 6,
  al: 1,
  ap: 1,
  asr: 1,
  personnel: 60,
};

export default function App() {
  const [wagons] = useState<Wagon[]>(generateDefaultWagons());
  const [fireSource, setFireSource] = useState<FireSource | null>(null);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('none');
  const [obstacleType, setObstacleType] = useState<ObstacleType>('building');
  const [fireIntensity, setFireIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [fireType, setFireType] = useState<'wagon_body' | 'tank' | 'undercarriage' | 'cargo'>('wagon_body');
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [showResources, setShowResources] = useState(false);
  const [resources, setResources] = useState<AvailableResources>(DEFAULT_RESOURCES);
  const [useCustomResources, setUseCustomResources] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const idealResources = useMemo(() => {
    if (!fireSource) return null;
    return getIdealResources(fireSource);
  }, [fireSource]);

  const getSVGCoords = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 600;
    return { x, y };
  }, []);

  const handleSVGClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging) return;
    const { x, y } = getSVGCoords(e);

    if (toolMode === 'fire') {
      const clickedWagon = wagons.find(
        w => x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height
      );
      if (clickedWagon) {
        setFireSource({
          wagonId: clickedWagon.id,
          x,
          y,
          intensity: fireIntensity,
          type: fireType,
        });
        setDeployment(null);
      }
    } else if (toolMode === 'obstacle') {
      const defaults = OBSTACLE_DEFAULTS[obstacleType];
      const newObs: Obstacle = {
        id: `obs-${Date.now()}`,
        x: x - defaults.width / 2,
        y: y - defaults.height / 2,
        width: defaults.width,
        height: defaults.height,
        type: obstacleType,
        label: defaults.label,
      };
      setObstacles(prev => [...prev, newObs]);
      setDeployment(null);
    }
  }, [toolMode, wagons, fireIntensity, fireType, obstacleType, getSVGCoords, dragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent, obsId: string) => {
    if (toolMode !== 'select') return;
    e.stopPropagation();
    const { x, y } = getSVGCoords(e);
    const obs = obstacles.find(o => o.id === obsId);
    if (obs) {
      setDragging(obsId);
      setDragOffset({ x: x - obs.x, y: y - obs.y });
    }
  }, [toolMode, obstacles, getSVGCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const { x, y } = getSVGCoords(e);
    setObstacles(prev => prev.map(o =>
      o.id === dragging ? { ...o, x: x - dragOffset.x, y: y - dragOffset.y } : o
    ));
  }, [dragging, dragOffset, getSVGCoords]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleDeploy = useCallback(() => {
    const result = calculateDeployment(wagons, fireSource, obstacles, useCustomResources ? resources : null);
    setDeployment(result);
  }, [wagons, fireSource, obstacles, resources, useCustomResources]);

  const handleReset = useCallback(() => {
    setFireSource(null);
    setObstacles([]);
    setDeployment(null);
    setToolMode('none');
  }, []);

  const handleClearFire = useCallback(() => {
    setFireSource(null);
    setDeployment(null);
  }, []);

  const handleDeleteObstacle = useCallback((id: string) => {
    const newObs = obstacles.filter(o => o.id !== id);
    setObstacles(newObs);
    if (deployment && fireSource) {
      setDeployment(calculateDeployment(wagons, fireSource, newObs, useCustomResources ? resources : null));
    }
  }, [wagons, fireSource, obstacles, deployment, useCustomResources, resources]);

  const handleApplyResources = useCallback(() => {
    setUseCustomResources(true);
    if (fireSource) {
      const result = calculateDeployment(wagons, fireSource, obstacles, resources);
      setDeployment(result);
    }
    setShowResources(false);
  }, [wagons, fireSource, obstacles, resources]);

  const handleResetResources = useCallback(() => {
    setUseCustomResources(false);
    if (fireSource) {
      const result = calculateDeployment(wagons, fireSource, obstacles, null);
      setDeployment(result);
    }
  }, [wagons, fireSource, obstacles]);

  const fireWagonLabel = useMemo(() => {
    if (!fireSource) return '';
    const w = wagons.find(w => w.id === fireSource.wagonId);
    return w ? w.label : '';
  }, [fireSource, wagons]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 px-4 py-2 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center shadow-md">
              <span className="text-lg">🚒</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Расстановка сил и средств ПО</h1>
              <p className="text-[10px] text-gray-400">Тушение пожаров ЖД составов | Вид сверху</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResources(true)}
              className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
            >
              📋 Задать количество сил
            </button>
            <button
              onClick={handleDeploy}
              disabled={!fireSource}
              className="px-4 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-xs transition-all shadow-md"
            >
              🚀 Расставить силы
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition-colors"
            >
              ❓
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-medium transition-colors"
            >
              🔄 Сброс
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-[270px] bg-gray-800/95 border-r border-gray-700 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 overflow-y-auto flex-1 space-y-3">
            {/* Tools */}
            <div>
              <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Инструменты</h3>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setToolMode(toolMode === 'fire' ? 'none' : 'fire')}
                  className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    toolMode === 'fire' ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🔥 Очаг пожара
                </button>
                <button
                  onClick={() => setToolMode(toolMode === 'obstacle' ? 'none' : 'obstacle')}
                  className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    toolMode === 'obstacle' ? 'bg-yellow-600 text-white shadow-md' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🧱 Препятствия
                </button>
                <button
                  onClick={() => setToolMode(toolMode === 'select' ? 'none' : 'select')}
                  className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    toolMode === 'select' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  ✋ Перемещение
                </button>
                <button
                  onClick={() => setToolMode('none')}
                  className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    toolMode === 'none' ? 'bg-green-600 text-white shadow-md' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  👁 Просмотр
                </button>
              </div>
            </div>

            {/* Fire Settings */}
            {toolMode === 'fire' && (
              <div className="p-2.5 bg-orange-900/20 rounded-lg border border-orange-500/30">
                <h3 className="text-[11px] font-semibold text-orange-400 mb-1.5">🔥 Параметры пожара</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Интенсивность</label>
                    <div className="flex gap-1">
                      {([['low', 'Слабая'], ['medium', 'Средняя'], ['high', 'Сильная']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setFireIntensity(val)}
                          className={`flex-1 px-1 py-1 rounded text-[10px] font-medium transition-all ${
                            fireIntensity === val
                              ? val === 'low' ? 'bg-yellow-700 ring-1 ring-yellow-400' : val === 'medium' ? 'bg-orange-700 ring-1 ring-orange-400' : 'bg-red-700 ring-1 ring-red-400'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-0.5">Характер</label>
                    <select
                      value={fireType}
                      onChange={e => setFireType(e.target.value as FireSource['type'])}
                      className="w-full px-2 py-1 bg-gray-700 rounded text-[10px] text-white border border-gray-600"
                    >
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

            {/* Obstacle Settings */}
            {toolMode === 'obstacle' && (
              <div className="p-2.5 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
                <h3 className="text-[11px] font-semibold text-yellow-400 mb-1.5">🧱 Тип препятствия</h3>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(OBSTACLE_DEFAULTS) as ObstacleType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setObstacleType(type)}
                      className={`px-1.5 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1 ${
                        obstacleType === type ? 'bg-yellow-600 text-white ring-1 ring-yellow-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span className="text-xs">{OBSTACLE_DEFAULTS[type].icon}</span>
                      <span>{OBSTACLE_DEFAULTS[type].label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-yellow-300/70 italic mt-1.5">👆 Кликните на карту</p>
              </div>
            )}

            {/* Current fire info */}
            {fireSource && (
              <div className="p-2 bg-red-900/20 rounded-lg border border-red-500/30">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[10px] font-semibold text-red-400">🔥 Очаг установлен</h3>
                  <button onClick={handleClearFire} className="text-[9px] text-red-400 hover:text-red-300">✕</button>
                </div>
                <div className="text-[10px] text-gray-300 space-y-0.5">
                  <p>Вагон: <span className="text-white font-medium">{fireWagonLabel}</span></p>
                  <p>Интенсивность: <span className="text-white">{fireSource.intensity === 'low' ? 'Слабая' : fireSource.intensity === 'medium' ? 'Средняя' : 'Сильная'}</span></p>
                  <p>Тип: <span className="text-white">{fireSource.type === 'wagon_body' ? 'Корпус' : fireSource.type === 'tank' ? 'Цистерна' : fireSource.type === 'undercarriage' ? 'Ходовая' : 'Груз'}</span></p>
                  {idealResources && (
                    <p className="text-yellow-400 mt-1">Оптимально: АЦ×{idealResources.ac}, АЛ×{idealResources.al}, АП×{idealResources.ap}, л/с {idealResources.personnel}ч.</p>
                  )}
                </div>
              </div>
            )}

            {/* Resources indicator */}
            {useCustomResources && (
              <div className="p-2 bg-indigo-900/20 rounded-lg border border-indigo-500/30">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[10px] font-semibold text-indigo-400">📋 Заданные силы</h3>
                  <button onClick={handleResetResources} className="text-[9px] text-indigo-400 hover:text-indigo-300">Сбросить</button>
                </div>
                <div className="text-[10px] text-gray-300 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <span>АЦ: {resources.ac}</span>
                  <span>АЛ: {resources.al}</span>
                  <span>АП: {resources.ap}</span>
                  <span>АСР: {resources.asr}</span>
                  <span className="col-span-2">Л/состав: {resources.personnel} чел.</span>
                </div>
              </div>
            )}

            {/* Obstacles list */}
            {obstacles.length > 0 && (
              <div>
                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Препятствия ({obstacles.length})</h3>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {obstacles.map(obs => (
                    <div key={obs.id} className="flex items-center justify-between bg-gray-700/60 rounded px-2 py-0.5">
                      <span className="text-[10px] text-gray-300 flex items-center gap-1">
                        <span>{OBSTACLE_DEFAULTS[obs.type]?.icon}</span>{obs.label}
                      </span>
                      <button onClick={() => handleDeleteObstacle(obs.id)} className="text-red-400 hover:text-red-300 text-[10px]">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deployment results */}
            {deployment && (
              <div className="p-2.5 bg-green-900/20 rounded-lg border border-green-500/30">
                <h3 className="text-[11px] font-semibold text-green-400 mb-1.5">✅ Расстановка выполнена</h3>

                <div className="grid grid-cols-3 gap-1 mb-2">
                  <div className="bg-gray-700/80 rounded p-1 text-center">
                    <div className="text-sm font-bold text-white">{deployment.units.length}</div>
                    <div className="text-[8px] text-gray-400">Ед.техники</div>
                  </div>
                  <div className="bg-gray-700/80 rounded p-1 text-center">
                    <div className="text-sm font-bold text-white">{deployment.totalPersonnel}</div>
                    <div className="text-[8px] text-gray-400">Л/состав</div>
                  </div>
                  <div className="bg-gray-700/80 rounded p-1 text-center">
                    <div className="text-sm font-bold text-white">{deployment.totalHoses}</div>
                    <div className="text-[8px] text-gray-400">Стволов</div>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="text-[9px] text-cyan-400 mb-0.5">🛡 Безопасное расстояние: {(deployment.safeRadius * 0.5).toFixed(0)} м</div>
                </div>

                {/* Warnings */}
                {deployment.warnings.length > 0 && (
                  <div className="mb-2 space-y-0.5">
                    {deployment.warnings.map((w, i) => (
                      <div key={i} className="text-[9px] text-yellow-300 bg-yellow-900/30 rounded px-1.5 py-0.5">{w}</div>
                    ))}
                  </div>
                )}

                <div className="mb-1.5">
                  <h4 className="text-[9px] font-semibold text-gray-300">Стратегия:</h4>
                  <p className="text-[9px] text-gray-400 leading-relaxed">{deployment.strategy}</p>
                </div>

                <div>
                  <h4 className="text-[9px] font-semibold text-gray-300 mb-0.5">Подразделения:</h4>
                  <div className="space-y-0.5 max-h-36 overflow-y-auto">
                    {deployment.units.map(unit => (
                      <div key={unit.id} className="bg-gray-700/60 rounded p-1 border-l-2 border-red-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-medium text-white">{unit.name}</span>
                          <span className="text-[8px] text-gray-400">{unit.personnel}ч. | {unit.hoses}ств.</span>
                        </div>
                        <div className="text-[8px] text-gray-400">{unit.role}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Canvas */}
        <main className="flex-1 p-2 flex flex-col overflow-hidden">
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden relative">
            <svg
              ref={svgRef}
              viewBox="0 0 1000 600"
              className="w-full h-full"
              onClick={handleSVGClick}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: toolMode === 'fire' ? 'crosshair' : toolMode === 'obstacle' ? 'cell' : 'default' }}
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
                <radialGradient id="safeZone">
                  <stop offset="0%" stopColor="transparent" />
                  <stop offset="85%" stopColor="transparent" />
                  <stop offset="100%" stopColor="#ff4400" stopOpacity="0.15" />
                </radialGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="shadow">
                  <feDropShadow dx="1" dy="1" stdDeviation="1.5" floodOpacity="0.4" />
                </filter>
              </defs>

              {/* Background */}
              <rect width="1000" height="600" fill="#1e2a1e" />
              <rect width="1000" height="600" fill="url(#grid)" />

              {/* Ground texture - top area */}
              <rect x="0" y="0" width="1000" height="260" fill="#1a2a1a" opacity="0.3" />
              <rect x="0" y="360" width="1000" height="240" fill="#1a2a1a" opacity="0.3" />

              {/* === RAILWAY TRACKS (top view) === */}
              <g>
                {/* Ballast */}
                <rect x="55" y="280" width="890" height="60" fill="#3a3a3a" rx="3" />
                <rect x="55" y="283" width="890" height="54" fill="#444" rx="2" />

                {/* Sleepers (top view - perpendicular to rails) */}
                {Array.from({ length: 50 }, (_, i) => (
                  <rect key={i} x={62 + i * 18} y="278" width="5" height="64" fill="#5a4a3a" rx="1" opacity="0.7" />
                ))}

                {/* Rails (top view - two parallel lines) */}
                <line x1="60" y1="290" x2="940" y2="290" stroke="#aaa" strokeWidth="2.5" />
                <line x1="60" y1="330" x2="940" y2="330" stroke="#aaa" strokeWidth="2.5" />
                {/* Rail shine */}
                <line x1="60" y1="289" x2="940" y2="289" stroke="#ccc" strokeWidth="0.5" />
                <line x1="60" y1="329" x2="940" y2="329" stroke="#ccc" strokeWidth="0.5" />
              </g>

              {/* === WAGONS (top view) === */}
              {wagons.map(wagon => {
                const isOnFire = fireSource?.wagonId === wagon.id;
                return (
                  <g key={wagon.id}>
                    {/* Wagon shadow */}
                    <rect x={wagon.x + 2} y={wagon.y + 2} width={wagon.width} height={wagon.height} fill="rgba(0,0,0,0.3)" rx="3" />

                    {/* Wagon body (top view) */}
                    <rect
                      x={wagon.x}
                      y={wagon.y}
                      width={wagon.width}
                      height={wagon.height}
                      fill={
                        wagon.type === 'tank' ? '#3a5a35' :
                        wagon.type === 'passenger' ? '#3a4a5a' :
                        wagon.type === 'platform' ? '#4a4a4a' : '#5a4a3a'
                      }
                      stroke={isOnFire ? '#ff4500' : '#666'}
                      strokeWidth={isOnFire ? 2.5 : 1}
                      rx="3"
                    />

                    {/* Type-specific top view details */}
                    {wagon.type === 'tank' && (
                      <>
                        {/* Tank cylinder top view */}
                        <ellipse
                          cx={wagon.x + wagon.width / 2}
                          cy={wagon.y + wagon.height / 2}
                          rx={wagon.width / 2 - 6}
                          ry={wagon.height / 2 - 4}
                          fill="none"
                          stroke="#5a7a55"
                          strokeWidth="1.5"
                        />
                        {/* Dome hatch */}
                        <circle cx={wagon.x + wagon.width / 2} cy={wagon.y + wagon.height / 2} r="4" fill="#4a6a45" stroke="#6a8a65" strokeWidth="0.5" />
                        {/* End caps */}
                        <line x1={wagon.x + 8} y1={wagon.y + 3} x2={wagon.x + 8} y2={wagon.y + wagon.height - 3} stroke="#5a7a55" strokeWidth="0.5" />
                        <line x1={wagon.x + wagon.width - 8} y1={wagon.y + 3} x2={wagon.x + wagon.width - 8} y2={wagon.y + wagon.height - 3} stroke="#5a7a55" strokeWidth="0.5" />
                      </>
                    )}
                    {wagon.type === 'passenger' && (
                      <>
                        {/* Windows row (top view) */}
                        {Array.from({ length: 6 }, (_, i) => (
                          <rect
                            key={i}
                            x={wagon.x + 8 + i * 13}
                            y={wagon.y + 3}
                            width="8"
                            height="3"
                            fill="#5a8aaa"
                            rx="0.5"
                            opacity="0.7"
                          />
                        ))}
                        {Array.from({ length: 6 }, (_, i) => (
                          <rect
                            key={`b${i}`}
                            x={wagon.x + 8 + i * 13}
                            y={wagon.y + wagon.height - 6}
                            width="8"
                            height="3"
                            fill="#5a8aaa"
                            rx="0.5"
                            opacity="0.7"
                          />
                        ))}
                        {/* Center corridor */}
                        <line x1={wagon.x + 5} y1={wagon.y + wagon.height / 2} x2={wagon.x + wagon.width - 5} y2={wagon.y + wagon.height / 2} stroke="#4a5a6a" strokeWidth="0.5" strokeDasharray="3,2" />
                      </>
                    )}
                    {wagon.type === 'freight' && (
                      <>
                        {/* Cargo cover ribs */}
                        {Array.from({ length: 4 }, (_, i) => (
                          <line
                            key={i}
                            x1={wagon.x + 15 + i * 20}
                            y1={wagon.y + 2}
                            x2={wagon.x + 15 + i * 20}
                            y2={wagon.y + wagon.height - 2}
                            stroke="#6a5a4a"
                            strokeWidth="0.5"
                          />
                        ))}
                      </>
                    )}
                    {wagon.type === 'platform' && (
                      <>
                        {/* Platform frame */}
                        <rect x={wagon.x + 4} y={wagon.y + 4} width={wagon.width - 8} height={wagon.height - 8} fill="none" stroke="#666" strokeWidth="0.5" strokeDasharray="4,2" />
                        {/* Cross beams */}
                        <line x1={wagon.x + wagon.width / 2} y1={wagon.y + 4} x2={wagon.x + wagon.width / 2} y2={wagon.y + wagon.height - 4} stroke="#555" strokeWidth="0.5" />
                      </>
                    )}

                    {/* Bogies/wheels (top view - visible as dark rectangles under wagon) */}
                    <rect x={wagon.x + 5} y={wagon.y - 2} width="14" height={wagon.height + 4} fill="#222" rx="2" opacity="0.4" />
                    <rect x={wagon.x + wagon.width - 19} y={wagon.y - 2} width="14" height={wagon.height + 4} fill="#222" rx="2" opacity="0.4" />

                    {/* Coupling */}
                    {wagon.id < wagons.length && (
                      <rect x={wagon.x + wagon.width} y={wagon.y + wagon.height / 2 - 2} width={WAGON_GAP} height="4" fill="#555" rx="1" />
                    )}

                    {/* Label */}
                    <text
                      x={wagon.x + wagon.width / 2}
                      y={wagon.y - 8}
                      textAnchor="middle"
                      fill={isOnFire ? '#ff8800' : '#aaa'}
                      fontSize="7"
                      fontFamily="sans-serif"
                      fontWeight={isOnFire ? 'bold' : 'normal'}
                    >
                      {wagon.label}
                    </text>
                  </g>
                );
              })}

              {/* === SAFE DISTANCE ZONE === */}
              {fireSource && deployment && (
                <circle
                  cx={fireSource.x}
                  cy={fireSource.y}
                  r={deployment.safeRadius}
                  fill="none"
                  stroke="#ff4400"
                  strokeWidth="1.5"
                  strokeDasharray="8,4"
                  opacity="0.5"
                />
              )}
              {fireSource && deployment && (
                <text
                  x={fireSource.x + deployment.safeRadius + 5}
                  y={fireSource.y - 5}
                  fill="#ff6644"
                  fontSize="7"
                  fontFamily="sans-serif"
                  opacity="0.7"
                >
                  ⚠ {(deployment.safeRadius * 0.5).toFixed(0)}м
                </text>
              )}

              {/* === FIRE SOURCE (top view) === */}
              {fireSource && (
                <g>
                  {/* Smoke plume (top view - spreading circle) */}
                  <circle cx={fireSource.x} cy={fireSource.y - 15} r="20" fill="rgba(80,80,80,0.3)">
                    <animate attributeName="r" values="18;25;18" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0.15;0.3" dur="3s" repeatCount="indefinite" />
                  </circle>

                  {/* Fire glow (top view) */}
                  <circle cx={fireSource.x} cy={fireSource.y} r={fireSource.intensity === 'high' ? 35 : fireSource.intensity === 'medium' ? 25 : 18} fill="url(#fireRadial)" opacity="0.7">
                    <animate attributeName="r" values={fireSource.intensity === 'high' ? "33;40;33" : fireSource.intensity === 'medium' ? "23;28;23" : "16;20;16"} dur="0.8s" repeatCount="indefinite" />
                  </circle>

                  {/* Fire core */}
                  <circle cx={fireSource.x} cy={fireSource.y} r={fireSource.intensity === 'high' ? 12 : fireSource.intensity === 'medium' ? 9 : 6} fill="#ff4500" filter="url(#glow)" opacity="0.9">
                    <animate attributeName="r" values={fireSource.intensity === 'high' ? "10;14;10" : fireSource.intensity === 'medium' ? "7;11;7" : "5;8;5"} dur="0.5s" repeatCount="indefinite" />
                  </circle>

                  {/* Fire label */}
                  <text x={fireSource.x} y={fireSource.y + 3} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">🔥</text>
                </g>
              )}

              {/* === OBSTACLES (top view) === */}
              {obstacles.map(obs => (
                <g
                  key={obs.id}
                  onMouseDown={e => handleMouseDown(e, obs.id)}
                  style={{ cursor: toolMode === 'select' ? 'move' : 'default' }}
                >
                  <rect
                    x={obs.x}
                    y={obs.y}
                    width={obs.width}
                    height={obs.height}
                    fill={
                      obs.type === 'building' ? '#3a3a5a' :
                      obs.type === 'fence' ? '#5a4a3a' :
                      obs.type === 'equipment' ? '#4a4a4a' :
                      obs.type === 'depot' ? '#3a4a5a' :
                      obs.type === 'tree_group' ? '#1a4a1a' :
                      '#2a2a2a'
                    }
                    fillOpacity="0.85"
                    stroke={toolMode === 'select' ? '#4fc3f7' : '#777'}
                    strokeWidth={toolMode === 'select' ? 2 : 1}
                    strokeDasharray={obs.type === 'fence' ? '5,3' : obs.type === 'road' ? '8,4' : 'none'}
                    rx={obs.type === 'tree_group' ? obs.width / 2 : "3"}
                  />
                  <text
                    x={obs.x + obs.width / 2}
                    y={obs.y + obs.height / 2 + 4}
                    textAnchor="middle"
                    fontSize={Math.min(obs.width, obs.height) > 30 ? '14' : '10'}
                  >
                    {OBSTACLE_DEFAULTS[obs.type]?.icon}
                  </text>
                  {toolMode === 'select' && (
                    <text x={obs.x + obs.width / 2} y={obs.y - 3} textAnchor="middle" fill="#4fc3f7" fontSize="7" fontFamily="sans-serif">
                      {obs.label}
                    </text>
                  )}
                </g>
              ))}

              {/* === DEPLOYED UNITS (top view) === */}
              {deployment?.units.map(unit => (
                <g key={unit.id}>
                  {/* Hose line (curved) */}
                  {fireSource && (
                    <path
                      d={`M ${unit.x + 22} ${unit.y + 11} Q ${(unit.x + 22 + fireSource.x) / 2 + (unit.y > fireSource.y ? 15 : -15)} ${(unit.y + 11 + fireSource.y) / 2} ${fireSource.x} ${fireSource.y}`}
                      fill="none"
                      stroke="#4fc3f7"
                      strokeWidth="1.5"
                      strokeDasharray="5,3"
                      opacity="0.6"
                    >
                      <animate attributeName="stroke-dashoffset" values="0;-16" dur="1s" repeatCount="indefinite" />
                    </path>
                  )}

                  {/* Unit shadow */}
                  <rect x={unit.x + 1} y={unit.y + 1} width={unit.type === 'al' ? 55 : 44} height="20" fill="rgba(0,0,0,0.4)" rx="3" />

                  {/* Unit body (top view) */}
                  <rect
                    x={unit.x}
                    y={unit.y}
                    width={unit.type === 'al' ? 55 : 44}
                    height="20"
                    fill={
                      unit.type === 'aca' ? '#b71c1c' :
                      unit.type === 'ac' ? '#c62828' :
                      unit.type === 'al' ? '#d32f2f' :
                      unit.type === 'ap' ? '#e65100' :
                      '#4a148c'
                    }
                    stroke="#fff"
                    strokeWidth="1.2"
                    rx="3"
                  />

                  {/* Unit details (top view) */}
                  {unit.type === 'al' && (
                    <>
                      {/* Ladder extended */}
                      <rect x={unit.x + 44} y={unit.y + 7} width="18" height="6" fill="#e57373" stroke="#fff" strokeWidth="0.5" rx="1" />
                      <line x1={unit.x + 46} y1={unit.y + 8} x2={unit.x + 46} y2={unit.y + 12} stroke="#fff" strokeWidth="0.3" />
                      <line x1={unit.x + 50} y1={unit.y + 8} x2={unit.x + 50} y2={unit.y + 12} stroke="#fff" strokeWidth="0.3" />
                      <line x1={unit.x + 54} y1={unit.y + 8} x2={unit.x + 54} y2={unit.y + 12} stroke="#fff" strokeWidth="0.3" />
                      <line x1={unit.x + 58} y1={unit.y + 8} x2={unit.x + 58} y2={unit.y + 12} stroke="#fff" strokeWidth="0.3" />
                    </>
                  )}

                  {/* Cab (top view) */}
                  <rect x={unit.x + 2} y={unit.y + 3} width="10" height="14" fill="rgba(0,0,0,0.3)" rx="2" />

                  {/* Unit label */}
                  <text
                    x={unit.x + (unit.type === 'al' ? 27 : 22)}
                    y={unit.y - 5}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="7"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {unit.name}
                  </text>
                  <text
                    x={unit.x + (unit.type === 'al' ? 27 : 22)}
                    y={unit.y + 32}
                    textAnchor="middle"
                    fill="#aaa"
                    fontSize="6"
                    fontFamily="sans-serif"
                  >
                    {unit.role}
                  </text>
                </g>
              ))}

              {/* === COMPASS === */}
              <g transform="translate(955, 40)">
                <circle cx="0" cy="0" r="20" fill="rgba(0,0,0,0.6)" stroke="#555" strokeWidth="1" />
                <polygon points="0,-14 -3,0 0,-4 3,0" fill="#ff4444" />
                <polygon points="0,14 -3,0 0,4 3,0" fill="#ccc" />
                <text x="0" y="-15" textAnchor="middle" fill="#ff6666" fontSize="6" fontWeight="bold">С</text>
                <text x="0" y="20" textAnchor="middle" fill="#999" fontSize="5">Ю</text>
                <text x="-15" y="3" textAnchor="middle" fill="#999" fontSize="5">З</text>
                <text x="15" y="3" textAnchor="middle" fill="#999" fontSize="5">В</text>
              </g>

              {/* === SCALE === */}
              <g transform="translate(50, 565)">
                <line x1="0" y1="0" x2="100" y2="0" stroke="#888" strokeWidth="2" />
                <line x1="0" y1="-4" x2="0" y2="4" stroke="#888" strokeWidth="2" />
                <line x1="50" y1="-3" x2="50" y2="3" stroke="#888" strokeWidth="1" />
                <line x1="100" y1="-4" x2="100" y2="4" stroke="#888" strokeWidth="2" />
                <text x="50" y="13" textAnchor="middle" fill="#888" fontSize="7" fontFamily="sans-serif">≈ 50 м</text>
              </g>

              {/* === LEGEND === */}
              <g transform="translate(740, 430)">
                <rect x="0" y="0" width="195" height="145" fill="rgba(0,0,0,0.75)" rx="5" stroke="#444" strokeWidth="1" />
                <text x="97" y="14" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">Условные обозначения</text>
                <line x1="8" y1="19" x2="187" y2="19" stroke="#444" strokeWidth="0.5" />

                <rect x="10" y="25" width="16" height="10" fill="#b71c1c" rx="2" stroke="#fff" strokeWidth="0.5" />
                <text x="32" y="33" fill="#ccc" fontSize="7" fontFamily="sans-serif">АЦ — Автоцистерна</text>

                <rect x="10" y="40" width="16" height="10" fill="#d32f2f" rx="2" stroke="#fff" strokeWidth="0.5" />
                <text x="32" y="48" fill="#ccc" fontSize="7" fontFamily="sans-serif">АЛ — Автолестница</text>

                <rect x="10" y="55" width="16" height="10" fill="#e65100" rx="2" stroke="#fff" strokeWidth="0.5" />
                <text x="32" y="63" fill="#ccc" fontSize="7" fontFamily="sans-serif">АП — Автопена</text>

                <rect x="10" y="70" width="16" height="10" fill="#4a148c" rx="2" stroke="#fff" strokeWidth="0.5" />
                <text x="32" y="78" fill="#ccc" fontSize="7" fontFamily="sans-serif">АСР — Связь/резерв</text>

                <circle cx="18" cy="92" r="6" fill="#ff4500" opacity="0.8" />
                <text x="32" y="95" fill="#ccc" fontSize="7" fontFamily="sans-serif">Очаг пожара</text>

                <line x1="10" y1="108" x2="26" y2="108" stroke="#4fc3f7" strokeWidth="1.5" strokeDasharray="4,3" />
                <text x="32" y="111" fill="#ccc" fontSize="7" fontFamily="sans-serif">Рукавная линия</text>

                <circle cx="18" cy="124" r="8" fill="none" stroke="#ff4400" strokeWidth="1" strokeDasharray="4,2" />
                <text x="32" y="127" fill="#ccc" fontSize="7" fontFamily="sans-serif">Зона безопасности</text>

                <rect x="10" y="133" width="16" height="8" fill="#3a3a5a" stroke="#777" rx="2" />
                <text x="32" y="140" fill="#ccc" fontSize="7" fontFamily="sans-serif">Препятствие</text>
              </g>
            </svg>

            {/* Mode indicator */}
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-2 py-1 border border-gray-600/50">
              <span className="text-[10px] text-gray-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                {toolMode === 'none' ? 'Просмотр' :
                 toolMode === 'fire' ? 'Установка очага' :
                 toolMode === 'obstacle' ? 'Препятствия' :
                 'Перемещение'}
              </span>
            </div>
          </div>
        </main>
      </div>

      {/* === RESOURCES MODAL === */}
      {showResources && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowResources(false)}>
          <div className="bg-gray-800 rounded-xl p-5 w-[420px] border border-gray-600 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              📋 Задать количество сил и средств
            </h2>
            <p className="text-[11px] text-gray-400 mb-4">
              Укажите имеющиеся в наличии силы. Расстановка будет оптимизирована под заданные ресурсы.
            </p>

            {idealResources && (
              <div className="mb-3 p-2 bg-yellow-900/20 rounded border border-yellow-500/30">
                <p className="text-[10px] text-yellow-300">
                  💡 Рекомендуемое количество для данного пожара: АЦ×{idealResources.ac}, АЛ×{idealResources.al}, АП×{idealResources.ap}, АСР×{idealResources.asr}, л/состав: {idealResources.personnel} чел.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">🚒 Автоцистерны (АЦ)</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={resources.ac}
                    onChange={e => setResources(prev => ({ ...prev, ac: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">🪜 Автолестницы (АЛ)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={resources.al}
                    onChange={e => setResources(prev => ({ ...prev, al: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">🧯 Автопены (АП)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={resources.ap}
                    onChange={e => setResources(prev => ({ ...prev, ap: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 block mb-1">📡 Машины связи (АСР)</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={resources.asr}
                    onChange={e => setResources(prev => ({ ...prev, asr: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-gray-300 block mb-1">👨‍🚒 Личный состав (чел.)</label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={resources.personnel}
                  onChange={e => setResources(prev => ({ ...prev, personnel: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 bg-gray-700 rounded text-sm text-white border border-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleApplyResources}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors"
              >
                ✅ Применить и пересчитать
              </button>
              <button
                onClick={() => setShowResources(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === HELP MODAL === */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-gray-800 rounded-xl p-5 max-w-lg border border-gray-600 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-3">📖 Справка</h2>
            <div className="space-y-2 text-[12px] text-gray-300">
              <p><strong className="text-orange-400">1.</strong> Выберите «Очаг пожара», настройте параметры и кликните на вагон.</p>
              <p><strong className="text-yellow-400">2.</strong> Разместите препятствия в зоне работы (здания, заборы, техника).</p>
              <p><strong className="text-indigo-400">3.</strong> Нажмите «Задать количество сил» для ограничения ресурсов.</p>
              <p><strong className="text-green-400">4.</strong> Нажмите «Расставить силы» — программа рассчитает оптимальное размещение с учётом безопасного расстояния и препятствий.</p>
              <div className="mt-3 pt-2 border-t border-gray-700 text-[11px] text-gray-400 space-y-1">
                <p>🛡 <strong>Безопасное расстояние</strong> зависит от интенсивности и типа пожара (от 20 до 55 м).</p>
                <p>📋 При нехватке сил программа выдаст предупреждения и расставит имеющуюся технику оптимально.</p>
                <p>🔄 Препятствия можно перемещать в режиме «Перемещение».</p>
              </div>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-4 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
