/**
 * CASHIERSESSION.JS - Modelo de Sesión de Caja (Cierre de Caja)
 * 
 * Registra cierres de caja al final del turno del cajero.
 * Compara totales esperados (del sistema) vs contados (físicos).
 * Detecta faltantes o sobrantes de efectivo.
 * 
 * Flujo:
 * 1. Cajero finaliza turno y va a "Cierre de Caja"
 * 2. Sistema calcula totales esperados de sus ventas
 * 3. Cajero cuenta efectivo físico e ingresa montos
 * 4. Sistema calcula diferencias y guarda sesión
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE SESIÓN DE CAJA
 */
const cashierSessionSchema = new mongoose.Schema({
  // Cajero que realizó el cierre
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Fecha de apertura del turno
  openedAt: {
    type: Date,
    default: Date.now
  },
  
  // Fecha de cierre del turno
  closedAt: {
    type: Date,
    required: true
  },
  
  // ===== TOTALES ESPERADOS (según el sistema) =====
  systemTotals: {
    // Número total de ventas
    totalSales: { type: Number, required: true },
    // Monto total vendido
    totalAmount: { type: Number, required: true },
    // Efectivo esperado
    cash: { type: Number, required: true },
    // Tarjeta esperada
    card: { type: Number, required: true },
    // Transferencias esperadas
    transfer: { type: Number, required: true }
  },
  
  // ===== TOTALES CONTADOS (ingresados por el cajero) =====
  countedTotals: {
    // Efectivo físico contado
    cash: { type: Number, required: true },
    // Tarjeta (debe coincidir con sistema)
    card: { type: Number, required: true },
    // Transferencias (debe coincidir con sistema)
    transfer: { type: Number, required: true }
  },
  
  // ===== DIFERENCIAS (contado - esperado) =====
  // Negativo = faltante, Positivo = sobrante
  differences: {
    cash: { type: Number, required: true },
    card: { type: Number, required: true },
    transfer: { type: Number, required: true },
    total: { type: Number, required: true } // Suma de todas las diferencias
  },
  
  // Notas del cajero sobre el cierre
  notes: {
    type: String,
    default: ''
  },
  
  // Referencias a las ventas incluidas en este cierre
  sales: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale'
  }],
  
  // Total de retiros de efectivo realizados durante la sesión
  totalWithdrawals: {
    type: Number,
    default: 0
  },
  
  // Referencias a los retiros incluidos en este cierre
  withdrawals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CashWithdrawal'
  }]
}, {
  timestamps: true // Agrega createdAt y updatedAt
});

/**
 * ÍNDICES
 * Optimizan consultas frecuentes
 */
// Buscar cierres de un cajero ordenados por fecha
cashierSessionSchema.index({ cashier: 1, closedAt: -1 });
// Listar todos los cierres ordenados por fecha
cashierSessionSchema.index({ closedAt: -1 });

// Crear modelo a partir del esquema
const CashierSession = mongoose.model('CashierSession', cashierSessionSchema);

export default CashierSession;
