/**
 * @file returnRoutes.js
 * @description Rutas para gestión de devoluciones de productos
 * 
 * Endpoints:
 * - GET /api/returns - Listar devoluciones (con filtros: startDate, endDate, status)
 * - GET /api/returns/stats - Estadísticas de devoluciones (parámetros: startDate, endDate)
 * - GET /api/returns/:id - Obtener devolución por ID
 * - POST /api/returns - Crear devolución (cajero puede crear)
 * - PUT /api/returns/:id/approve - Aprobar devolución (solo admin)
 * - PUT /api/returns/:id/reject - Rechazar devolución (solo admin)
 * 
 * Middleware:
 * - protect: Todas las rutas requieren autenticación
 * - admin: Solo /approve y /reject requieren rol de admin
 * 
 * Flujo de Aprobación:
 * 1. Cajero crea devolución (status: Pendiente)
 * 2. Admin revisa y aprueba/rechaza
 * 3. Si aprueba: devuelve stock + procesa reembolso
 * 4. Si rechaza: no pasa nada
 * 
 * Razones de Devolución:
 * - Producto defectuoso, Producto equivocado, Cliente insatisfecho, Otra
 * 
 * Métodos de Reembolso:
 * - Efectivo, Tarjeta, Crédito a cuenta
 */

import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  getReturns,
  getReturnById,
  createReturn,
  approveReturn,
  rejectReturn,
  getReturnStats,
} from '../controllers/returnController.js';

const router = express.Router();

// Rutas públicas (requieren autenticación)
router.get('/', protect, getReturns);
router.get('/stats', protect, getReturnStats);
router.get('/:id', protect, getReturnById);
router.post('/', protect, createReturn);

// Rutas que requieren permiso de administrador
router.put('/:id/approve', protect, admin, approveReturn);
router.put('/:id/reject', protect, admin, rejectReturn);

export default router;
