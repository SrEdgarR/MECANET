/**
 * SETTINGS.JS - Modelo de Configuración del Sistema
 * 
 * Almacena toda la configuración personalizable de la aplicación.
 * Implementa patrón Singleton (solo existe un documento de settings).
 * 
 * Incluye configuración de:
 * - Datos del negocio (nombre, logo, contacto)
 * - Parámetros fiscales (impuestos, moneda)
 * - Alertas y umbrales (stock bajo, órdenes automáticas)
 * - Integraciones externas (clima, API keys)
 * - Preferencias de UI (posición de toast, footer de recibo)
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE CONFIGURACIÓN
 * Solo existirá un documento de este tipo en la BD (Singleton)
 */
const settingsSchema = new mongoose.Schema({
  // ===== DATOS DEL NEGOCIO =====
  // Nombre del negocio (se muestra en sidebar y recibos)
  businessName: {
    type: String,
    default: 'MECANET'
  },

  // URL del logo (puede ser local o externa)
  businessLogoUrl: {
    type: String,
    default: '/default-logo.png'
  },

  // Dirección física del negocio
  businessAddress: {
    type: String,
    default: ''
  },

  // Teléfono de contacto
  businessPhone: {
    type: String,
    default: ''
  },

  // Email de contacto
  businessEmail: {
    type: String,
    default: ''
  },

  // ===== SISTEMA Y ACTUALIZACIONES =====
  // Permite que el sistema busque y aplique actualizaciones automáticamente
  autoUpdate: {
    type: Boolean,
    default: true
  },

  // ===== CONFIGURACIÓN DE EMAIL/SMTP =====
  // Configuración del servidor SMTP para envío de emails
  smtp: {
    enabled: {
      type: Boolean,
      default: true
    },
    // Host del servidor SMTP (ej: smtp.gmail.com)
    host: {
      type: String,
      default: 'smtp.gmail.com',
      trim: true
    },
    // Puerto SMTP (587 para TLS, 465 para SSL)
    port: {
      type: Number,
      default: 587
    },
    // Usar SSL (true para puerto 465, false para 587)
    secure: {
      type: Boolean,
      default: false
    },
    // Usuario/email de la cuenta SMTP
    user: {
      type: String,
      trim: true,
      default: ''
    },
    // Contraseña de la cuenta SMTP (no se retorna en queries por defecto)
    password: {
      type: String,
      select: false, // No incluir en queries por seguridad
      default: ''
    },
    // Nombre del remitente que aparecerá en los emails
    fromName: {
      type: String,
      default: 'MECANET'
    },
    // Email del remitente (por defecto usa businessEmail)
    fromEmail: {
      type: String,
      trim: true,
      default: ''
    }
  },

  // ===== CONFIGURACIÓN FISCAL =====
  // Tasa de impuesto (ITBIS en RD = 18%)
  taxRate: {
    type: Number,
    default: 0, // 0 = sin impuesto, 18 = 18%
    min: 0,
    max: 100
  },

  // Moneda del sistema
  currency: {
    type: String,
    default: 'DOP' // Peso Dominicano
  },

  // ===== CONFIGURACIÓN DE RECIBOS =====
  // Texto que aparece al pie del recibo
  receiptFooter: {
    type: String,
    default: '¡Gracias por su compra!'
  },

  // ===== ALERTAS Y NOTIFICACIONES =====
  // Activar alertas de stock bajo
  lowStockAlert: {
    type: Boolean,
    default: true
  },

  // ===== INTEGRACIÓN DE CLIMA =====
  // Ubicación para obtener clima (formato: Ciudad,País)
  weatherLocation: {
    type: String,
    default: 'Santo Domingo,DO'
  },

  // API Key de OpenWeatherMap (opcional)
  weatherApiKey: {
    type: String,
    select: false,
    default: ''
  },

  // Mostrar widget de clima en dashboard
  showWeather: {
    type: Boolean,
    default: true
  },

  // ===== ÓRDENES AUTOMÁTICAS =====
  // Crear órdenes de compra automáticamente cuando stock es bajo
  autoCreatePurchaseOrders: {
    type: Boolean,
    default: false
  },

  // Requerir proceso formal de recepción de órdenes de compra
  requireOrderReception: {
    type: Boolean,
    default: true
  },

  // Umbral de stock para generar orden automática
  autoOrderThreshold: {
    type: Number,
    default: 5,
    min: 0
  },

  // ===== PREFERENCIAS DE UI =====
  // Posición de las notificaciones toast
  toastPosition: {
    type: String,
    enum: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'],
    default: 'top-center'
  },

  // Fecha de última actualización
  updatedAt: {
    type: Date,
    default: Date.now
  },

  // ===== CONFIGURACIÓN DE LOGS =====
  // Días de retención para cada tipo de log
  logRetention: {
    info: { type: Number, default: 7 },
    warning: { type: Number, default: 30 },
    error: { type: Number, default: 90 },
    critical: { type: Number, default: 180 }
  }
});

/**
 * MÉTODO ESTÁTICO: getInstance
 * 
 * Implementa patrón Singleton: siempre retorna el mismo documento.
 * Si no existe configuración, crea una con valores por defecto.
 * 
 * @returns {Promise<Document>} El único documento de configuración
 * 
 * Uso:
 * const settings = await Settings.getInstance();
 */
settingsSchema.statics.getInstance = async function () {
  // Buscar el documento de settings
  let settings = await this.findOne();

  // Si no existe, crear uno con valores por defecto
  if (!settings) {
    settings = await this.create({});
  }

  return settings;
};

// Crear modelo a partir del esquema
const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
