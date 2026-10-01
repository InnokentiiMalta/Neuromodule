import { useState } from 'react';
import { predictStage, getMedianValues } from '../api/backend';

const INITIAL_FIELDS = [
  { key: 'Время_следования_мин', label: 'Время следования (мин)', default: 8 },
  { key: 'Время_подачи_первого_ствола_мин', label: 'Время подачи первого ствола (мин)', default: 1 },
  { key: 'Количество_основных_пожарных_автомобилей_ед', label: 'Основных ПА', default: 2 },
  { key: 'Количество_специальных_пожарных_автомобилей_ед', label: 'Специальных ПА', default: 0 },
  { key: 'Количество_пожарных_поездов_ед', label: 'Пожарных поездов', default: 0 },
  { key: 'Всего_подано_пожарных_стволов_ед', label: 'Всего стволов', default: 1 },
];

export default function PredictionTest() {
  const [values, setValues] = useState(
    Object.fromEntries(INITIAL_FIELDS.map(f => [f.key, f.default]))
  );
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (key, value) => {
    setValues(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const handlePredict = async (stage) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await predictStage(values, stage);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMedian = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMedianValues({});
      setResult({ медианы: data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2>Тест прогноза (Python-сервер)</h2>

      {INITIAL_FIELDS.map(f => (
        <div key={f.key} style={{ marginBottom: 8 }}>
          <label style={{ display: 'inline-block', width: 300 }}>{f.label}</label>
          <input
            type="number"
            value={values[f.key]}
            onChange={(e) => handleChange(f.key, e.target.value)}
            style={{ width: 100 }}
          />
        </div>
      ))}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => handlePredict(0)} disabled={loading}>Этап 1</button>
        <button onClick={() => handlePredict(1)} disabled={loading}>Этап 2</button>
        <button onClick={() => handlePredict(2)} disabled={loading}>Этап 3</button>
        <button onClick={() => handlePredict(3)} disabled={loading}>Финальный</button>
        <button onClick={handleMedian} disabled={loading}>Медианы</button>
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: 'red' }}>Ошибка: {error}</p>}
      {result && (
        <pre style={{ background: '#f5f5f5', padding: 12, marginTop: 16 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
