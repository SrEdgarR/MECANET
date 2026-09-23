/**
 * CASHWITHDRAWAL.JS - Modelo de Retiro de Caja
 * 
 * Registra retiros de efectivo de la caja con sistema de aprobación.
 * Incluye generación automática de números de retiro y control por roles.
 * 
 * Flujo:
 * 1. Cajero crea retiro (status: pending)
 * 2. Admin aprueba o rechaza
 * 3. Si es aprobado, authorizedBy se llena automáticamente
 */

import mongoose from 'mongoose';

/**
 * ESQUEMA DE RETIRO DE CAJA
 */
const cashWithdrawalSchema = new mongoose.Schema({
  // Número único de retiro (formato: RET-YYYYMMDD-XXX)
  withdrawalNumber: {
    type: String,
    required: true,
    unique: true // Índice único en MongoDB
  },
  
  // Monto del retiro en pesos dominicanos
  amount: {
    type: Number,
    required: [true, 'El monto es requerido'],
    min: [0, 'El monto debe ser mayor a 0']
  },
  
  // Razón o motivo del retiro
  reason: {
    type: String,
    required: [true, 'La razón del retiro es requerida'],
    trim: true
  },
  
  // Categoría del retiro para clasificación
  category: {
    type: String,
    enum: ['personal', 'business', 'supplier', 'other'],
    default: 'other'
  },
  
  // Usuario que realizó el retiro (referencia a User)
  withdrawnBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Popular con .populate('withdrawnBy')
    required: true
  },
  
  // Usuario que autorizó el retiro (solo admins)
  authorizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Se llena cuando status cambia a 'approved'
  },
  
  // Fecha del retiro
  withdrawalDate: {
    type: Date,
    default: Date.now
  },
  
  // Estado del retiro (flujo de aprobación)
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending' // Cajeros crean en pending, admins aprueban/rechazan
  },
  
  // Indica si se adjuntó recibo/comprobante
  receiptAttached: {
    type: Boolean,
    default: false
  },
  
  // Notas adicionales u observaciones
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true // Agrega createdAt y updatedAt automáticamente
});

/**
 * MÉTODO ESTÁTICO: generateWithdrawalNumber
 * 
 * Genera un número único de retiro con formato:
 * RET-YYYYMMDD-XXX
 * 
 * Ejemplo: RET-20251006-001, RET-20251006-002
 * 
 * La secuencia XXX se reinicia cada día y es auto-incremental.
 * 
 * @returns {Promise<string>} Número de retiro generado
 */
cashWithdrawalSchema.statics.generateWithdrawalNumber = async function() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // 01-12
  const day = String(today.getDate()).padStart(2, '0'); // 01-31
  const datePrefix = `${year}${month}${day}`; // YYYYMMDD

  // Buscar el último retiro del día actual
  const lastWithdrawal = await this.findOne({
    withdrawalNumber: new RegExp(`^RET-${datePrefix}`) // Regex para buscar por fecha
  }).sort({ withdrawalNumber: -1 }); // Ordenar descendente para obtener el último

  // Calcular siguiente secuencia
  let sequence = 1;
  if (lastWithdrawal) {
    // Extraer el número de secuencia del último retiro
    const lastSequence = parseInt(lastWithdrawal.withdrawalNumber.split('-').pop());
    sequence = lastSequence + 1;
  }

  // Formatear secuencia con 3 dígitos (001, 002, etc)
  return `RET-${datePrefix}-${String(sequence).padStart(3, '0')}`;
};

// Crear modelo a partir del esquema
const CashWithdrawal = mongoose.model('CashWithdrawal', cashWithdrawalSchema);

export default CashWithdrawal;
