import { useState } from 'react'

function App() {
  const [activeTab, setActiveTab] = useState<string>('causes')

  const causes = [
    {
      icon: '🔌',
      title: 'Проблемы с сетью',
      description: 'Сервер Qwen3-Coder временно недоступен, перегружен или заблокирован сетевым экраном/прокси.',
      solutions: [
        'Проверьте стабильность интернет-соединения',
        'Попробуйте другой браузер или режим инкогнито',
        'Отключите VPN/прокси, если используете',
        'Проверьте, не заблокирован ли домен API в вашей сети',
      ],
    },
    {
      icon: '⏱️',
      title: 'Таймаут соединения',
      description: 'Запрос слишком большой или сложный, и сервер не успевает обработать его за отведённое время.',
      solutions: [
        'Разбейте большой запрос на несколько меньших',
        'Упростите код, который отправляете на изменение',
        'Удалите лишние комментарии и пробелы из кода',
        'Попробуйте отправить запрос повторно',
      ],
    },
    {
      icon: '🔑',
      title: 'Проблемы с авторизацией',
      description: 'API-ключ недействителен, истёк срок его действия или превышен лимит запросов.',
      solutions: [
        'Проверьте, что API-ключ корректно введён',
        'Убедитесь, что срок действия ключа не истёк',
        'Проверьте баланс аккаунта / лимиты использования',
        'Перегенерируйте API-ключ в настройках',
      ],
    },
    {
      icon: '🖥️',
      title: 'Перегрузка сервера',
      description: 'Модель Qwen3-Coder испытывает высокую нагрузку, и сервер не может обработать ваш запрос.',
      solutions: [
        'Подождите несколько минут и попробуйте снова',
        'Попробуйте в непиковое время (ночью или рано утром)',
        'Используйте альтернативную модель, если доступна',
        'Проверьте статус-страницу сервиса на предмет технических работ',
      ],
    },
    {
      icon: '📦',
      title: 'Проблемы с форматом запроса',
      description: 'Отправляемый код содержит неподдерживаемые символы или имеет неверный формат.',
      solutions: [
        'Проверьте кодировку файла (должна быть UTF-8)',
        'Удалите специальные/нестандартные символы',
        'Убедитесь, что код не содержит бинарных данных',
        'Проверьте максимальную длину запроса в документации',
      ],
    },
    {
      icon: '🔄',
      title: 'Несовместимость версий',
      description: 'Версия клиента/плагина несовместима с текущей версией API Qwen3-Coder.',
      solutions: [
        'Обновите плагин/расширение до последней версии',
        'Очистите кэш браузера',
        'Перезапустите IDE или редактор кода',
        'Проверьте changelog на предмет breaking changes',
      ],
    },
  ]

  const quickSteps = [
    { step: 1, text: 'Перезагрузите страницу (Ctrl+F5 / Cmd+Shift+R)', icon: '🔄' },
    { step: 2, text: 'Проверьте интернет-соединение', icon: '🌐' },
    { step: 3, text: 'Попробуйте через 2-3 минуты', icon: '⏳' },
    { step: 4, text: 'Очистите кэш и cookies', icon: '🧹' },
    { step: 5, text: 'Попробуйте другой браузер', icon: '🔀' },
    { step: 6, text: 'Обратитесь в поддержку сервиса', icon: '💬' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-xl">
            ⚠️
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Устранение ошибки подключения</h1>
            <p className="text-sm text-slate-400">Qwen3-Coder — «Неизвестная ошибка»</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Error Display */}
        <div className="mb-8 p-6 rounded-xl bg-red-500/10 border border-red-500/30">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <h2 className="text-red-300 font-semibold text-lg mb-1">Текст ошибки:</h2>
              <div className="bg-slate-900/80 rounded-lg p-4 font-mono text-sm">
                <p className="text-red-400">"Oops! There was an issue connecting to Qwen3-Coder.</p>
                <p className="text-red-400">Неизвестная ошибка"</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Steps */}
        <div className="mb-8 p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <h2 className="text-emerald-300 font-semibold text-lg mb-4 flex items-center gap-2">
            <span>⚡</span> Быстрые действия (попробуйте в первую очередь)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickSteps.map((item) => (
              <div
                key={item.step}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-emerald-500/30 transition-colors"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm text-slate-300">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('causes')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'causes'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            🔍 Возможные причины
          </button>
          <button
            onClick={() => setActiveTab('detailed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'detailed'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            📋 Подробная диагностика
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'contacts'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            📞 Куда обращаться
          </button>
        </div>

        {/* Causes Tab */}
        {activeTab === 'causes' && (
          <div className="space-y-4">
            <p className="text-slate-400 mb-4">
              Эта ошибка обычно возникает по одной из следующих причин. Нажмите на карточку, чтобы увидеть решения:
            </p>
            <div className="grid gap-4">
              {causes.map((cause, index) => (
                <CauseCard key={index} {...cause} />
              ))}
            </div>
          </div>
        )}

        {/* Detailed Diagnostics Tab */}
        {activeTab === 'detailed' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <h3 className="font-semibold text-lg mb-4 text-blue-300">🩺 Пошаговая диагностика</h3>
              <div className="space-y-4">
                <DiagnosticStep
                  number={1}
                  title="Проверьте доступность сервиса"
                  description="Откройте консоль разработчика (F12) → вкладка Network → попробуйте отправить запрос. Посмотрите HTTP-код ответа."
                  codes={[
                    { code: '500/502/503', meaning: 'Проблема на стороне сервера — ждите' },
                    { code: '401/403', meaning: 'Проблема с авторизацией' },
                    { code: '429', meaning: 'Превышен лимит запросов' },
                    { code: '0 / нет ответа', meaning: 'Проблема с сетью или DNS' },
                  ]}
                />
                <DiagnosticStep
                  number={2}
                  title="Проверьте консоль на ошибки JavaScript"
                  description="В консоли разработчика (F12) → вкладка Console. Найдите красные сообщения об ошибках."
                  codes={[]}
                />
                <DiagnosticStep
                  number={3}
                  title="Проверьте размер запроса"
                  description="Если вы отправляете большой файл кода, попробуйте уменьшить его. Некоторые API имеют ограничение на размер тела запроса."
                  codes={[]}
                />
                <DiagnosticStep
                  number={4}
                  title="Проверьте CORS-политики"
                  description="Если ошибка связана с CORS, попробуйте отключить расширения браузера или использовать другой браузер."
                  codes={[]}
                />
                <DiagnosticStep
                  number={5}
                  title="Проверьте логи сервера"
                  description="Если у вас есть доступ к серверной части, проверьте логи на наличие ошибок при обработке вашего запроса."
                  codes={[]}
                />
              </div>
            </div>
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <div className="space-y-4">
            <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <h3 className="font-semibold text-lg mb-4 text-purple-300">📞 Если ничего не помогло</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                  <h4 className="font-medium text-white mb-2">1. Проверьте статус-страницу</h4>
                  <p className="text-sm text-slate-400">
                    Большинство сервисов имеют страницу статуса (status.example.com), где отображаются текущие инциденты и технические работы.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                  <h4 className="font-medium text-white mb-2">2. Обратитесь в поддержку</h4>
                  <p className="text-sm text-slate-400">
                    Напишите в поддержку сервиса, указав:
                  </p>
                  <ul className="text-sm text-slate-400 mt-2 space-y-1 list-disc list-inside">
                    <li>Точный текст ошибки</li>
                    <li>Время, когда ошибка возникла</li>
                    <li>Скриншот консоли разработчика (F12)</li>
                    <li>Версию браузера и ОС</li>
                    <li>Описание того, что вы пытались сделать</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/30">
                  <h4 className="font-medium text-white mb-2">3. Поищите на форумах</h4>
                  <p className="text-sm text-slate-400">
                    Возможно, другие пользователи уже столкнулись с этой проблемой. Проверьте:
                  </p>
                  <ul className="text-sm text-slate-400 mt-2 space-y-1 list-disc list-inside">
                    <li>GitHub Issues проекта</li>
                    <li>Stack Overflow</li>
                    <li>Официальный Discord/Telegram-чат</li>
                    <li>Reddit или специализированные форумы</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="mt-8 p-6 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <h3 className="text-amber-300 font-semibold text-lg mb-3 flex items-center gap-2">
            <span>💡</span> Резюме
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">
            Ошибка <code className="bg-slate-800 px-2 py-0.5 rounded text-amber-300">"There was an issue connecting to Qwen3-Coder"</code> — это
            ошибка <strong>клиент-серверного взаимодействия</strong>. В большинстве случаев проблема находится на стороне сервера
            (перегрузка, технические работы) или связана с сетевым подключением. Если ошибка повторяется систематически — 
            это может указывать на проблему с API-ключом или несовместимость версий.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-slate-500">
          Руководство по устранению ошибок подключения к AI-моделям • 2026
        </div>
      </footer>
    </div>
  )
}

function CauseCard({
  icon,
  title,
  description,
  solutions,
}: {
  icon: string
  title: string
  description: string
  solutions: string[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className="rounded-xl bg-slate-800/50 border border-slate-700/50 overflow-hidden hover:border-slate-600/50 transition-all"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 text-left flex items-start gap-4"
      >
        <span className="text-2xl mt-0.5">{icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
        <span className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-0 ml-12">
          <p className="text-sm font-medium text-emerald-400 mb-2">✅ Решения:</p>
          <ul className="space-y-2">
            {solutions.map((solution, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-emerald-500 mt-0.5">•</span>
                {solution}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DiagnosticStep({
  number,
  title,
  description,
  codes,
}: {
  number: number
  title: string
  description: string
  codes: { code: string; meaning: string }[]
}) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-sm font-bold text-blue-300 shrink-0">
        {number}
      </div>
      <div className="flex-1">
        <h4 className="font-medium text-white mb-1">{title}</h4>
        <p className="text-sm text-slate-400">{description}</p>
        {codes.length > 0 && (
          <div className="mt-3 space-y-2">
            {codes.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <code className="bg-slate-900 px-2 py-1 rounded text-amber-300 font-mono">
                  {item.code}
                </code>
                <span className="text-slate-400">→ {item.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
