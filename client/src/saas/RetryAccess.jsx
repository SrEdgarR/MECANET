import React, { useEffect, useState } from 'react';

export function RetryAccess({ retryAt, onRetry }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // A timer only updates the control; it never polls or renews activity.
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, retryAt - Date.now()), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [retryAt]);
  return <div>
    <button className="primary" type="button" onClick={onRetry} disabled={retryAt > now}>Reintentar acceso</button>
    {retryAt > now && <p className="muted small">Espera el plazo indicado por el servicio antes de reintentar.</p>}
  </div>;
}
