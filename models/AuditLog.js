import mongoose from 'mongoose';

/**
 * Modelo específico para Log de Auditoría de Acciones de Usuario
 * Registra eventos de negocio significativos en un formato legible para humanos
 */
const auditLogSchema = new mongoose.Schema({
  // Usuario que realizó la acción
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Información del usuario (guardada para histórico)
  userInfo: {
    email: {
      type: String,
      required: false
    },
    name: {
      type: String,
      required: false
    },
    role: {
      type: String,
      required: false
    }
  },
  
  // Fecha y hora exacta de la acción
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  
  // Módulo del sistema donde ocurrió la acción
  module: {
    type: String,
    required: true,
    enum: [
      'ventas',           // Módulo de Ventas
      'inventario',       // Módulo de Inventario/Productos
      'clientes',         // Módulo de Contactos/Clientes
      'proveedores',      // Módulo de Proveedores
      'usuarios',         // Módulo de Usuarios y Seguridad
      'caja',            // Módulo de Caja/Retiros
      'devoluciones',    // Módulo de Devoluciones
      'ordenes_compra',  // Módulo de Órdenes de Compra
      'configuracion'    // Módulo de Configuración
    ],
    index: true
  },
  
  // Acción realizada (descripción legible en español)
  action: {
    type: String,
    required: true,
    enum: [
      // Ventas
      'Creación de Venta',
      'Anulación de Venta',
      'Modificación de Venta',
      'Registro de Pago',
      
      // Inventario
      'Creación de Producto',
      'Eliminación de Producto',
      'Modificación de Producto',
      'Ajuste de Stock',
      'Cambio de Precio',
      
      // Clientes
      'Creación de Cliente',
      'Eliminación de Cliente',
      'Modificación de Cliente',
      
      // Proveedores
      'Creación de Proveedor',
      'Eliminación de Proveedor',
      'Modificación de Proveedor',
      
      // Usuarios y Seguridad
      'Inicio de Sesión Exitoso',
      'Intento de Inicio de Sesión Fallido',
      'Cierre de Sesión',
      'Creación de Usuario',
      'Eliminación de Usuario',
      'Cambio de Rol',
      'Cambio de Permisos',
      'Cambio de Contraseña',
      
      // Caja
      'Apertura de Caja',
      'Cierre de Caja',
      'Retiro de Efectivo',
      
      // Devoluciones
      'Creación de Devolución',
      'Anulación de Devolución',
      
      // Órdenes de Compra
      'Creación de Orden de Compra',
      'Recepción de Orden de Compra',
      'Anulación de Orden de Compra',
      
      // Configuración
      'Modificación de Configuración'
    ]
  },
  
  // Entidad afectada (objeto específico)
  entity: {
    type: {
      type: String,
      required: true,
      enum: [
        'Factura', 'Producto', 'Servicio', 'Cliente', 'Proveedor', 
        'Usuario', 'Caja', 'Devolución', 'Orden de Compra', 'Configuración'
      ]
    },
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    }
  },
  
  // Descripción completa de la acción
  description: {
    type: String,
    required: true
  },
  
  // Detalles de cambios (para modificaciones)
  changes: [{
    field: {
      type: String,
      required: true
    },
    fieldLabel: {
      type: String,
      required: true
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  }],
  
  // Datos adicionales relevantes
  metadata: {
    ip: String,
    userAgent: String,
    amount: Number,          // Para transacciones monetarias
    quantity: Number,        // Para inventario
    affectedCount: Number,   // Para operaciones masivas
    reason: String,          // Razón de la acción (ej. motivo de anulación)
    notes: String           // Notas adicionales
  },
  
  // Resultado de la acción
  result: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success'
  },
  
  // Severidad del evento
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  }
}, {
  timestamps: true,
  collection: 'audit_logs'
});

// Índices para búsquedas eficientes
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ module: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ 'entity.type': 1, 'entity.id': 1 });
auditLogSchema.index({ timestamp: -1 });

// Método para obtener descripción formateada
auditLogSchema.methods.getFormattedDescription = function() {
  let desc = this.description;
  
  if (this.changes && this.changes.length > 0) {
    desc += '\nCambios realizados:';
    this.changes.forEach(change => {
      desc += `\n- ${change.fieldLabel}: "${change.oldValue}" → "${change.newValue}"`;
    });
  }
  
  return desc;
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
