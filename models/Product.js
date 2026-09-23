/**
 * PRODUCT.JS - Modelo de Producto
 * 
 * Define el esquema de productos en el inventario.
 * Incluye precios, stock, relación con proveedores y cálculos automáticos.
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE PRODUCTO
 * Representa un artículo en el inventario de autopartes
 */
const productSchema = new mongoose.Schema({
  // SKU: Código único del producto (Stock Keeping Unit)
  sku: {
    type: String,
    required: [true, 'El SKU es requerido'],
    unique: true, // Índice único en MongoDB
    uppercase: true, // Convierte a mayúsculas automáticamente
    trim: true
  },

  // Nombre del producto
  name: {
    type: String,
    required: [true, 'El nombre del producto es requerido'],
    trim: true
  },

  // Descripción detallada (opcional)
  description: {
    type: String,
    trim: true
  },

  // Garantía del producto
  warranty: {
    type: String,
    trim: true,
    default: ''
  },

  // Marca del producto (ej: Bosch, Denso, etc)
  brand: {
    type: String,
    trim: true
  },

  // Categoría (ej: Frenos, Motor, Eléctrico)
  category: {
    type: String,
    trim: true
  },

  // Precio de compra al proveedor
  purchasePrice: {
    type: Number,
    required: [true, 'El precio de compra es requerido'],
    min: 0 // No puede ser negativo
  },

  // Precio de venta al cliente
  sellingPrice: {
    type: Number,
    required: [true, 'El precio de venta es requerido'],
    min: 0
  },

  // Cantidad disponible en inventario
  stock: {
    type: Number,
    required: true,
    default: 0,
    min: 0 // No puede ser negativo
  },

  // Cantidad de productos defectuosos (no disponibles para venta)
  defectiveStock: {
    type: Number,
    default: 0,
    min: 0
  },

  // Umbral de stock bajo (para alertas)
  lowStockThreshold: {
    type: Number,
    default: 5, // Si stock <= 5, mostrar alerta
    min: 0
  },

  // Porcentaje de descuento (0-100)
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100 // Máximo 100%
  },

  // Contador de unidades vendidas (se actualiza con cada venta)
  soldCount: {
    type: Number,
    default: 0,
    min: 0
  },

  // Relación con proveedor (referencia a modelo Supplier)
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier', // Nombre del modelo referenciado
  },

  // SKU del producto en el catálogo del proveedor
  supplierSKU: {
    type: String,
    trim: true,
  },

  // URL de la imagen del producto
  imageUrl: {
    type: String,
    default: '/placeholder-product.png' // Imagen por defecto
  },

  // Indica si el producto está archivado (soft delete)
  isArchived: {
    type: Boolean,
    default: false
  },

  // Fecha de creación
  createdAt: {
    type: Date,
    default: Date.now
  },

  // Fecha de última actualización
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * MIDDLEWARE PRE-UPDATE
 * Actualiza automáticamente el campo updatedAt antes de cada actualización
 */
productSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

/**
 * VIRTUAL: profitMargin
 * Calcula el margen de ganancia porcentual
 * (precio venta - precio compra) / precio compra * 100
 * 
 * No se guarda en la BD, se calcula cuando se accede
 */
productSchema.virtual('profitMargin').get(function () {
  return ((this.sellingPrice - this.purchasePrice) / this.purchasePrice * 100).toFixed(2);
});

/**
 * VIRTUAL: isLowStock
 * Determina si el producto tiene stock bajo
 * Retorna true si stock <= lowStockThreshold
 */
productSchema.virtual('isLowStock').get(function () {
  return this.stock <= this.lowStockThreshold;
});

// Crear modelo a partir del esquema
const Product = mongoose.model('Product', productSchema);

export default Product;
