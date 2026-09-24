import mongoose from 'mongoose';
import dns from 'dns';

const DEFAULT_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
};

const normalize = (value) => String(value || '').trim();

const isSrvUri = (uri) => uri.startsWith('mongodb+srv://');

const isSrvDnsError = (error) => {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();

  return (
    text.includes('querysrv') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('etimeout')
  );
};

const getHostFromUri = (uri) => {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const hostAndPath = withoutScheme.split('@').pop() || '';
  return hostAndPath.split('/')[0] || 'host-desconocido';
};

const getDnsServersFromEnv = () => {
  const fromEnv = normalize(process.env.MONGODB_DNS_SERVERS)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return fromEnv.length > 0 ? fromEnv : DEFAULT_DNS_SERVERS;
};

const withTimeout = async (promise, timeoutMs, label) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Tiempo de espera agotado (${timeoutMs} ms) durante ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildMongooseOptions = () => {
  const options = {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 15000),
    socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 45000),
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 20)
  };

  const ipFamily = normalize(process.env.MONGODB_IP_FAMILY);
  if (ipFamily === '4' || ipFamily === '6') {
    options.family = Number(ipFamily);
  }

  return options;
};

const connectWithUri = async (uri, label, options) => {
  const attemptTimeoutMS = Number(process.env.MONGODB_CONNECT_ATTEMPT_TIMEOUT_MS || 20000);

  try {
    const conn = await withTimeout(
      mongoose.connect(uri, options),
      attemptTimeoutMS,
      `conectar a MongoDB (${label})`
    );

    console.log(`MongoDB conectado (${label}): ${conn.connection.host}`);
    return conn;
  } catch (error) {
    mongoose.disconnect().catch(() => undefined);
    throw error;
  }
};

const connectDB = async ({ allowFallback = true } = {}) => {
  const primaryUri = normalize(process.env.MONGODB_URI);
  const fallbackUri = normalize(process.env.MONGODB_URI_FALLBACK);
  const mongooseOptions = buildMongooseOptions();

  if (!primaryUri) {
    throw new Error('MONGODB_URI no esta definida en el archivo .env');
  }

  try {
    return await connectWithUri(primaryUri, 'principal', mongooseOptions);
  } catch (primaryError) {
    let lastError = primaryError;

    const allowDnsFallback = parseBoolean(process.env.MONGODB_DNS_FALLBACK, true);
    if (allowDnsFallback && isSrvUri(primaryUri) && isSrvDnsError(primaryError)) {
      const dnsServers = getDnsServersFromEnv();

      try {
        dns.setServers(dnsServers);
        console.info(`[INFO] El DNS local no resolvió el registro SRV; reintentando con DNS alternativos: ${dnsServers.join(', ')}`);
        return await connectWithUri(primaryUri, 'principal con dns alternativo', mongooseOptions);
      } catch (dnsRetryError) {
        lastError = dnsRetryError;
      }
    }

    if (fallbackUri && allowFallback) {
      try {
        console.info('[INFO] Intentando la conexión MONGODB_URI_FALLBACK...');
        return await connectWithUri(fallbackUri, 'fallback', mongooseOptions);
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    const messages = [`Error de conexion a MongoDB: ${lastError.message}`];

    if (isSrvUri(primaryUri) && isSrvDnsError(lastError)) {
      const host = getHostFromUri(primaryUri);
      messages.push(`DNS SRV no resolvio para ${host}`);
      if (allowFallback) {
        messages.push('Revisa DNS local o define MONGODB_URI_FALLBACK con un URI mongodb://...');
      } else {
        messages.push('Revisa DNS y conectividad para MONGODB_URI principal. Esta operación no cambia a MONGODB_URI_FALLBACK.');
      }
    }

    const wrappedError = new Error(messages.join('. '));
    wrappedError.originalError = lastError;
    throw wrappedError;
  }
};

export default connectDB;
