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
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      return await response.json();
    } catch (err) {
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

export function predictStage(inputData: unknown, stage: number | string) {
  return request('/predict', { input_data: inputData, stage });
}

export function getMedianValues(filterParams: unknown) {
  return request('/median_values', filterParams);
}

export function sendFinalData(data: unknown) {
  return request('/data', data);
}
