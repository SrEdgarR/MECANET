/**
 * SUPPLIER.JS - Modelo de Proveedor
 * 
 * Gestiona información de proveedores de productos.
 * Permite registrar términos de pago y datos fiscales.
 * 
 * Relación: Un proveedor puede tener muchos productos
 * (ver campo 'supplier' en modelo Product)
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE PROVEEDOR
 */
const supplierSchema = new mongoose.Schema({
  // Nombre o razón social del proveedor
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Nombre de la persona de contacto
  contactName: {
    type: String,
    trim: true,
  },
  
  // Email de contacto
  email: {
    type: String,
    trim: true,
    lowercase: true, // Convierte a minúsculas
  },
  
  // Teléfono de contacto
  phone: {
    type: String,
    trim: true,
  },
  
  // Dirección física del proveedor
  address: {
    type: String,
    trim: true,
  },
  
  // RNC (Registro Nacional de Contribuyentes - República Dominicana)
  rnc: {
    type: String,
    trim: true,
    unique: true, // RNC único
    sparse: true, // Permite múltiples null
  },
  
  // Términos de pago acordados con el proveedor
  paymentTerms: {
    type: String,
    enum: ['Contado', '15 días', '30 días', '45 días', '60 días', '90 días'],
    default: 'Contado', // Por defecto, pago inmediato
  },
  
  // Notas adicionales sobre el proveedor
  notes: {
    type: String,
  },
  
  // Estado activo/inactivo (para desactivar sin eliminar)
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Indica si el proveedor está archivado (soft delete)
  // Diferente de isActive: isActive = deshabilitado temporalmente, isArchived = eliminado lógicamente
  isArchived: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
});

// Crear modelo a partir del esquema
const Supplier = mongoose.model('Supplier', supplierSchema);

export default Supplier;
