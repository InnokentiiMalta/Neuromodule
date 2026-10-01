import { useEffect, useState } from 'react';
import { checkServerHealth } from '../api/backend';

export default function ServerStatus() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'online' | 'offline'

  useEffect(() => {
    let mounted = true;

    const ping = async () => {
      const ok = await checkServerHealth();
      if (mounted) setStatus(ok ? 'online' : 'offline');
    };

    ping();
    const interval = setInterval(ping, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const styles = {
    checking: { color: '#888', label: 'Проверка...' },
    online:   { color: '#2e7d32', label: 'Сервер прогноза: онлайн' },
    offline:  { color: '#c62828', label: 'Сервер прогноза: офлайн' },
  };

  const s = styles[status];

  return (
    <div style={{ padding: '6px 12px', fontSize: 13, color: s.color, fontWeight: 500 }}>
      ● {s.label}
    </div>
  );
}
