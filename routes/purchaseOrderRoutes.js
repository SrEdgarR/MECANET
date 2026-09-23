/**
 * @file purchaseOrderRoutes.js
 * @description Rutas para gestión de órdenes de compra
 * 
 * Endpoints:
 * - GET /api/purchase-orders - Listar órdenes
 * - GET /api/purchase-orders/:id - Obtener orden por ID
 * - POST /api/purchase-orders - Crear orden manual
 * - POST /api/purchase-orders/generate-auto - Crear órdenes automáticas (solo admin)
 * - PUT /api/purchase-orders/:id - Actualizar orden (solo admin)
 * - PUT /api/purchase-orders/:id/status - Cambiar status de orden (solo admin)
 * - DELETE /api/purchase-orders/:id - Eliminar orden (solo admin)
 * 
 * Middleware:
 * - protect: Aplicado a TODAS las rutas con router.use(protect)
 * - admin: Solo /generate-auto, PUT, DELETE requieren admin
 * 
 * Importante:
 * - /generate-auto crea órdenes basadas en productos con stock bajo
 * - Cambiar status a 'Recibida' actualiza stock de productos automáticamente
 * - Números auto-generados: PO-000001, PO-000002, etc.
 * - Status: Pendiente, Confirmada, Recibida, Cancelada
 */

import express from 'express';
import {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  generateAutoOrder,
  updatePurchaseOrder,
  updateOrderStatus,
  sendPurchaseOrder,
  deletePurchaseOrder,
} from '../controllers/purchaseOrderController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getPurchaseOrders);
router.get('/:id', getPurchaseOrderById);
router.post('/', createPurchaseOrder);
router.post('/generate-auto', admin, generateAutoOrder);
router.post('/:id/send', sendPurchaseOrder); // Nueva ruta para enviar por email
router.put('/:id', admin, updatePurchaseOrder);
router.put('/:id/status', admin, updateOrderStatus);
router.delete('/:id', admin, deletePurchaseOrder);

export default router;
