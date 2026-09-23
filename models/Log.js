import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  // Tipo de log
  type: {
    type: String,
    enum: ['info', 'warning', 'error', 'success', 'auth', 'action', 'performance', 'security', 'audit'],
    required: true,
    default: 'info'
  },
  
  // Nivel de severidad
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  
  // Categoría específica para mejor organización
  category: {
    type: String,
    enum: [
      'database', 'api', 'authentication', 'authorization', 
      'data_modification', 'system_event', 'user_action',
      'error_exception', 'performance_metric', 'security_event'
    ],
    default: 'user_action'
  },
  
  // Módulo/Entidad afectada
  module: {
    type: String,
    required: true,
    enum: [
      'auth',
      'users',
      'products',
      'sales',
      'returns',
      'customers',
      'suppliers',
      'inventory',
      'purchaseOrders',
      'cashRegister',
      'cashWithdrawals',
      'settings',
      'system',
      'dashboard',
      'logs',
      'proxy',
      'version'
    ]
  },
  
  // Acción realizada
  action: {
    type: String,
    required: true,
    // Ejemplos: 'login', 'create', 'update', 'delete', 'archive', 'cancel', 'print'
  },
  
  // Usuario que realizó la acción
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null para acciones del sistema
  },
  
  // Detalles del usuario (guardados para histórico)
  userDetails: {
    username: String,
    name: String,
    role: String
  },
  
  // Indica si es una acción automática del sistema (false = acción explícita del usuario)
  isSystemAction: {
    type: Boolean,
    default: false
  },
  
  // Entidad afectada (ID del documento)
  entityId: {
    type: String,
    default: null
  },
  
  // Nombre/descripción de la entidad
  entityName: {
    type: String,
    default: null
  },
  
  // Mensaje descriptivo
  message: {
    type: String,
    required: true
  },
  
  // Detalles adicionales (JSON)
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Información de la petición HTTP
  request: {
    method: String,      // GET, POST, PUT, DELETE
    url: String,         // /api/products/123
    ip: String,          // IP del cliente
    userAgent: String    // Navegador/cliente
  },
  
  // Información del error (extendida para debugging)
  error: {
    message: String,
    stack: String,
    code: String,
    type: String,                // Tipo de error: TypeError, ValidationError, etc.
    isOperational: Boolean,      // Si es un error esperado o crítico
    context: mongoose.Schema.Types.Mixed, // Contexto adicional del error
    handled: Boolean,            // Si el error fue manejado correctamente
    recovery: String             // Acción de recuperación tomada
  },
  
  // Cambios realizados (para auditoría detallada)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    fields: [String], // Array de campos modificados
    summary: String   // Resumen legible de los cambios
  },
  
  // Información de auditoría extendida
  audit: {
    // Detalles del contexto de la operación
    operation: String,          // Tipo de operación: CREATE, READ, UPDATE, DELETE
    resource: String,            // Recurso afectado
    resourceId: String,          // ID del recurso
    affectedRecords: Number,     // Número de registros afectados
    
    // Información de procedencia
    source: {
      type: String,
      enum: ['web', 'api', 'system', 'scheduled_job', 'webhook'],
      default: 'web'
    },
    
    // Información de sesión
    sessionId: String,
    correlationId: String,       // Para rastrear operaciones relacionadas
    
    // Geolocalización (si está disponible)
    geolocation: {
      country: String,
      city: String,
      latitude: Number,
      longitude: Number
    }
  },
  
  // Métricas de rendimiento
  performance: {
    executionTime: Number,       // Tiempo de ejecución en ms
    dbQueryTime: Number,         // Tiempo de consultas DB en ms
    memoryUsage: Number,         // Uso de memoria en bytes
    cpuUsage: Number,            // Uso de CPU en porcentaje
    queryCount: Number,          // Número de queries ejecutadas
    
    // Timestamps detallados
    startTime: Date,
    endTime: Date,
    
    // Métricas adicionales
    cacheHit: Boolean,           // Si se usó caché
    slowOperation: Boolean       // Si excedió el umbral de tiempo
  },
  
  // Metadata adicional
  metadata: {
    duration: Number,            // Duración de la operación en ms
    success: Boolean,            // Si la operación fue exitosa
    statusCode: Number,          // Código HTTP de respuesta
    
    // Información del sistema en el momento del log
    systemInfo: {
      nodeVersion: String,
      platform: String,
      hostname: String,
      processId: Number,
      uptime: Number             // Tiempo que lleva el servidor corriendo
    },
    
    // Tags para filtrado avanzado
    tags: [String],
    
    // Prioridad para alertas
    priority: {
      type: String,
      enum: ['urgent', 'high', 'normal', 'low'],
      default: 'normal'
    },
    
    // Información de notificaciones
    notified: Boolean,           // Si se envió notificación
    notificationSent: Date,
    
    // Información de resolución (para errores)
    resolved: Boolean,
    resolvedBy: mongoose.Schema.Types.ObjectId,
    resolvedAt: Date,
    resolution: String
  },
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Índices para búsquedas eficientes
logSchema.index({ type: 1, timestamp: -1 });
logSchema.index({ module: 1, timestamp: -1 });
logSchema.index({ user: 1, timestamp: -1 });
logSchema.index({ 'metadata.success': 1, timestamp: -1 });
logSchema.index({ severity: 1, timestamp: -1 });

// Método estático para limpiar logs antiguos
logSchema.statics.cleanOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({ timestamp: { $lt: cutoffDate } });
  return result.deletedCount;
};

// Método para obtener estadísticas
logSchema.statics.getStats = async function(startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        timestamp: {
          $gte: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          $lte: endDate || new Date()
        }
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          module: '$module'
        },
        count: { $sum: 1 },
        errors: {
          $sum: { $cond: [{ $eq: ['$type', 'error'] }, 1, 0] }
        },
        avgDuration: { $avg: '$metadata.duration' }
      }
    }
  ]);
};

const Log = mongoose.model('Log', logSchema);

export default Log;
