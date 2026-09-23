/**
 * @file authRoutes.js
 * @description Rutas de autenticación y gestión de perfil de usuario
 * 
 * Endpoints:
 * - POST /api/auth/login - Autenticar usuario (público)
 * - GET /api/auth/profile - Obtener perfil actual (requiere token)
 * - PUT /api/auth/profile - Actualizar perfil actual (requiere token)
 * 
 * Middleware:
 * - protect: Verifica JWT token, usado en /profile y /profile PUT
 * 
 * Notas:
 * - /login es la ÚNICA ruta pública (no requiere token)
 * - Retorna token JWT válido por 30 días en login exitoso
 */

import express from 'express';
import { login, getProfile, updateProfile } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

import { userUpdateValidation, validate } from '../middleware/validationMiddleware.js';

const router = express.Router();

router.post('/login', login);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, userUpdateValidation, validate, updateProfile);

export default router;
