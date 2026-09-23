export interface Wagon {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'passenger' | 'freight' | 'tank' | 'platform';
  label: string;
}

export interface FireSource {
  wagonId: number;
  x: number;
  y: number;
  intensity: 'low' | 'medium' | 'high';
  type: 'wagon_body' | 'tank' | 'undercarriage' | 'cargo';
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'building' | 'fence' | 'equipment' | 'depot' | 'tree_group' | 'road';
  label: string;
}

export interface FireUnit {
  id: string;
  type: 'aca' | 'ac' | 'al' | 'asr';
  name: string;
  x: number;
  y: number;
  angle: number;
  personnel: number;
  hoses: number;
  role: string;
  safeDistance: number;
}

export interface Deployment {
  units: FireUnit[];
  totalPersonnel: number;
  totalHoses: number;
  strategy: string;
  warnings: string[];
  safeRadius: number;
}

export interface AvailableResources {
  ac: number;      // Автоцистерны (включая АЦ-40/АЦ-30)
  al: number;      // Автолестницы
  asr: number;     // Машины связи
  personnel: number; // Личный состав (чел.)
}

export type ToolMode = 'none' | 'fire' | 'obstacle' | 'select';
export type ObstacleType = 'building' | 'fence' | 'equipment' | 'depot' | 'tree_group' | 'road';
