/**
 * @file saleRoutes.js
 * @description Rutas para gestión de ventas y cierre de caja
 * 
 * Endpoints:
 * - GET /api/sales - Listar ventas (con filtros: startDate, endDate, status, paymentMethod)
 * - POST /api/sales - Crear nueva venta (actualiza stock automáticamente)
 * - GET /api/sales/user/me - Mis ventas (cajero solo ve las suyas)
 * - POST /api/sales/close-register - Cerrar caja del cajero actual
 * - GET /api/sales/:id - Obtener venta por ID
 * - PUT /api/sales/:id/cancel - Cancelar venta (solo admin, devuelve stock)
 * 
 * Middleware:
 * - protect: Todas las rutas requieren autenticación
 * - admin: Solo /cancel requiere rol de admin
 * - saleValidation: Valida campos requeridos (customer, items, paymentMethod, total)
 * 
 * Importante:
 * - createSale actualiza stock de productos automáticamente
 * - cancelSale devuelve stock (solo admin puede cancelar)
 * - closeCashRegister crea registro de CashierSession
 */

import express from 'express';
import {
  createSale,
  getSales,
  getSaleById,
  getMySales,
  cancelSale,
  closeCashRegister
} from '../controllers/saleController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { saleValidation, validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getSales)
  .post(protect, saleValidation, validate, createSale);

router.get('/user/me', protect, getMySales);
router.post('/close-register', protect, closeCashRegister);

router.route('/:id')
  .get(protect, getSaleById);

router.put('/:id/cancel', protect, admin, cancelSale);

export default router;
