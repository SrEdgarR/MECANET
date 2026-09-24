/**
 * @file userRoutes.js
 * @description Rutas para gestión de usuarios del sistema
 * 
 * Endpoints:
 * - GET /api/users - Listar usuarios
 * - POST /api/users - Crear nuevo usuario
 * - GET /api/users/:id - Obtener usuario por ID
 * - PUT /api/users/:id - Actualizar usuario
 * - DELETE /api/users/:id - Eliminar usuario
 * 
 * Middleware:
 * - protect: Todas las rutas requieren autenticación
 * - admin: TODAS las rutas requieren rol de admin (gestión exclusiva de admin)
 * - userValidation: Valida campos requeridos (name, email, password, role)
 * 
 * Importante:
 * - Solo administradores pueden acceder a estas rutas
 * - Password se hashea automáticamente en creación/actualización (pre-save hook)
 * - role debe ser 'admin' o 'cajero'
 */

import express from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireSection } from '../middleware/sectionAccessMiddleware.js';
import { userValidation, userUpdateValidation, validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, requireSection('usuarios'), getUsers)
  .post(protect, requireSection('usuarios'), userValidation, validate, createUser);

router.route('/:id')
  .get(protect, requireSection('usuarios'), getUserById)
  .put(protect, requireSection('usuarios'), userUpdateValidation, validate, updateUser)
  .delete(protect, requireSection('usuarios'), deleteUser);

export default router;
