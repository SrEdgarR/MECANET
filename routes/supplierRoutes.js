/**
 * @file supplierRoutes.js
 * @description Rutas para gestión de proveedores
 * 
 * Endpoints:
 * - GET /api/suppliers - Listar proveedores
 * - GET /api/suppliers/:id - Obtener proveedor por ID
 * - POST /api/suppliers - Crear proveedor (solo admin)
 * - PUT /api/suppliers/:id - Actualizar proveedor (solo admin)
 * - DELETE /api/suppliers/:id - Eliminar proveedor (solo admin)
 * 
 * Middleware:
 * - protect: Aplicado a TODAS las rutas con router.use(protect)
 * - admin: Solo operaciones de escritura (POST, PUT, DELETE)
 * 
 * Notas:
 * - RNC debe ser único si se proporciona
 * - isActive permite soft-delete (marca como inactivo)
 * - paymentTerms: Contado, 15 días, 30 días, 45 días, 60 días
 */

import express from 'express';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../controllers/supplierController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getSuppliers);
router.get('/:id', getSupplierById);
router.post('/', admin, createSupplier);
router.put('/:id', admin, updateSupplier);
router.delete('/:id', admin, deleteSupplier);

export default router;
