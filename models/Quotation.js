/**
 * QUOTATION.JS - Modelo de Cotización
 * 
 * Gestiona cotizaciones (presupuestos) que pueden convertirse en ventas.
 * 
 * Flujo:
 * 1. Se crea cotización (status: Pendiente)
 * 2. Se envía al cliente por email/PDF
 * 3. Cliente aprueba o rechaza
 * 4. Si aprueba: se convierte en venta (status: Convertida)
 * 5. Si rechaza o vence: status → Rechazada/Vencida
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE COTIZACIÓN
 */
const quotationSchema = new mongoose.Schema({
  // Número único de cotización (formato: COT-000001, COT-000002, etc)
  quotationNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  
  // Cliente para quien se hace la cotización
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null,
  },

  // Datos de cliente genérico (si no existe en la base)
  genericCustomerName: {
    type: String,
    trim: true,
  },
  genericCustomerContact: {
    type: String,
    trim: true,
  },
  
  // Items incluidos en la cotización
  items: [{
    // Producto cotizado
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Cantidad cotizada
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // Precio unitario al momento de la cotización
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // Descuento aplicado al item (porcentaje)
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Subtotal del item (cantidad × precio - descuento)
    subtotal: {
      type: Number,
      required: true,
    },
  }],
  
  // Subtotal de todos los items
  subtotal: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Impuesto aplicado (ITBIS 18%)
  tax: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Total final (subtotal + tax)
  total: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Estado de la cotización
  status: {
    type: String,
    enum: ['Pendiente', 'Aprobada', 'Rechazada', 'Convertida', 'Vencida'],
    default: 'Pendiente',
  },
  
  // Fecha de vencimiento de la cotización
  validUntil: {
    type: Date,
    required: true,
  },
  
  // Notas internas (no visibles para el cliente)
  notes: {
    type: String,
    trim: true,
  },
  
  // Términos y condiciones (visibles en PDF)
  terms: {
    type: String,
    trim: true,
    default: 'Cotización válida por el período especificado. Precios sujetos a cambio sin previo aviso. No incluye instalación a menos que se especifique.',
  },
  
  // Usuario que creó la cotización
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Usuario que aprobó/rechazó la cotización
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Venta generada a partir de esta cotización (si fue convertida)
  convertedToSale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
  },
  
  // Fecha en que se convirtió a venta
  convertedDate: {
    type: Date,
  },
  
  // Flag para saber si se envió por email
  emailSent: {
    type: Boolean,
    default: false,
  },
  
  // Fecha en que se envió el email
  emailSentDate: {
    type: Date,
  },
}, {
  optimisticConcurrency: true,
  timestamps: true, // Agrega createdAt y updatedAt
});

/**
 * MIDDLEWARE PRE-VALIDATE
 * Genera número de cotización automático si es un documento nuevo
 * Formato: COT-000001, COT-000002, etc
 */
quotationSchema.pre('validate', async function(next) {
  if (this.isNew && !this.quotationNumber) {
    try {
      // Contar cotizaciones existentes
      const count = await this.constructor.countDocuments();
      // Generar número con padding de 6 dígitos
      this.quotationNumber = `COT-${String(count + 1).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generando quotationNumber:', error);
      // Fallback: usar timestamp
      this.quotationNumber = `COT-${String(Date.now()).slice(-6)}`;
    }
  }
  next();
});

/**
 * ÍNDICES
 * Mejoran el rendimiento de búsquedas frecuentes
 */
quotationSchema.index({ customer: 1 }); // Cotizaciones por cliente
quotationSchema.index({ genericCustomerName: 1 }); // Buscar por nombre genérico
quotationSchema.index({ status: 1 }); // Filtrar por estado
quotationSchema.index({ createdAt: -1 }); // Ordenar por fecha
quotationSchema.index({ validUntil: 1 }); // Para job cron de vencimientos

// Crear modelo a partir del esquema
const Quotation = mongoose.model('Quotation', quotationSchema);

export default Quotation;
