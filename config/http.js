export function createCorsOptions({ isLocalApp, env = process.env }) {
  const allowedOrigins = (env.CORS_ORIGINS || 'https://app.mecanet.site')
    .split(',').map(value => value.trim()).filter(Boolean);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (!isLocalApp && allowedOrigins.includes(origin)) return callback(null, true);
      if (isLocalApp || env.NODE_ENV !== 'production') {
        try {
          const url = new URL(origin);
          if (['http:', 'https:'].includes(url.protocol) &&
              ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
            return callback(null, true);
          }
        } catch {}
      }

      return callback(new Error('Acceso denegado por CORS'));
    },
  };
}

export function createHealthHandler(connection) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (connection.readyState !== 1) throw new Error('MongoDB no disponible');
      await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  };
}
