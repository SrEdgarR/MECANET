/**
 * PRODUCTROUTES.JS - Rutas de Productos
 * 
 * Define todos los endpoints relacionados con el inventario de productos.
 * 
 * Middleware aplicado:
 * - protect: Todas las rutas requieren autenticación
 * - admin: Crear, actualizar y eliminar solo para administradores
 * - productValidation: Valida campos en creación
 * 
 * Endpoints:
 * - GET    /api/products                    - Listar productos (con filtros)
 * - POST   /api/products                    - Crear producto (admin)
 * - GET    /api/products/categories/list    - Listar categorías únicas
 * - GET    /api/products/brands/list        - Listar marcas únicas
 * - GET    /api/products/sku/:sku           - Buscar por SKU (facturación rápida)
 * - GET    /api/products/:id                - Obtener producto por ID
 * - PUT    /api/products/:id                - Actualizar producto (admin)
 * - DELETE /api/products/:id                - Eliminar producto (admin)
 */

import express from 'express';
import {
  getProducts,
  getProductById,
  getProductBySku,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  getBrands
} from '../controllers/productController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { productValidation, validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getProducts)
  .post(protect, admin, productValidation, validate, createProduct);

router.get('/categories/list', protect, getCategories);
router.get('/brands/list', protect, getBrands);
router.get('/sku/:sku', protect, getProductBySku);

router.route('/:id')
  .get(protect, getProductById)
  .put(protect, admin, updateProduct)
  .delete(protect, admin, deleteProduct);

export default router;
