import { useEffect, useState } from 'react';
import {
  startRetrain,
  getRetrainStatus,
  getModelInfo,
  setRetrainThreshold,
  resetModel,
  RetrainStatus,
  ModelInfo,
} from '../api/backend';

export default function RetrainPanel() {
  const [status, setStatus] = useState<RetrainStatus | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState<string>('');

  const loadInfo = async () => {
    const [st, info] = await Promise.all([getRetrainStatus(), getModelInfo()]);
    setStatus(st);
    setModelInfo(info);
    if (info) setThresholdInput(String(info.threshold));
  };

  useEffect(() => {
    loadInfo();
    const interval = setInterval(async () => {
      const st = await getRetrainStatus();
      setStatus(st);
      if (st && !st.running) {
        const info = await getModelInfo();
        setModelInfo(info);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStartRetrain = async () => {
    if (status?.running) return;
    if (!confirm('Запустить дообучение модели? Это может занять несколько минут.')) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await startRetrain();
      setMessage(`Дообучение запущено. Обучение на ${res.total_rows} строках.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetThreshold = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const t = parseInt(thresholdInput, 10);
      if (isNaN(t)) throw new Error('Введите число');
      const res = await setRetrainThreshold(t);
      setMessage(`Порог обновлён: ${res.threshold}`);
      await loadInfo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Сбросить дообученную модель к базовой? Все улучшения от дообучения будут потеряны.')) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await resetModel();
      setMessage(res.message);
      await loadInfo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isRunning = status?.running ?? false;
  const progress = status?.progress ?? 0;
  const newRows = modelInfo?.new_rows ?? 0;
  const threshold = modelInfo?.threshold ?? 25;
  const canManualStart = !isRunning && newRows >= 1;

  return (
    <div className="p-3 space-y-3 border-t border-gray-700/50">
      <div>
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
          🧠 Дообучение модели
        </h3>
        {modelInfo && (
          <div className="text-[10px] bg-gray-900/50 rounded px-2 py-1 mb-2 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-400">Модель:</span>
              <span className={modelInfo.source === 'user' ? 'text-emerald-400' : 'text-gray-300'}>
                {modelInfo.source === 'user' ? `дообучена ×${modelInfo.retrain_count}` : 'базовая'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Новых строк:</span>
              <span className={`font-mono ${newRows >= threshold ? 'text-yellow-300' : 'text-gray-300'}`}>
                {newRows} / {threshold}
              </span>
            </div>
            {modelInfo.last_retrain_at && (
              <div className="flex justify-between text-[9px]">
                <span className="text-gray-500">Последнее:</span>
                <span className="text-gray-400 font-mono">
                  {new Date(modelInfo.last_retrain_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {isRunning && (
        <div className="bg-blue-900/30 border border-blue-500/40 rounded-lg p-2.5">
          <div className="text-[10px] text-blue-300 font-semibold mb-1">⏳ Обучение...</div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[10px] text-blue-200 mt-1 text-center font-mono">
            {progress}% — {status?.message}
          </div>
        </div>
      )}

      {status?.last_result && !isRunning && (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-2 text-[10px]">
          <div className="text-emerald-400 font-semibold mb-1">📊 Последнее обучение</div>
          <div className="space-y-0.5 text-gray-300">
            <div className="flex justify-between">
              <span>MAE:</span>
              <span className="font-mono">{status.last_result.mae?.toFixed(2) ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Accuracy:</span>
              <span className="font-mono">{(status.last_result.accuracy * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span>F1:</span>
              <span className="font-mono">{status.last_result.f1.toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-500/50 rounded p-2 text-[10px] text-red-200 break-all">
          {error}
        </div>
      )}

      {message && (
        <div className="bg-emerald-900/40 border border-emerald-500/50 rounded p-2 text-[10px] text-emerald-200">
          {message}
        </div>
      )}

      <button
        onClick={handleStartRetrain}
        disabled={!canManualStart || loading}
        className="w-full py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:opacity-50 rounded text-xs font-semibold"
      >
        {isRunning ? '⏳ Обучение идёт...' : `🚀 Дообучить модель (${newRows} новых)`}
      </button>

      <div className="space-y-2 pt-2 border-t border-gray-700/50">
        <label className="text-[10px] text-gray-400 block">
          Порог авто-дообучения (новых строк):
        </label>
        <div className="flex gap-1">
          <input
            type="number"
            min="5"
            max="1000"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            disabled={loading || isRunning}
            className="flex-1 px-2 py-1 bg-gray-700 rounded text-[11px] border border-gray-600 font-mono"
          />
          <button
            onClick={handleSetThreshold}
            disabled={loading || isRunning}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-[10px] font-semibold"
          >
            OK
          </button>
        </div>
      </div>

      {modelInfo?.source === 'user' && (
        <button
          onClick={handleReset}
          disabled={loading || isRunning}
          className="w-full py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 rounded text-[10px] font-semibold"
        >
          🔄 Сбросить к базовой модели
        </button>
      )}
    </div>
  );
}
