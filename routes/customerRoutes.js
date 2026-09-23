/**
 * @file customerRoutes.js
 * @description Rutas para gestión de clientes
 * 
 * Endpoints:
 * - GET /api/customers - Listar clientes (con filtro search: nombre, cédula, teléfono)
 * - POST /api/customers - Crear cliente
 * - GET /api/customers/:id - Obtener cliente por ID
 * - GET /api/customers/:id/purchases - Historial de compras del cliente
 * - PUT /api/customers/:id - Actualizar cliente
 * - DELETE /api/customers/:id - Eliminar cliente (solo admin)
 * 
 * Middleware:
 * - protect: Todas las rutas requieren autenticación
 * - admin: Solo DELETE requiere rol de admin
 * - customerValidation: Valida campos requeridos (name, identificationType, identificationNumber)
 * 
 * Query Params:
 * - GET /: search (busca en name, identificationNumber, phone)
 */

import express from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerPurchases
} from '../controllers/customerController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { customerValidation, validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getCustomers)
  .post(protect, customerValidation, validate, createCustomer);

router.route('/:id')
  .get(protect, getCustomerById)
  .put(protect, updateCustomer)
  .delete(protect, admin, deleteCustomer);

router.get('/:id/purchases', protect, getCustomerPurchases);

export default router;
