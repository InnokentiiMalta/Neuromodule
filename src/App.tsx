import { useState, useCallback, useRef, useMemo } from 'react';
import { Wagon, FireSource, Obstacle, Deployment, ToolMode, ObstacleType } from './types';
import { calculateDeployment, generateDefaultWagons } from './utils/deployment';

const OBSTACLE_DEFAULTS: Record<ObstacleType, { width: number; height: number; label: string; icon: string }> = {
  building: { width: 80, height: 60, label: 'Здание', icon: '🏢' },
  fence: { width: 100, height: 15, label: 'Забор', icon: '🚧' },
  equipment: { width: 40, height: 30, label: 'Техника', icon: '🚜' },
  depot: { width: 90, height: 50, label: 'Депо', icon: '🏭' },
  tree_group: { width: 50, height: 50, label: 'Деревья', icon: '🌲' },
  road: { width: 120, height: 25, label: 'Дорога', icon: '🛤' },
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
  const svgRef = useRef<SVGSVGElement>(null);

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
        w => x >= w.x && x <= w.x + w.width && y >= w.y - 5 && y <= w.y + w.height + 10
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
    const result = calculateDeployment(wagons, fireSource, obstacles);
    setDeployment(result);
  }, [wagons, fireSource, obstacles]);

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
      setDeployment(calculateDeployment(wagons, fireSource, newObs));
    }
  }, [wagons, fireSource, obstacles, deployment]);

  const fireWagonLabel = useMemo(() => {
    if (!fireSource) return '';
    const w = wagons.find(w => w.id === fireSource.wagonId);
    return w ? w.label : '';
  }, [fireSource, wagons]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 px-4 py-2.5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-800 rounded-lg flex items-center justify-center shadow-md">
              <span className="text-xl">🚒</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Расстановка сил и средств ПО</h1>
              <p className="text-[10px] text-gray-400">Тушение пожаров железнодорожных составов | ИРЛ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              title="Справка"
            >
              ❓
            </button>
            <button
              onClick={handleDeploy}
              disabled={!fireSource}
              className="px-4 py-1.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-sm transition-all shadow-md disabled:shadow-none"
            >
              🚀 Расставить силы
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-sm transition-colors"
            >
              🔄 Сброс
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Controls */}
        <aside className="w-[280px] bg-gray-800/95 border-r border-gray-700 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-3 overflow-y-auto flex-1 space-y-4">
            {/* Tool Selection */}
            <div>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Инструменты
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setToolMode(toolMode === 'fire' ? 'none' : 'fire')}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    toolMode === 'fire'
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🔥 Очаг пожара
                </button>
                <button
                  onClick={() => setToolMode(toolMode === 'obstacle' ? 'none' : 'obstacle')}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    toolMode === 'obstacle'
                      ? 'bg-yellow-600 text-white shadow-md shadow-yellow-600/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  🧱 Препятствия
                </button>
                <button
                  onClick={() => setToolMode(toolMode === 'select' ? 'none' : 'select')}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    toolMode === 'select'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  ✋ Перемещение
                </button>
                <button
                  onClick={() => setToolMode('none')}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    toolMode === 'none'
                      ? 'bg-green-600 text-white shadow-md shadow-green-600/30'
                      : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  👁 Просмотр
                </button>
              </div>
            </div>

            {/* Fire Settings */}
            {toolMode === 'fire' && (
              <div className="p-3 bg-gradient-to-b from-orange-900/20 to-transparent rounded-lg border border-orange-500/30">
                <h3 className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
                  🔥 Параметры пожара
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Интенсивность горения</label>
                    <div className="flex gap-1">
                      {([['low', 'Слабая', 'bg-yellow-700'], ['medium', 'Средняя', 'bg-orange-700'], ['high', 'Сильная', 'bg-red-700']] as const).map(([val, label, cls]) => (
                        <button
                          key={val}
                          onClick={() => setFireIntensity(val)}
                          className={`flex-1 px-1 py-1.5 rounded text-[10px] font-medium transition-all ${
                            fireIntensity === val
                              ? `${cls} text-white ring-1 ring-white/30`
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Характер пожара</label>
                    <select
                      value={fireType}
                      onChange={e => setFireType(e.target.value as FireSource['type'])}
                      className="w-full px-2 py-1.5 bg-gray-700 rounded text-[11px] text-white border border-gray-600 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="wagon_body">Корпус вагона</option>
                      <option value="tank">Цистерна (ГЖ/ЛЖ)</option>
                      <option value="undercarriage">Ходовая часть</option>
                      <option value="cargo">Груз на платформе</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-orange-300/70 italic flex items-center gap-1">
                    <span>👆</span> Кликните на вагон для установки очага
                  </p>
                </div>
              </div>
            )}

            {/* Obstacle Settings */}
            {toolMode === 'obstacle' && (
              <div className="p-3 bg-gradient-to-b from-yellow-900/20 to-transparent rounded-lg border border-yellow-500/30">
                <h3 className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1">
                  🧱 Тип препятствия
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(OBSTACLE_DEFAULTS) as ObstacleType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setObstacleType(type)}
                      className={`px-2 py-1.5 rounded text-[10px] font-medium transition-all flex items-center gap-1 ${
                        obstacleType === type
                          ? 'bg-yellow-600 text-white ring-1 ring-white/30'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <span>{OBSTACLE_DEFAULTS[type].icon}</span>
                      <span>{OBSTACLE_DEFAULTS[type].label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-yellow-300/70 italic mt-2 flex items-center gap-1">
                  <span>👆</span> Кликните на карту для размещения
                </p>
              </div>
            )}

            {/* Current fire info */}
            {fireSource && (
              <div className="p-2.5 bg-red-900/20 rounded-lg border border-red-500/30">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[11px] font-semibold text-red-400">🔥 Очаг установлен</h3>
                  <button onClick={handleClearFire} className="text-[10px] text-red-400 hover:text-red-300">
                    Убрать ✕
                  </button>
                </div>
                <p className="text-[10px] text-gray-300">
                  Вагон: <span className="text-white font-medium">{fireWagonLabel}</span>
                </p>
                <p className="text-[10px] text-gray-300">
                  Интенсивность: <span className="text-white font-medium">
                    {fireSource.intensity === 'low' ? 'Слабая' : fireSource.intensity === 'medium' ? 'Средняя' : 'Сильная'}
                  </span>
                </p>
                <p className="text-[10px] text-gray-300">
                  Тип: <span className="text-white font-medium">
                    {fireSource.type === 'wagon_body' ? 'Корпус' : fireSource.type === 'tank' ? 'Цистерна' : fireSource.type === 'undercarriage' ? 'Ходовая' : 'Груз'}
                  </span>
                </p>
              </div>
            )}

            {/* Obstacles List */}
            {obstacles.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Препятствия ({obstacles.length})
                </h3>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {obstacles.map(obs => (
                    <div key={obs.id} className="flex items-center justify-between bg-gray-700/60 rounded px-2 py-1">
                      <span className="text-[10px] text-gray-300 flex items-center gap-1">
                        <span>{OBSTACLE_DEFAULTS[obs.type]?.icon}</span>
                        {obs.label}
                      </span>
                      <button
                        onClick={() => handleDeleteObstacle(obs.id)}
                        className="text-red-400 hover:text-red-300 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deployment Info */}
            {deployment && (
              <div className="p-3 bg-gradient-to-b from-green-900/20 to-transparent rounded-lg border border-green-500/30">
                <h3 className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                  ✅ Результат расстановки
                </h3>

                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  <div className="bg-gray-700/80 rounded p-1.5 text-center">
                    <div className="text-sm font-bold text-white">{deployment.units.length}</div>
                    <div className="text-[9px] text-gray-400">Техника</div>
                  </div>
                  <div className="bg-gray-700/80 rounded p-1.5 text-center">
                    <div className="text-sm font-bold text-white">{deployment.totalPersonnel}</div>
                    <div className="text-[9px] text-gray-400">Л/состав</div>
                  </div>
                  <div className="bg-gray-700/80 rounded p-1.5 text-center">
                    <div className="text-sm font-bold text-white">{deployment.totalHoses}</div>
                    <div className="text-[9px] text-gray-400">Стволов</div>
                  </div>
                </div>

                <div className="mb-2">
                  <h4 className="text-[10px] font-semibold text-gray-300 mb-0.5">Стратегия тушения:</h4>
                  <p className="text-[10px] text-gray-400 leading-relaxed">{deployment.strategy}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-semibold text-gray-300 mb-1">Подразделения:</h4>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {deployment.units.map(unit => (
                      <div key={unit.id} className="bg-gray-700/60 rounded p-1.5 border-l-2 border-red-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-white">{unit.name}</span>
                          <span className="text-[9px] text-gray-400">{unit.personnel} чел.</span>
                        </div>
                        <div className="text-[9px] text-gray-400">{unit.role}</div>
                        {unit.hoses > 0 && (
                          <div className="text-[9px] text-blue-400">💧 Стволов: {unit.hoses}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Canvas */}
        <main className="flex-1 p-3 flex flex-col overflow-hidden">
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden relative shadow-inner">
            <svg
              ref={svgRef}
              viewBox="0 0 1000 600"
              className="w-full h-full"
              onClick={handleSVGClick}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: toolMode === 'fire' ? 'crosshair' : toolMode === 'obstacle' ? 'cell' : toolMode === 'select' ? 'default' : 'default' }}
            >
              {/* Background */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                </pattern>
                <linearGradient id="fireGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff4500" />
                  <stop offset="50%" stopColor="#ff6600" />
                  <stop offset="100%" stopColor="#ffcc00" />
                </linearGradient>
                <linearGradient id="smokeGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#333" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#666" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="fireRadial">
                  <stop offset="0%" stopColor="#ffcc00" stopOpacity="0.9" />
                  <stop offset="40%" stopColor="#ff6600" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#ff0000" stopOpacity="0" />
                </radialGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="shadow">
                  <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.3" />
                </filter>
              </defs>

              {/* Background */}
              <rect width="1000" height="600" fill="#1a1f2e" />
              <rect width="1000" height="600" fill="url(#grid)" />

              {/* Ground area */}
              <rect x="0" y="340" width="1000" height="260" fill="#1a2a1a" opacity="0.3" />
              <rect x="0" y="0" width="1000" height="270" fill="#1a1a2a" opacity="0.2" />

              {/* Railway tracks */}
              <g>
                {/* Ballast/gravel */}
                <rect x="55" y="285" width="890" height="50" fill="#2a2a2a" rx="4" />
                <rect x="55" y="288" width="890" height="44" fill="#333" rx="3" />

                {/* Sleepers */}
                {Array.from({ length: 45 }, (_, i) => (
                  <rect key={i} x={65 + i * 20} y="286" width="6" height="48" fill="#4a3a2a" rx="1" opacity="0.8" />
                ))}

                {/* Rails */}
                <line x1="60" y1="295" x2="940" y2="295" stroke="#999" strokeWidth="3" />
                <line x1="60" y1="296" x2="940" y2="296" stroke="#666" strokeWidth="1" />
                <line x1="60" y1="325" x2="940" y2="325" stroke="#999" strokeWidth="3" />
                <line x1="60" y1="326" x2="940" y2="326" stroke="#666" strokeWidth="1" />
              </g>

              {/* Wagons */}
              {wagons.map(wagon => {
                const isOnFire = fireSource?.wagonId === wagon.id;
                return (
                  <g key={wagon.id} filter={isOnFire ? undefined : "url(#shadow)"}>
                    {/* Wagon body */}
                    <rect
                      x={wagon.x}
                      y={wagon.y}
                      width={wagon.width}
                      height={wagon.height}
                      fill={
                        wagon.type === 'tank' ? '#3a5a35' :
                        wagon.type === 'passenger' ? '#3a4a5a' :
                        wagon.type === 'platform' ? '#4a4a4a' : '#4a3a2a'
                      }
                      stroke={isOnFire ? '#ff4500' : '#555'}
                      strokeWidth={isOnFire ? 2.5 : 1}
                      rx="3"
                    />

                    {/* Wagon type-specific details */}
                    {wagon.type === 'tank' && (
                      <>
                        <ellipse
                          cx={wagon.x + wagon.width / 2}
                          cy={wagon.y + wagon.height / 2}
                          rx={wagon.width / 2 - 8}
                          ry={wagon.height / 2 - 6}
                          fill="none"
                          stroke="#5a7a55"
                          strokeWidth="2"
                        />
                        <circle cx={wagon.x + wagon.width - 12} cy={wagon.y + 10} r="3" fill="#6a8a65" />
                      </>
                    )}
                    {wagon.type === 'passenger' && (
                      <>
                        {Array.from({ length: 5 }, (_, i) => (
                          <rect
                            key={i}
                            x={wagon.x + 8 + i * 19}
                            y={wagon.y + 6}
                            width="13"
                            height="12"
                            fill="#5a8aaa"
                            rx="1"
                            opacity="0.6"
                          />
                        ))}
                        <line x1={wagon.x} y1={wagon.y + 22} x2={wagon.x + wagon.width} y2={wagon.y + 22} stroke="#555" strokeWidth="0.5" />
                      </>
                    )}
                    {wagon.type === 'freight' && (
                      <>
                        <line x1={wagon.x + wagon.width / 3} y1={wagon.y} x2={wagon.x + wagon.width / 3} y2={wagon.y + wagon.height} stroke="#5a4a3a" strokeWidth="0.5" />
                        <line x1={wagon.x + 2 * wagon.width / 3} y1={wagon.y} x2={wagon.x + 2 * wagon.width / 3} y2={wagon.y + wagon.height} stroke="#5a4a3a" strokeWidth="0.5" />
                      </>
                    )}
                    {wagon.type === 'platform' && (
                      <>
                        <rect x={wagon.x + 5} y={wagon.y + 5} width={wagon.width - 10} height={wagon.height - 10} fill="none" stroke="#666" strokeWidth="0.5" strokeDasharray="3,2" />
                      </>
                    )}

                    {/* Wheels */}
                    <circle cx={wagon.x + 15} cy={wagon.y + wagon.height + 6} r="7" fill="#222" stroke="#555" strokeWidth="1.5" />
                    <circle cx={wagon.x + 15} cy={wagon.y + wagon.height + 6} r="3" fill="#444" />
                    <circle cx={wagon.x + wagon.width - 15} cy={wagon.y + wagon.height + 6} r="7" fill="#222" stroke="#555" strokeWidth="1.5" />
                    <circle cx={wagon.x + wagon.width - 15} cy={wagon.y + wagon.height + 6} r="3" fill="#444" />

                    {/* Coupling */}
                    {wagon.id < wagons.length && (
                      <rect x={wagon.x + wagon.width} y={wagon.y + wagon.height / 2 - 2} width="4" height="4" fill="#555" rx="1" />
                    )}

                    {/* Label */}
                    <text
                      x={wagon.x + wagon.width / 2}
                      y={wagon.y - 8}
                      textAnchor="middle"
                      fill={isOnFire ? '#ff8800' : '#999'}
                      fontSize="8"
                      fontFamily="sans-serif"
                      fontWeight={isOnFire ? 'bold' : 'normal'}
                    >
                      {wagon.label}
                    </text>
                  </g>
                );
              })}

              {/* Fire source visualization */}
              {fireSource && (
                <g>
                  {/* Smoke */}
                  <ellipse cx={fireSource.x} cy={fireSource.y - 30} rx="25" ry="15" fill="url(#smokeGradient)" opacity="0.5">
                    <animate attributeName="cy" values="-30;-40;-30" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="rx" values="25;30;25" dur="2s" repeatCount="indefinite" />
                  </ellipse>

                  {/* Fire glow */}
                  <circle cx={fireSource.x} cy={fireSource.y} r={fireSource.intensity === 'high' ? 35 : fireSource.intensity === 'medium' ? 25 : 18} fill="url(#fireRadial)" opacity="0.6">
                    <animate attributeName="r" values={fireSource.intensity === 'high' ? "33;38;33" : fireSource.intensity === 'medium' ? "23;28;23" : "16;20;16"} dur="0.8s" repeatCount="indefinite" />
                  </circle>

                  {/* Fire core */}
                  <circle cx={fireSource.x} cy={fireSource.y} r={fireSource.intensity === 'high' ? 12 : fireSource.intensity === 'medium' ? 9 : 6} fill="url(#fireGradient)" filter="url(#glow)">
                    <animate attributeName="r" values={fireSource.intensity === 'high' ? "10;14;10" : fireSource.intensity === 'medium' ? "7;11;7" : "5;8;5"} dur="0.5s" repeatCount="indefinite" />
                  </circle>

                  {/* Fire icon */}
                  <text x={fireSource.x} y={fireSource.y - 35} textAnchor="middle" fill="#ff6600" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                    ⚠ ПОЖАР
                  </text>
                  <text x={fireSource.x} y={fireSource.y - 24} textAnchor="middle" fill="#ffaa00" fontSize="8" fontFamily="sans-serif">
                    {fireSource.type === 'tank' ? '🛢 Цистерна' : fireSource.type === 'wagon_body' ? '🚃 Корпус' : fireSource.type === 'undercarriage' ? '⚙ Ходовая' : '📦 Груз'}
                  </text>
                </g>
              )}

              {/* Obstacles */}
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
                    fillOpacity="0.8"
                    stroke={toolMode === 'select' ? '#4fc3f7' : '#777'}
                    strokeWidth={toolMode === 'select' ? 2 : 1}
                    strokeDasharray={obs.type === 'fence' ? '5,3' : obs.type === 'road' ? '8,4' : 'none'}
                    rx={obs.type === 'tree_group' ? obs.width / 2 : "3"}
                  />
                  {/* Obstacle icon */}
                  <text
                    x={obs.x + obs.width / 2}
                    y={obs.y + obs.height / 2 + 4}
                    textAnchor="middle"
                    fontSize={obs.type === 'tree_group' ? '16' : '12'}
                  >
                    {OBSTACLE_DEFAULTS[obs.type]?.icon}
                  </text>
                  {/* Label */}
                  {toolMode === 'select' && (
                    <text
                      x={obs.x + obs.width / 2}
                      y={obs.y - 3}
                      textAnchor="middle"
                      fill="#4fc3f7"
                      fontSize="7"
                      fontFamily="sans-serif"
                    >
                      {obs.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Deployment units */}
              {deployment?.units.map(unit => (
                <g key={unit.id}>
                  {/* Hose line to fire */}
                  {fireSource && (
                    <path
                      d={`M ${unit.x + 25} ${unit.y + 12} Q ${(unit.x + 25 + fireSource.x) / 2} ${(unit.y + 12 + fireSource.y) / 2 - 15} ${fireSource.x} ${fireSource.y}`}
                      fill="none"
                      stroke="#4fc3f7"
                      strokeWidth="2"
                      strokeDasharray="6,4"
                      opacity="0.7"
                      className="animate-dash"
                    />
                  )}

                  {/* Unit shadow */}
                  <rect
                    x={unit.x + 2}
                    y={unit.y + 2}
                    width={unit.type === 'al' ? 60 : 50}
                    height={22}
                    fill="rgba(0,0,0,0.3)"
                    rx="3"
                  />

                  {/* Unit body */}
                  <rect
                    x={unit.x}
                    y={unit.y}
                    width={unit.type === 'al' ? 60 : 50}
                    height={22}
                    fill={
                      unit.type === 'aca' ? '#b71c1c' :
                      unit.type === 'ac' ? '#c62828' :
                      unit.type === 'al' ? '#d32f2f' :
                      unit.type === 'ap' ? '#e65100' :
                      '#4a148c'
                    }
                    stroke="#fff"
                    strokeWidth="1.5"
                    rx="3"
                  />

                  {/* Unit icon */}
                  <text
                    x={unit.x + 8}
                    y={unit.y + 15}
                    fontSize="10"
                  >
                    {unit.type === 'aca' ? '🚒' : unit.type === 'ac' ? '🚒' : unit.type === 'al' ? '🪜' : unit.type === 'ap' ? '🧯' : '📡'}
                  </text>

                  {/* Unit label */}
                  <text
                    x={unit.x + (unit.type === 'al' ? 30 : 25)}
                    y={unit.y - 6}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="7"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    {unit.name}
                  </text>
                  <text
                    x={unit.x + (unit.type === 'al' ? 30 : 25)}
                    y={unit.y + 36}
                    textAnchor="middle"
                    fill="#aaa"
                    fontSize="6"
                    fontFamily="sans-serif"
                  >
                    {unit.role}
                  </text>
                </g>
              ))}

              {/* Compass */}
              <g transform="translate(950, 45)">
                <circle cx="0" cy="0" r="22" fill="rgba(0,0,0,0.6)" stroke="#555" strokeWidth="1" />
                <polygon points="0,-15 -4,0 0,-5 4,0" fill="#ff4444" />
                <polygon points="0,15 -4,0 0,5 4,0" fill="#ccc" />
                <text x="0" y="-16" textAnchor="middle" fill="#ff6666" fontSize="7" fontWeight="bold">С</text>
                <text x="0" y="22" textAnchor="middle" fill="#999" fontSize="6">Ю</text>
                <text x="-17" y="3" textAnchor="middle" fill="#999" fontSize="6">З</text>
                <text x="17" y="3" textAnchor="middle" fill="#999" fontSize="6">В</text>
              </g>

              {/* Scale bar */}
              <g transform="translate(50, 560)">
                <line x1="0" y1="0" x2="100" y2="0" stroke="#888" strokeWidth="2" />
                <line x1="0" y1="-5" x2="0" y2="5" stroke="#888" strokeWidth="2" />
                <line x1="50" y1="-3" x2="50" y2="3" stroke="#888" strokeWidth="1" />
                <line x1="100" y1="-5" x2="100" y2="5" stroke="#888" strokeWidth="2" />
                <text x="50" y="15" textAnchor="middle" fill="#888" fontSize="8" fontFamily="sans-serif">≈ 50 м</text>
              </g>

              {/* Legend */}
              <g transform="translate(720, 420)">
                <rect x="0" y="0" width="200" height="150" fill="rgba(0,0,0,0.7)" rx="6" stroke="#444" strokeWidth="1" />
                <text x="100" y="16" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="sans-serif">Условные обозначения</text>
                <line x1="10" y1="22" x2="190" y2="22" stroke="#444" strokeWidth="0.5" />

                <rect x="12" y="28" width="14" height="10" fill="#b71c1c" rx="2" />
                <text x="32" y="36" fill="#ccc" fontSize="8" fontFamily="sans-serif">АЦ-40 — Автоцистерна</text>

                <rect x="12" y="44" width="14" height="10" fill="#d32f2f" rx="2" />
                <text x="32" y="52" fill="#ccc" fontSize="8" fontFamily="sans-serif">АЛ-30 — Автолестница</text>

                <rect x="12" y="60" width="14" height="10" fill="#e65100" rx="2" />
                <text x="32" y="68" fill="#ccc" fontSize="8" fontFamily="sans-serif">АП-40 — Автопена</text>

                <rect x="12" y="76" width="14" height="10" fill="#4a148c" rx="2" />
                <text x="32" y="84" fill="#ccc" fontSize="8" fontFamily="sans-serif">АСР — Связь и резерв</text>

                <circle cx="19" cy="98" r="6" fill="#ff4500" opacity="0.8" />
                <text x="32" y="101" fill="#ccc" fontSize="8" fontFamily="sans-serif">Очаг пожара</text>

                <line x1="12" y1="114" x2="26" y2="114" stroke="#4fc3f7" strokeWidth="2" strokeDasharray="4,3" />
                <text x="32" y="117" fill="#ccc" fontSize="8" fontFamily="sans-serif">Рукавная линия</text>

                <rect x="12" y="126" width="14" height="10" fill="#3a3a5a" stroke="#777" rx="2" />
                <text x="32" y="134" fill="#ccc" fontSize="8" fontFamily="sans-serif">Препятствие</text>
              </g>
            </svg>

            {/* Mode indicator overlay */}
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-gray-600/50">
              <span className="text-xs text-gray-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                {toolMode === 'none' ? 'Просмотр' :
                 toolMode === 'fire' ? 'Установка очага пожара' :
                 toolMode === 'obstacle' ? 'Размещение препятствий' :
                 'Перемещение объектов'}
              </span>
            </div>

            {/* Help overlay */}
            {showHelp && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
                <div className="bg-gray-800 rounded-xl p-6 max-w-lg border border-gray-600 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h2 className="text-lg font-bold text-white mb-3">📖 Справка по использованию</h2>
                  <div className="space-y-2 text-sm text-gray-300">
                    <p><strong className="text-orange-400">1.</strong> Выберите инструмент «Очаг пожара» и кликните на вагон для указания места возгорания.</p>
                    <p><strong className="text-yellow-400">2.</strong> Выберите «Препятствия» и разместите объекты (здания, заборы и т.д.) в зоне работы.</p>
                    <p><strong className="text-blue-400">3.</strong> Используйте «Перемещение» для корректировки позиций препятствий.</p>
                    <p><strong className="text-green-400">4.</strong> Нажмите «Расставить силы» для автоматического расчёта позиций подразделений.</p>
                    <p className="text-xs text-gray-400 mt-3 pt-2 border-t border-gray-700">
                      Программа учитывает расположение очага пожара, его интенсивность, тип горящего вагона и наличие препятствий при расстановке сил и средств.
                    </p>
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
        </main>
      </div>
    </div>
  );
}
