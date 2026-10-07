const BASE_URL = 'http://127.0.0.1:8000';

async function request(endpoint: string, body: unknown, retries = 5, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const rawText = await response.text();
        let detail = rawText;
        try {
          const errJson = JSON.parse(rawText);
          detail = errJson.detail || JSON.stringify(errJson);
        } catch {
          // не JSON — оставляем как текст
        }
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      return await response.json();
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HTTP ')) {
        throw err;
      }
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/docs`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

export function predictStage(inputData: Record<string, number>, stage: number) {
  return request('/predict', { input_data: inputData, stage });
}

export function getMedianValues(filterParams: unknown) {
  return request('/median_values', filterParams);
}

export async function sendFinalData(data: Record<string, number>) {
  return request('/data', data, 1, 0);
}

export async function getDataStatus() {
  try {
    const response = await fetch(`${BASE_URL}/data/status`, { method: 'GET' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// --- Итерация 8: дообучение ---

export interface RetrainStatus {
  running: boolean;
  progress: number;
  stage: number;
  total_stages: number;
  epoch: number;
  total_epochs: number;
  message: string;
  error: string | null;
  last_result: {
    val_loss: number;
    mae: number | null;
    accuracy: number;
    f1: number;
  } | null;
}

export interface ModelInfo {
  source: 'bundled' | 'user';
  retrain_count: number;
  last_retrain_at: string | null;
  threshold: number;
  total_rows: number;
  new_rows: number;
}

export async function startRetrain(): Promise<{ status: string; total_rows: number; new_rows: number }> {
  const response = await fetch(`${BASE_URL}/retrain`, { method: 'POST' });
  if (!response.ok) {
    const rawText = await response.text();
    let detail = rawText;
    try {
      const errJson = JSON.parse(rawText);
      detail = errJson.detail || JSON.stringify(errJson);
    } catch {}
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return await response.json();
}

export async function getRetrainStatus(): Promise<RetrainStatus | null> {
  try {
    const response = await fetch(`${BASE_URL}/retrain/status`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function setRetrainThreshold(threshold: number): Promise<{ status: string; threshold: number }> {
  const response = await fetch(`${BASE_URL}/retrain/set-threshold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threshold }),
  });
  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(`HTTP ${response.status}: ${rawText}`);
  }
  return await response.json();
}

export async function resetModel(): Promise<{ status: string; removed: string[]; message: string }> {
  const response = await fetch(`${BASE_URL}/retrain/reset`, { method: 'POST' });
  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(`HTTP ${response.status}: ${rawText}`);
  }
  return await response.json();
}

export async function getModelInfo(): Promise<ModelInfo | null> {
  try {
    const response = await fetch(`${BASE_URL}/model/info`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
