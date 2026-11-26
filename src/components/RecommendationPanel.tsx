import { usePredictionSummary } from '../hooks/usePredictionSummary';

interface RecommendationPanelProps {
  onApply?: (resources: { ac: number; al: number; asr: number; personnel: number; stvols: number }) => void;
  resources?: { ac: number; al: number; asr: number; personnel: number };
}

export default function RecommendationPanel({ onApply, resources }: RecommendationPanelProps) {
  const summary = usePredictionSummary();

  if (!summary.hasData) {
    return null;
  }

  return (
    <div className="px-3 pt-2 pb-1.5 border-b border-gray-700/60 bg-gray-800/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-300">
        <span>🕒 {summary.seasonName}</span>
        <span>старт <span className="font-mono">{summary.workTime}</span></span>
        <span>закат <span className="font-mono">{summary.sunsetTime}</span></span>
        <span>рассвет <span className="font-mono">{summary.sunriseTime}</span></span>
        {summary.needsAso && <span className="text-amber-300">💡 Нужен АСО</span>}
      </div>
    </div>
  );
}