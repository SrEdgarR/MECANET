/**
 * CUSTOMER.JS - Modelo de Cliente
 * 
 * Almacena información de clientes para:
 * - Facturación con datos fiscales (RNC/Cédula)
 * - Historial de compras
 * - Métricas de clientes frecuentes
 * 
 * Nota: Todos los campos identificadores (cédula, teléfono, email) usan
 * índice 'sparse' para permitir múltiples valores null (clientes anónimos).
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE CLIENTE
 */
const customerSchema = new mongoose.Schema({
  // Nombre completo del cliente
  fullName: {
    type: String,
    required: [true, 'El nombre completo es requerido'],
    trim: true
  },
  
  // Cédula o RNC (República Dominicana)
  cedula: {
    type: String,
    unique: true, // Cada cédula es única
    sparse: true, // Permite múltiples null (clientes sin cédula registrada)
    trim: true
  },
  
  // Teléfono de contacto
  phone: {
    type: String,
    unique: true,
    sparse: true, // Permite múltiples null
    trim: true
  },
  
  // Email del cliente
  email: {
    type: String,
    unique: true,
    sparse: true, // Permite múltiples null
    lowercase: true, // Convierte a minúsculas automáticamente
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Por favor ingrese un email válido']
  },
  
  // Dirección física
  address: {
    type: String,
    trim: true
  },
  // Historial de compras (referencias a ventas)
  purchaseHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale' // Referencias al modelo Sale
  }],
  
  // Total acumulado de compras (en monto)
  totalPurchases: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Indica si el cliente está archivado (soft delete)
  isArchived: {
    type: Boolean,
    default: false
  },
  
  // Fecha de registro del cliente
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
customerSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Crear modelo a partir del esquema
const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
