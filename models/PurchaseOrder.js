/**
 * PURCHASEORDER.JS - Modelo de Orden de Compra
 * 
 * Gestiona órdenes de compra a proveedores para reabastecer inventario.
 * 
 * Flujo:
 * 1. Se crea orden (status: Pendiente)
 * 2. Se envía al proveedor (status: Enviada)
 * 3. Se recibe mercancía (status: Recibida) → actualiza stock de productos
 * 4. O se cancela (status: Cancelada)
 * 
 * Puede generarse automáticamente cuando productos tienen stock bajo.
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE ORDEN DE COMPRA
 */
const purchaseOrderSchema = new mongoose.Schema({
  // Número único de orden (formato: PO-000001, PO-000002, etc)
  orderNumber: {
    type: String,
    unique: true,
    sparse: true, // Permite null temporalmente
  },
  
  // Proveedor al que se hace el pedido (opcional - puede ser proveedor genérico)
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: false,
  },
  
  // Nombre del proveedor genérico (si no se selecciona uno del catálogo)
  genericSupplierName: {
    type: String,
    trim: true,
  },
  // Items incluidos en la orden
  items: [{
    // Producto a ordenar
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Cantidad a ordenar
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // Precio unitario de compra (opcional - el proveedor puede definirlo después)
    unitPrice: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
    },
    // Subtotal del item (cantidad × precio)
    subtotal: {
      type: Number,
      required: false,
      default: 0,
    },
  }],
  
  // Subtotal de todos los items (opcional)
  subtotal: {
    type: Number,
    required: false,
    default: 0,
  },
  
  // Impuesto aplicado (opcional)
  tax: {
    type: Number,
    required: false,
    default: 0,
  },
  
  // Total a pagar (subtotal + tax) - opcional si aún no se definen precios
  total: {
    type: Number,
    required: false,
    default: 0,
  },
  
  // Estado de la orden
  status: {
    type: String,
    enum: ['Pendiente', 'Enviada', 'Recibida Parcial', 'Recibida', 'Cancelada'],
    default: 'Pendiente',
  },
  
  // Fecha en que se creó la orden
  orderDate: {
    type: Date,
    default: Date.now,
  },
  
  // Fecha estimada de entrega
  expectedDeliveryDate: {
    type: Date,
  },
  
  // Fecha real de recepción
  receivedDate: {
    type: Date,
  },
  
  // Notas sobre la orden
  notes: {
    type: String,
  },
  
  // Notas al recibir la mercancía
  receiveNotes: {
    type: String,
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
  
  // Usuario que creó la orden
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true, // Agrega createdAt y updatedAt
});

/**
 * MIDDLEWARE PRE-VALIDATE
 * Genera número de orden automático si es un documento nuevo
 * Formato: PO-000001, PO-000002, etc
 */
purchaseOrderSchema.pre('validate', async function(next) {
  if (this.isNew && !this.orderNumber) {
    try {
      // Contar órdenes existentes
      const count = await this.constructor.countDocuments();
      // Generar número con padding de 6 dígitos
      this.orderNumber = `PO-${String(count + 1).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generando orderNumber:', error);
      // Fallback: usar timestamp
      this.orderNumber = `PO-${String(Date.now()).slice(-6)}`;
    }
  }
  next();
});

// Crear modelo a partir del esquema
const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

export default PurchaseOrder;
