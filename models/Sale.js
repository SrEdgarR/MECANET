/**
 * SALE.JS - Modelo de Venta
 * 
 * Registra todas las ventas realizadas en el sistema POS.
 * Incluye items vendidos, totales, método de pago y relación con usuario/cliente.
 * 
 * Características:
 * - Auto-generación de números de factura únicos
 * - Almacena precio al momento de la venta (priceAtSale)
 * - Permite aplicar descuentos por item y totales
 * - Relación con usuario que realizó la venta (cajero)
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE VENTA
 * Representa una transacción de venta completa
 */
const saleSchema = new mongoose.Schema({
  returnRevision: { type: Number, default: 0 },
  // Número único de factura (formato: INV241006XXXX)
  invoiceNumber: {
    type: String,
    required: true,
    unique: true // Índice único en MongoDB
  },
  
  // Usuario (cajero) que procesó la venta
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Referencia al modelo User
    required: true
  },
  
  // Cliente asociado a la venta (opcional)
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer', // Referencia al modelo Customer
    default: null // null = cliente genérico/anónimo
  },
  
  // Array de productos vendidos
  items: [{
    // Producto vendido
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    // Cantidad vendida
    quantity: {
      type: Number,
      required: true,
      min: 1 // Mínimo 1 unidad
    },
    // Precio unitario al momento de la venta (importante: puede cambiar después)
    priceAtSale: {
      type: Number,
      required: true,
      min: 0
    },
    // Precio de compra/costo al momento de la venta (para calcular beneficio)
    purchasePriceAtSale: {
      type: Number,
      default: 0,
      min: 0
    },
    // Descuento aplicado a este item (porcentaje o monto)
    discountApplied: {
      type: Number,
      default: 0,
      min: 0
    },
    // Subtotal del item (cantidad × precio - descuento)
    subtotal: {
      type: Number,
      required: true
    }
  }],
  
  // Subtotal de todos los items (antes de descuentos globales)
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Descuento total aplicado a la venta
  totalDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Total final a pagar (subtotal - descuentos)
  total: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Método de pago utilizado
  paymentMethod: {
    type: String,
    enum: ['Efectivo', 'Tarjeta', 'Transferencia'], // Solo estos valores permitidos
    required: true
  },
  
  // Estado de la venta
  status: {
    type: String,
    enum: ['Completada', 'Cancelada', 'Devuelta'],
    default: 'Completada' // Nueva venta siempre empieza como Completada
  },
  
  // Notas adicionales sobre la venta
  notes: {
    type: String,
    trim: true
  },
  
  // Fecha de creación de la venta
  createdAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * MÉTODO ESTÁTICO: generateInvoiceNumber
 * 
 * Genera un número único de factura con formato:
 * INV + YY + MM + DD + XXXX
 * 
 * Ejemplo: INV241006-0001, INV241006-0002
 * 
 * La secuencia XXXX se reinicia cada día y es auto-incremental.
 * 
 * @returns {Promise<string>} Número de factura único
 * 
 * Uso:
 * const invoiceNumber = await Sale.generateInvoiceNumber();
 */
saleSchema.statics.generateInvoiceNumber = async function() {
  const date = new Date();
  
  // Obtener componentes de la fecha
  const year = date.getFullYear().toString().slice(-2); // Últimos 2 dígitos (24)
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // 01-12
  const day = date.getDate().toString().padStart(2, '0'); // 01-31
  
  // Crear prefijo: INV241006
  const prefix = `INV${year}${month}${day}`;
  
  // Buscar la última venta del día
  const lastSale = await this.findOne({
    invoiceNumber: new RegExp(`^${prefix}`) // Buscar por prefijo usando regex
  }).sort({ createdAt: -1 }); // Ordenar descendente para obtener la última
  
  // Calcular siguiente secuencia
  let sequence = 1;
  if (lastSale) {
    // Extraer los últimos 4 dígitos del número anterior
    const lastSequence = parseInt(lastSale.invoiceNumber.slice(-4));
    sequence = lastSequence + 1;
  }
  
  // Formatear secuencia con 4 dígitos (0001, 0002, etc)
  return `${prefix}${sequence.toString().padStart(4, '0')}`;
};

// Crear modelo a partir del esquema
const Sale = mongoose.model('Sale', saleSchema);

export default Sale;
