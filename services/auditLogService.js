import { redactSecrets } from './redactSecrets.js';
import AuditLog from '../models/AuditLog.js';

/**
 * Servicio de Auditoría de Acciones de Usuario
 * Registra eventos de negocio significativos en formato legible para humanos
 * 
 * Este servicio es SEPARADO del log técnico del sistema y se enfoca exclusivamente
 * en las acciones que los usuarios realizan sobre los datos y funcionalidades clave.
 */
class AuditLogService {
  
  /**
   * Registrar una acción de auditoría
   * 
   * @param {Object} params - Parámetros de la auditoría
   * @param {Object} params.user - Usuario que realizó la acción (objeto completo)
   * @param {String} params.module - Módulo del sistema
   * @param {String} params.action - Acción realizada (descripción en español)
   * @param {Object} params.entity - Entidad afectada
   * @param {String} params.entity.type - Tipo de entidad
   * @param {String} params.entity.id - ID de la entidad
   * @param {String} params.entity.name - Nombre de la entidad
   * @param {String} params.description - Descripción completa
   * @param {Array} params.changes - Cambios realizados (opcional)
   * @param {Object} params.metadata - Datos adicionales (opcional)
   * @param {Object} params.req - Request object para obtener IP y UserAgent (opcional)
   * @param {String} params.result - Resultado de la acción (opcional)
   * @param {String} params.severity - Severidad del evento (opcional)
   */
  static async log({
    user,
    module,
    action,
    entity,
    description,
    changes = [],
    metadata = {},
    req = null,
    result = 'success',
    severity = 'info'
  }) {
    try {
      // Validar que el usuario exista
      if (!user || !user._id) {
        console.error('AuditLog: Usuario no proporcionado');
        return null;
      }
      
      // Extraer información del request si existe
      const requestInfo = {};
      if (req) {
        requestInfo.ip = req.ip || req.connection?.remoteAddress;
        requestInfo.userAgent = req.get('user-agent');
      }
      
      // Crear el log de auditoría
      const auditLog = new AuditLog(redactSecrets({
        user: user._id,
        userInfo: {
          email: user.email,
          name: user.name || user.email,
          role: user.role
        },
        timestamp: new Date(),
        module,
        action,
        entity: {
          type: entity.type,
          id: entity.id.toString(),
          name: entity.name
        },
        description,
        changes: changes.map(change => ({
          field: change.field,
          fieldLabel: change.fieldLabel || change.field,
          oldValue: change.oldValue,
          newValue: change.newValue
        })),
        metadata: {
          ...metadata,
          ...requestInfo
        },
        result,
        severity
      }));
      
      await auditLog.save();
      
      console.log(`✓ Auditoría registrada: [${module}] ${action} - ${entity.name}`);
      
      return auditLog;
      
    } catch (error) {
      console.error('Error al crear log de auditoría:', error);
      return null;
    }
  }
  
  /**
   * MÉTODOS DE CONVENIENCIA PARA MÓDULOS ESPECÍFICOS
   */
  
  /**
   * Registrar acción en el módulo de Ventas
   */
  static async logSale({
    user,
    action,
    saleId,
    saleNumber,
    description,
    amount = null,
    customer = null,
    changes = [],
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'ventas',
      action,
      entity: {
        type: 'Factura',
        id: saleId,
        name: `Factura #${saleNumber}`
      },
      description,
      changes,
      metadata: {
        ...metadata,
        amount,
        customer
      },
      req,
      severity: action.includes('Anulación') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Inventario
   */
  static async logInventory({
    user,
    action,
    productId,
    productName,
    description,
    changes = [],
    metadata = {},
    req = null
  }) {
    const entityType = metadata.isService ? 'Servicio' : 'Producto';
    
    return await this.log({
      user,
      module: 'inventario',
      action,
      entity: {
        type: entityType,
        id: productId,
        name: productName
      },
      description,
      changes,
      metadata,
      req,
      severity: action.includes('Eliminación') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Clientes
   */
  static async logCustomer({
    user,
    action,
    customerId,
    customerName,
    description,
    changes = [],
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'clientes',
      action,
      entity: {
        type: 'Cliente',
        id: customerId,
        name: customerName
      },
      description,
      changes,
      metadata,
      req,
      severity: action.includes('Eliminación') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Proveedores
   */
  static async logSupplier({
    user,
    action,
    supplierId,
    supplierName,
    description,
    changes = [],
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'proveedores',
      action,
      entity: {
        type: 'Proveedor',
        id: supplierId,
        name: supplierName
      },
      description,
      changes,
      metadata,
      req,
      severity: action.includes('Eliminación') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción de autenticación
   */
  static async logAuth({
    user,
    action,
    description,
    metadata = {},
    req = null,
    result = 'success'
  }) {
    // Para intentos fallidos, el usuario puede ser null
    const userName = user?.name || user?.email || metadata.attemptedUsername || 'Desconocido';
    
    // Si no hay usuario válido, no crear log de auditoría
    // Esto ocurre en intentos de login fallidos o cuando el usuario no existe
    if (!user || !user._id) {
      return null;
    }
    
    return await this.log({
      user,
      module: 'usuarios',
      action,
      entity: {
        type: 'Usuario',
        id: user._id.toString(),
        name: userName
      },
      description,
      metadata,
      req,
      result,
      severity: result === 'failed' ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Usuarios
   */
  static async logUser({
    user,
    action,
    targetUserId,
    targetUserName,
    description,
    changes = [],
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'usuarios',
      action,
      entity: {
        type: 'Usuario',
        id: targetUserId,
        name: targetUserName
      },
      description,
      changes,
      metadata,
      req,
      severity: action.includes('Eliminación') || action.includes('Cambio de Rol') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Caja
   */
  static async logCashRegister({
    user,
    action,
    cashRegisterId,
    description,
    amount = null,
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'caja',
      action,
      entity: {
        type: 'Caja',
        id: cashRegisterId,
        name: `Caja ${new Date().toLocaleDateString('es-DO')}`
      },
      description,
      metadata: {
        ...metadata,
        amount
      },
      req,
      severity: action.includes('Retiro') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Devoluciones
   */
  static async logReturn({
    user,
    action,
    returnId,
    returnNumber,
    description,
    amount = null,
    changes = [],
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'devoluciones',
      action,
      entity: {
        type: 'Devolución',
        id: returnId,
        name: `Devolución #${returnNumber}`
      },
      description,
      changes,
      metadata: {
        ...metadata,
        amount
      },
      req,
      severity: action.includes('Anulación') ? 'warning' : 'info'
    });
  }
  
  /**
   * Registrar acción en el módulo de Órdenes de Compra
   */
  static async logPurchaseOrder({
    user,
    action,
    orderId,
    orderNumber,
    description,
    changes = [],
    metadata = {},
    req = null
  }) {
    return await this.log({
      user,
      module: 'ordenes_compra',
      action,
      entity: {
        type: 'Orden de Compra',
        id: orderId,
        name: `Orden #${orderNumber}`
      },
      description,
      changes,
      metadata,
      req,
      severity: action.includes('Anulación') ? 'warning' : 'info'
    });
  }
  
  /**
   * Obtener logs de auditoría con filtros
   */
  static async getLogs({
    page = 1,
    limit = 50,
    module = null,
    action = null,
    user = null,
    startDate = null,
    endDate = null,
    severity = null,
    entityType = null
  } = {}) {
    try {
      const query = {};
      
      if (module) query.module = module;
      if (action) query.action = action;
      if (user) query.user = user;
      if (severity) query.severity = severity;
      if (entityType) query['entity.type'] = entityType;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }
      
      const skip = (page - 1) * limit;
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('user', 'username name role')
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
      
    } catch (error) {
      console.error('Error al obtener logs de auditoría:', error);
      throw error;
    }
  }
  
  /**
   * Obtener estadísticas de auditoría
   */
  static async getStats(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const stats = await AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              module: '$module',
              action: '$action'
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 20
        }
      ]);
      
      const totalActions = await AuditLog.countDocuments({
        timestamp: { $gte: startDate }
      });
      
      const criticalActions = await AuditLog.countDocuments({
        timestamp: { $gte: startDate },
        severity: 'critical'
      });
      
      const warningActions = await AuditLog.countDocuments({
        timestamp: { $gte: startDate },
        severity: 'warning'
      });
      
      return {
        stats,
        summary: {
          total: totalActions,
          critical: criticalActions,
          warning: warningActions,
          info: totalActions - criticalActions - warningActions
        }
      };
      
    } catch (error) {
      console.error('Error al obtener estadísticas de auditoría:', error);
      throw error;
    }
  }
  
  /**
   * Limpiar logs antiguos
   */
  static async cleanOldLogs(daysToKeep = 365) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      
      return {
        deleted: result.deletedCount,
        cutoffDate
      };
      
    } catch (error) {
      console.error('Error al limpiar logs de auditoría:', error);
      throw error;
    }
  }
}

export default AuditLogService;
