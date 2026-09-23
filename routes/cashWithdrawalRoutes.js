/**
 * @file cashWithdrawalRoutes.js
 * @description Rutas para gestión de retiros de caja
 * 
 * Endpoints:
 * - GET /api/cash-withdrawals - Listar retiros (filtros: status, category, startDate, endDate)
 * - POST /api/cash-withdrawals - Crear retiro
 * - GET /api/cash-withdrawals/:id - Obtener retiro por ID
 * - PATCH /api/cash-withdrawals/:id - Actualizar status (aprobar/rechazar)
 * - DELETE /api/cash-withdrawals/:id - Eliminar retiro
 * 
 * Middleware:
 * - protect: Todas las rutas requieren autenticación
 * - Lógica de admin validada en CONTROLADOR (no en ruta)
 * 
 * Lógica por Rol:
 * - Admin: crea con status 'approved' automáticamente, ve todos los retiros
 * - Cajero: crea con status 'pending', solo ve sus propios retiros
 * 
 * Categorías:
 * - Pago a proveedores, Gastos operativos, Retiro personal, Otros
 * 
 * Flujo:
 * 1. Usuario crea retiro (admin -> approved, cajero -> pending)
 * 2. Admin aprueba/rechaza retiros pendientes
 * 3. Retiros aprobados se reflejan en reportes de caja
 */

import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  createCashWithdrawal,
  getCashWithdrawals,
  getCashWithdrawalById,
  updateCashWithdrawalStatus,
  deleteCashWithdrawal
} from '../controllers/cashWithdrawalController.js';

const router = express.Router();

// Rutas públicas (con autenticación)
router.route('/')
  .get(protect, getCashWithdrawals)
  .post(protect, createCashWithdrawal);

router.route('/:id')
  .get(protect, getCashWithdrawalById)
  .patch(protect, updateCashWithdrawalStatus)  // Admin only (validado en controller)
  .delete(protect, deleteCashWithdrawal);       // Admin only (validado en controller)

export default router;
