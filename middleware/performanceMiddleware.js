import LogService from '../services/logService.js';

/**
 * Middleware para medir el rendimiento de las peticiones HTTP
 * Registra automáticamente métricas de tiempo de ejecución, uso de memoria, etc.
 */
export const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  
  // Contador de queries (si se usa Mongoose)
  let queryCount = 0;
  let dbQueryTime = 0;
  
  // Interceptar queries de mongoose (opcional, requiere configuración adicional)
  // NOTA: Esto debe hacerse UNA SOLA VEZ al iniciar la app, no en cada request.
  // Se ha movido la lógica para evitar reescrituras múltiples y stack overflow.
  /*
  if (global.mongoose) {
    const originalQuery = global.mongoose.Query.prototype.exec;
    global.mongoose.Query.prototype.exec = async function() {
      const queryStart = Date.now();
      queryCount++;
      const result = await originalQuery.apply(this, arguments);
      dbQueryTime += Date.now() - queryStart;
      return result;
    };
  }
  */
  
  // Guardar el método original de res.json
  // const originalJson = res.json;
  // const originalSend = res.send;
  
  // Función para registrar métricas
  const logPerformance = () => {
    // Evitar registrar si ya se registró (por si acaso)
    if (res.locals.performanceLogged) return;
    res.locals.performanceLogged = true;

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memoryUsed = (endMemory - startMemory) / 1024 / 1024; // MB
    
    // Solo registrar si es una petición a /api y si es lenta o problemática
    if (req.originalUrl.startsWith('/api')) {
      const urlWithoutQuery = req.originalUrl.split('?')[0];
      const urlParts = urlWithoutQuery.split('/');
      let module = urlParts[2] || 'system';
      
      // Normalizar nombres de módulos
      if (module === 'purchase-orders') module = 'purchaseOrders';
      if (module === 'cash-withdrawals') module = 'cashWithdrawals';
      
      const isSlowRequest = executionTime > 1000; // > 1 segundo
      const isSlowDB = dbQueryTime > 100; // > 100ms en DB
      const statusCode = res.statusCode;
      
      // Registrar solo si es lento, error, o cada N peticiones para baseline
      if (isSlowRequest || isSlowDB || statusCode >= 500 || Math.random() < 0.1) {
        // No bloquear la respuesta, registrar en background
        setImmediate(() => {
          LogService.logPerformance({
            module,
            action: req.method.toLowerCase(),
            operation: `${req.method} ${urlWithoutQuery}`,
            executionTime,
            dbQueryTime,
            queryCount,
            memoryUsage: memoryUsed,
            details: {
              statusCode,
              method: req.method,
              url: req.originalUrl,
              queryParams: req.query,
              bodySize: req.headers['content-length'] || 0
            },
            user: req.user || null,
            req
          }).catch(err => {
            console.error('Error al registrar métricas de rendimiento:', err.message);
          });
        });
      }
    }
  };
  
  // Usar el evento 'finish' que es el estándar para logging en Express
  // Se dispara cuando la respuesta se ha enviado completamente al cliente
  res.on('finish', logPerformance);
  
  // También escuchar 'close' por si la conexión se cierra prematuramente
  res.on('close', logPerformance);
  
  next();
};

/**
 * Utilidad para medir el tiempo de ejecución de funciones específicas
 */
export class PerformanceTracker {
  constructor(operation, module) {
    this.operation = operation;
    this.module = module;
    this.startTime = Date.now();
    this.startMemory = process.memoryUsage().heapUsed;
    this.queryCount = 0;
    this.dbQueryTime = 0;
  }
  
  /**
   * Registrar una query de base de datos
   */
  trackQuery(duration) {
    this.queryCount++;
    this.dbQueryTime += duration;
  }
  
  /**
   * Finalizar y registrar las métricas
   */
  async end(user = null, details = {}) {
    const endTime = Date.now();
    const executionTime = endTime - this.startTime;
    const endMemory = process.memoryUsage().heapUsed;
    const memoryUsed = (endMemory - this.startMemory) / 1024 / 1024; // MB
    
    try {
      await LogService.logPerformance({
        module: this.module,
        action: 'tracked_operation',
        operation: this.operation,
        executionTime,
        dbQueryTime: this.dbQueryTime,
        queryCount: this.queryCount,
        memoryUsage: memoryUsed,
        details,
        user
      });
    } catch (error) {
      console.error('Error al registrar tracker de rendimiento:', error.message);
    }
    
    return {
      executionTime,
      dbQueryTime: this.dbQueryTime,
      queryCount: this.queryCount,
      memoryUsed
    };
  }
}

/**
 * Decorator para funciones async que mide su rendimiento automáticamente
 */
export function trackPerformance(operation, module) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      const tracker = new PerformanceTracker(operation || propertyKey, module);
      
      try {
        const result = await originalMethod.apply(this, args);
        await tracker.end();
        return result;
      } catch (error) {
        await tracker.end(null, { error: error.message });
        throw error;
      }
    };
    
    return descriptor;
  };
}
