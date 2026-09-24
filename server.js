import mongoose from 'mongoose';
﻿/**
 * SERVER.JS - Punto de entrada principal del servidor backend
 * 
 * Este archivo configura y arranca el servidor Express que maneja:
 * - AutenticaciÃ³n de usuarios (JWT)
 * - GestiÃ³n de inventario de productos
 * - Procesamiento de ventas y facturaciÃ³n
 * - AdministraciÃ³n de clientes y proveedores
 * - ConfiguraciÃ³n del sistema
 * - Retiros de caja y cierres
 * - Reportes y estadÃ­sticas del dashboard
 */

import express from 'express';
import cors from 'cors'; // Middleware para permitir peticiones desde otros dominios (frontend)
import dotenv from 'dotenv'; // Carga variables de entorno desde archivo .env
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import open from 'open'; // Para abrir el navegador automÃ¡ticamente
import connectDB from './config/db.js'; // FunciÃ³n para conectar a MongoDB
import LogService from './services/logService.js'; // Servicio de logs con limpieza automÃ¡tica
import rateLimit from 'express-rate-limit';
import { execSync } from 'child_process';
import helmet from 'helmet';
import { rejectUnsafeKeys } from './middleware/validationMiddleware.js';

// ========== MANEJO DE ERRORES GLOBALES ==========
// Capturar errores no manejados para evitar que el ejecutable se cierre sin mostrar informaciÃ³n
process.on('uncaughtException', (error) => {
  console.error('\nâŒ ERROR CRÃTICO NO CAPTURADO:');
  console.error(error);
  console.error('\nStack trace:', error.stack);
  if (process.env.NODE_ENV === 'production' && process.stdin.isTTY) {
    console.log('\nâ¸ï¸  Presiona cualquier tecla para cerrar...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\nâŒ PROMESA RECHAZADA NO MANEJADA:');
  console.error('RazÃ³n:', reason);
  console.error('Promesa:', promise);
  if (process.env.NODE_ENV === 'production' && process.stdin.isTTY) {
    console.log('\nâ¸ï¸  Presiona cualquier tecla para cerrar...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});

// ========== IMPORTAR TODAS LAS RUTAS ==========
// Cada archivo de rutas maneja un mÃ³dulo especÃ­fico de la aplicaciÃ³n
import authRoutes from './routes/authRoutes.js'; // Login, registro, verificaciÃ³n de token
import userRoutes from './routes/userRoutes.js'; // CRUD de usuarios del sistema
import productRoutes from './routes/productRoutes.js'; // CRUD de productos en inventario
import saleRoutes from './routes/saleRoutes.js'; // Crear ventas, historial, estadÃ­sticas
import customerRoutes from './routes/customerRoutes.js'; // CRUD de clientes
import settingsRoutes from './routes/settingsRoutes.js'; // ConfiguraciÃ³n del negocio y sistema
import dashboardRoutes from './routes/dashboardRoutes.js'; // EstadÃ­sticas y KPIs del dashboard
import supplierRoutes from './routes/supplierRoutes.js'; // CRUD de proveedores
import purchaseOrderRoutes from './routes/purchaseOrderRoutes.js'; // Ã“rdenes de compra a proveedores
import proxyRoutes from './routes/proxyRoutes.js'; // Proxy para APIs externas (clima, etc)
import returnRoutes from './routes/returnRoutes.js'; // Devoluciones de productos
import cashWithdrawalRoutes from './routes/cashWithdrawalRoutes.js'; // Retiros de caja
import logRoutes from './routes/logRoutes.js'; // Sistema de logs tÃ©cnicos
import auditLogRoutes from './routes/auditLogRoutes.js'; // Sistema de auditorÃ­a de usuario
import quotationRoutes from './routes/quotationRoutes.js'; // Cotizaciones
import systemRoutes from './routes/systemRoutes.js'; // Actualizaciones del sistema
import permissionRoutes from './routes/permissionRoutes.js';
import { sectionAccessGate } from './middleware/sectionAccessMiddleware.js';

// Importar modelos para endpoint de debug
import Return from './models/Return.js';
import Sale from './models/Sale.js';

// Importar middleware de manejo de errores global
import { errorHandler } from './middleware/errorMiddleware.js';
// Importar middleware de logging
import { requestLogger, errorLogger } from './middleware/logMiddleware.js';
// Importar middleware de monitoreo de rendimiento
import { performanceMonitor } from './middleware/performanceMiddleware.js';
import { protect, admin } from './middleware/authMiddleware.js';

// ========== CONFIGURACIÃ“N INICIAL ==========
// Configurar __dirname para ES modules (necesario porque usamos "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== CONTROL DE VERSIONES Y MODO DE APLICACIÃ“N ==========
// Leer package.json y version.json para asegurar consistencia
let APP_VERSION = '0.0.0';
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const versionJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8'));

  if (packageJson.version !== versionJson.version) {
    console.error('âŒ ERROR CRÃTICO DE VERSIÃ“N:');
    console.error(`   package.json: ${packageJson.version}`);
    console.error(`   version.json: ${versionJson.version}`);
    console.error('   Las versiones deben coincidir para iniciar el sistema.');
    process.exit(1);
  }

  APP_VERSION = packageJson.version;
  console.log(`\nðŸš€ MECANET v${APP_VERSION} âœ…`);
} catch (error) {
  console.error('âŒ Error leyendo versiÃ³n:', error.message);
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

// Determinar modo de aplicaciÃ³n
const envResult = dotenv.config();
if (envResult.error) {
  console.error('âš ï¸  Archivo .env no encontrado');
}

const IS_CLOUD_ENV = process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL || process.env.HEROKU_APP_NAME;
const APP_MODE = process.env.APP_MODE || (IS_CLOUD_ENV ? 'cloud' : 'desktop');
const IS_LOCAL_APP = APP_MODE === 'desktop';

// ===== ValidaciÃ³n temprana de JWT_SECRET =====
// Aseguramos que exista un secreto para JWT y tenga longitud mÃ­nima razonable.
const MIN_JWT_LENGTH = 32; // mÃ­nimo recomendado (en hex esto serÃ­a 32+), ajustar segÃºn necesidades
const jwtSecret = process.env.JWT_SECRET;

// FunciÃ³n auxiliar para mantener la ventana abierta en caso de error fatal
const waitAndExit = async (exitCode = 1) => {
  const shouldWaitForKey = process.env.NODE_ENV === 'production' && process.stdin.isTTY;

  if (!shouldWaitForKey) {
    process.exit(exitCode);
    return;
  }

  console.log('\nPresiona cualquier tecla para salir...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(exitCode));

  // Mantener el proceso vivo hasta que el usuario interact?e
  await new Promise(() => {});
};

if (!jwtSecret || String(jwtSecret).length < MIN_JWT_LENGTH) {
  console.error('\nâŒ FATAL: La variable de entorno JWT_SECRET no estÃ¡ definida o es demasiado corta.');
  console.error('   Longitud actual:', jwtSecret ? jwtSecret.length : 0, '| MÃ­nimo requerido:', MIN_JWT_LENGTH);
  console.error('\nðŸ“ Soluciones:');
  console.error('   1. AsegÃºrate de que el archivo .env exista en la misma carpeta que el ejecutable');
  console.error('   2. Genera un secreto seguro ejecutando: node ./scripts/generateJwtSecret.js');
  console.error('   3. Copia el secreto generado al archivo .env');
  console.error('\nðŸ“‚ UbicaciÃ³n esperada del .env:', path.join(__dirname, '.env'));
  // Cortamos el arranque del servidor para evitar correr sin secreto vÃ¡lido
  await waitAndExit(1);
}

// Conectar a MongoDB
console.log('ðŸ“¡ Conectando a base de datos...');
try {
  await connectDB();
  const pendingSetup = await mongoose.connection.db.collection('__mecanet_setup_recovery').findOne({ _id: 'active' });
  if (pendingSetup) throw new Error('Hay una configuración pendiente de recuperación. Revísala con setup-client antes de iniciar MECANET.');
  console.log('âœ… Base de datos conectada');
} catch (error) {
  console.error('âŒ Error de conexiÃ³n:', error.message);
  await waitAndExit(1);
}

// Iniciar limpieza automÃ¡tica de logs
LogService.startAutoCleaning();

// Inicializar la aplicaciÃ³n Express
const app = express();
app.set('query parser', 'simple');

// Habilitar 'trust proxy' es necesario para despliegues en Railway/Vercel/AWS
// Esto permite que express-rate-limit identifique correctamente la IP real del usuario
app.set('trust proxy', IS_LOCAL_APP ? false : 1);

// ========== MIDDLEWARE GLOBAL ==========
// CORS: Configurado segÃºn el modo de aplicaciÃ³n (CamaleÃ³n)
// DEBE IR PRIMERO para que las respuestas de error (como rate limit) tengan headers CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (mobile apps, curl, localhost)
    if (!origin) return callback(null, true);

    // MODO ESCRITORIO (LOCAL): Permisivo con localhost
    if (IS_LOCAL_APP) {
      try {
        const parsed = new URL(origin);
        if (['http:', 'https:'].includes(parsed.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
          return callback(null, true);
        }
      } catch {}
      return callback(new Error('Acceso denegado por CORS'));
    }
    // MODO NUBE (RAILWAY/WEB): Estricto
    else {
      const allowedOrigins = [
        'https://mecanet-production.up.railway.app',
        'https://beneficial-reprieve-production-b547.up.railway.app',
        'https://www.mecanet.site',
        'https://mecanet.site'
      ];

      // En desarrollo (NODE_ENV !== production) permitimos localhost tambiÃ©n
      if (process.env.NODE_ENV !== 'production') {
        allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:5000', 'http://localhost:5173');
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        console.warn(`Origen bloqueado por CORS: ${origin}`);
        return callback(new Error('Acceso denegado por CORS'));
      }
    }
  },
  credentials: true // Permitir cookies/headers autorizados
};

app.use(cors(corsOptions));

// ConfiguraciÃ³n de Proxy para modo Nube
if (!IS_LOCAL_APP) {
  app.set('trust proxy', 1); // Confiar en el primer proxy (Railway/Nginx/Cloudflare)
}

// ========== SEGURIDAD ==========
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https:', 'http://localhost:*', 'http://127.0.0.1:*'],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': IS_LOCAL_APP ? null : []
    }
  }
}));

// 2. RATE LIMITING: Proteger contra fuerza bruta y DDoS
// LÃ­mite general: 100 peticiones por IP cada 15 minutos
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // LÃ­mite por IP
  standardHeaders: true, // Retorna info de lÃ­mite en las cabeceras `RateLimit-*`
  legacyHeaders: false, // Deshabilita las cabeceras `X-RateLimit-*`
  message: {
    status: 429,
    message: 'Demasiadas peticiones desde esta IP, por favor intente nuevamente en 15 minutos'
  }
});

// Aplicar limitador a todas las rutas
app.use(limiter);

// Limitador estricto para rutas de autenticaciÃ³n (login)
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 intentos de login por hora por IP
  message: {
    status: 429,
    message: 'Demasiados intentos de inicio de sesiÃ³n, por favor intente nuevamente en una hora'
  }
});
app.use('/api/auth/login', authLimiter);

// Parseo de JSON y URL-encoded
app.use('/api/settings/import', protect, admin, express.json({ limit: '50mb' }));
app.use(express.json({ limit: '5mb' })); // Aumentado para imÃ¡genes base64 si es necesario
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(rejectUnsafeKeys);

// ========== MIDDLEWARE DE LOGGING Y MONITOREO ==========
// Monitoreo de rendimiento (debe ir primero para medir todo)
app.use(performanceMonitor);

// Registrar todas las peticiones HTTP
app.use(requestLogger);

// Endpoint para obtener versiÃ³n del sistema (Definido al inicio para evitar conflictos)
app.get('/api/version', (req, res) => {
  try {
    const versionPath = path.join(__dirname, 'version.json');
    const changelogPath = path.join(__dirname, 'CHANGELOG.md');

    let versionData = { version: '1.0.0', releaseNotes: 'VersiÃ³n inicial' };

    if (fs.existsSync(versionPath)) {
      try {
        versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      } catch (e) {
        console.error('Error parseando version.json:', e);
      }
    }

    // Obtener commit hash actual
    try {
      // Intentar obtener info de git solo si existe la carpeta .git
      if (fs.existsSync(path.join(__dirname, '.git'))) {
        const commitHash = execSync('git rev-parse --short HEAD', {
          cwd: __dirname,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'] // Evitar que errores salgan a consola
        }).trim();
        versionData.commit = commitHash;

        const commitMessage = execSync('git log -1 --pretty=%B', {
          cwd: __dirname,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        versionData.commitMessage = commitMessage;
      } else {
        versionData.commit = 'build';
        versionData.commitMessage = 'Production Build';
      }
    } catch (err) {
      // Silencioso en producciÃ³n
      versionData.commit = 'unknown';
      versionData.commitMessage = 'No disponible';
    }

    // Leer CHANGELOG.md y extraer notas de la versiÃ³n actual
    if (fs.existsSync(changelogPath)) {
      try {
        const changelog = fs.readFileSync(changelogPath, 'utf8');
        const versionRegex = new RegExp(`## \\[${versionData.version}\\][\\s\\S]*?(?=## \\[|$)`, 'i');
        const match = changelog.match(versionRegex);

        if (match) {
          // Limpiar el texto: remover el tÃ­tulo de versiÃ³n y formatear
          let notes = match[0]
            .replace(/## \[.*?\].*?\n/, '') // Remover tÃ­tulo
            .trim();

          versionData.releaseNotes = notes || versionData.releaseNotes;
        }
      } catch (e) {
        console.error('Error leyendo changelog:', e);
      }
    }

    res.json(versionData);
  } catch (error) {
    console.error('Error al leer versiÃ³n:', error);
    // Enviar JSON incluso en error 500 para evitar SyntaxError en cliente
    res.status(500).json({ message: 'Error al obtener versiÃ³n', version: '0.0.0' });
  }
});

// ========== REGISTRO DE RUTAS API ==========
// Cada ruta tiene su prefijo y se delega a su archivo de rutas correspondiente
app.use('/api/auth', authRoutes); // /api/auth/login, /api/auth/register, etc
app.use('/api', sectionAccessGate);
app.use('/api/permissions', permissionRoutes);
app.use('/api/users', userRoutes); // /api/users (CRUD usuarios)
app.use('/api/products', productRoutes); // /api/products (CRUD productos)
app.use('/api/sales', saleRoutes); // /api/sales (crear ventas, historial)
app.use('/api/customers', customerRoutes); // /api/customers (CRUD clientes)
app.use('/api/settings', settingsRoutes); // /api/settings (configuraciÃ³n)
app.use('/api/dashboard', dashboardRoutes); // /api/dashboard/stats
app.use('/api/suppliers', supplierRoutes); // /api/suppliers (CRUD proveedores)
app.use('/api/purchase-orders', purchaseOrderRoutes); // /api/purchase-orders
app.use('/api/proxy', proxyRoutes); // /api/proxy/weather (proxy APIs externas)
app.use('/api/returns', returnRoutes); // /api/returns (devoluciones)
app.use('/api/cash-withdrawals', cashWithdrawalRoutes); // /api/cash-withdrawals
app.use('/api/logs', logRoutes); // /api/logs (logs tÃ©cnicos del sistema)
app.use('/api/audit-logs', auditLogRoutes); // /api/audit-logs (auditorÃ­a de usuario)
app.use('/api/quotations', quotationRoutes); // /api/quotations (cotizaciones)
app.use('/api/system', systemRoutes); // /api/system (actualizaciones del sistema)

// Endpoint de debug para verificar devoluciones
app.get('/api/debug/returns', protect, admin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Obtener todas las devoluciones completadas
    const returns = await Return.find({ status: 'Completada' })
      .populate('sale', 'createdAt invoiceNumber total')
      .limit(20)
      .lean();

    const debug = {
      today: today.toISOString(),
      totalReturns: returns.length,
      returns: returns.map(r => ({
        id: r._id,
        returnNumber: r.returnNumber,
        totalAmount: r.totalAmount,
        returnDate: r.createdAt,
        saleInvoice: r.sale?.invoiceNumber,
        saleDate: r.sale?.createdAt,
        saleTotal: r.sale?.total
      }))
    };

    res.json(debug);
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta fallback para APIs no existentes
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Ruta API no encontrada' });
});

// ========== SERVIR FRONTEND EN PRODUCCIÃ“N ==========
// En producciÃ³n, Express sirve los archivos estÃ¡ticos del build de React
if (process.env.NODE_ENV === 'production') {
  // Servir archivos estÃ¡ticos del frontend compilado
  const clientDistPath = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientDistPath));

  // Ruta catch-all: cualquier peticiÃ³n que no sea API debe devolver el index.html
  // Esto permite que React Router maneje el enrutamiento del lado del cliente
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // En desarrollo, solo API
  app.get('/', (req, res) => {
    res.json({
      message: 'MECANET API estÃ¡ funcionando correctamente',
      status: 'online',
      timestamp: new Date().toISOString()
    });
  });
}

// ========== MIDDLEWARE DE ERRORES ==========
// Logger de errores (debe ir ANTES del errorHandler)
app.use(errorLogger);

// Este middleware captura cualquier error que ocurra en las rutas
// Debe estar DESPUÃ‰S de todas las rutas para que pueda interceptar sus errores
app.use(errorHandler);

// ========== ARRANCAR SERVIDOR ==========
// Usa el puerto de la variable de entorno o 5000 por defecto
const PORT = process.env.PORT || 5000;

const BIND_HOST = process.env.BIND_HOST || (IS_LOCAL_APP ? '127.0.0.1' : '0.0.0.0');
app.listen(PORT, BIND_HOST, async () => {
  console.log('\nâœ… Servidor iniciado en http://localhost:' + PORT);
  console.log('   Entorno:', process.env.NODE_ENV || 'development');

  // En modo ESCRITORIO (Local), abrir automÃ¡ticamente el navegador
  // NOTA: Solo abrir si no viene de un reinicio (evitar duplicados)
  if (IS_LOCAL_APP && process.env.NODE_ENV === 'production' && !process.env.SKIP_BROWSER_OPEN) {
    try {
      await open(`http://localhost:${PORT}`);
      console.log('âœ… Navegador abierto\n');
    } catch (error) {
      console.log('âš ï¸  Abre manualmente: http://localhost:' + PORT + '\n');
    }
  }
}).on('error', (error) => {
  console.error('\nâŒ Error al iniciar servidor:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`   Puerto ${PORT} ya estÃ¡ en uso. Cierra otras instancias.`);
  }
  if (process.env.NODE_ENV === 'production' && process.stdin.isTTY) {
    console.log('\nâ¸ï¸  Presiona cualquier tecla para cerrar...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});


