import { Link } from 'react-router-dom';
import ServerStatus from './components/ServerStatus';
import { APP_VERSION } from './version';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-xl">
              🚂
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Нейромодуль прогнозирования</h1>
              <p className="text-xs text-slate-400">Оперативные параметры тушения пассажирского ЖД состава</p>
            </div>
          </div>
          <ServerStatus />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Добро пожаловать</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Система прогнозирования временных параметров тушения пожаров на пассажирских железнодорожных составах с использованием нейросетевых моделей
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Link
            to="/prediction"
            className="group p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800/80 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                📊
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-2">Прогнозирование</h3>
                <p className="text-sm text-slate-400 mb-3">
                  Полнофункциональная страница прогнозирования с визуализацией состава, параметров тушения и результатов модели
                </p>
                <span className="text-blue-400 text-sm font-medium group-hover:text-blue-300">
                  Перейти →
                </span>
              </div>
            </div>
          </Link>

          <Link
            to="/prediction-test"
            className="group p-6 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                🧪
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-2">Тест прогноза</h3>
                <p className="text-sm text-slate-400 mb-3">
                  Упрощённая тестовая страница для проверки работы API и модели прогнозирования
                </p>
                <span className="text-emerald-400 text-sm font-medium group-hover:text-emerald-300">
                  Перейти →
                </span>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-12 p-6 rounded-xl bg-slate-800/30 border border-slate-700/30 max-w-4xl mx-auto">
          <h3 className="text-lg font-semibold text-white mb-3">О системе</h3>
          <div className="text-sm text-slate-400 space-y-2">
            <p>
              Система использует нейросетевые модели для прогнозирования ключевых временных параметров тушения пожаров на пассажирских железнодорожных составах:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Время локализации пожара</li>
              <li>Время ликвидации открытого горения</li>
              <li>Время ликвидации последствий пожара</li>
              <li>Оптимальное количество сил и средств</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-700/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between text-sm text-slate-500">
          <span>Версия {APP_VERSION}</span>
          <span>Нейромодуль прогнозирования • 2026</span>
        </div>
      </footer>
    </div>
  );
}
