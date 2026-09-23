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
  type: 'aca' | 'ac' | 'al' | 'ap' | 'asr';
  name: string;
  x: number;
  y: number;
  angle: number;
  personnel: number;
  hoses: number;
  role: string;
}

export interface Deployment {
  units: FireUnit[];
  totalPersonnel: number;
  totalHoses: number;
  strategy: string;
}

export type ToolMode = 'none' | 'fire' | 'obstacle' | 'select';
export type ObstacleType = 'building' | 'fence' | 'equipment' | 'depot' | 'tree_group' | 'road';
