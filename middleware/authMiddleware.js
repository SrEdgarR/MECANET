/**
 * AUTHMIDDLEWARE.JS - Middleware de autenticación y autorización
 * 
 * Este archivo contiene funciones middleware que:
 * 1. Verifican tokens JWT en peticiones protegidas
 * 2. Verifican roles de usuario (admin vs cajero)
 * 3. Generan tokens JWT para login
 * 
 * Variables requeridas en .env:
 * - JWT_SECRET: Clave secreta para firmar/verificar tokens
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * PROTECT - Middleware para proteger rutas
 * 
 * Verifica que la petición incluya un token JWT válido en el header Authorization.
 * Si el token es válido, adjunta el usuario a req.user y permite continuar.
 * Si no, devuelve error 401 (No autorizado).
 * 
 * Uso: Se aplica a rutas que requieren usuario autenticado
 * Ejemplo: router.get('/productos', protect, getProductos)
 */
export const protect = async (req, res, next) => {
  let token;

  // Verificar si hay header Authorization con formato "Bearer <token>"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extraer el token (después de "Bearer ")
      token = req.headers.authorization.split(' ')[1];

      // Verificar y decodificar el token usando la clave secreta
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'], issuer: 'mecanet', audience: 'mecanet-api'
      });

      // Buscar el usuario en la BD usando el ID del token
      // .select('-password') excluye el campo password del resultado
      req.user = await User.findById(decoded.id).select('-password');

      // Si el usuario no existe en la BD
      if (!req.user) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
      }

      // Si el usuario está inactivo (campo isActive = false)
      if (!req.user.isActive) {
        return res.status(401).json({ message: 'Usuario inactivo' });
      }
      if (decoded.version !== (req.user.tokenVersion || 0)) {
        return res.status(401).json({ message: 'Sesión revocada. Inicie sesión nuevamente.' });
      }

      // Todo correcto, pasar al siguiente middleware/controlador
      next();
    } catch (error) {
      console.error('Error en autenticación:', error);
      // Token inválido, expirado o manipulado
      return res.status(401).json({ message: 'No autorizado, token inválido' });
    }
  }

  // Si no se proporcionó token
  if (!token) {
    return res.status(401).json({ message: 'No autorizado, no se proporcionó token' });
  }
};

/**
 * ADMIN - Middleware para verificar rol de administrador
 * 
 * Se usa DESPUÉS de protect, verifica que req.user.role === 'admin'
 * Si no es admin, devuelve error 403 (Forbidden)
 * 
 * Uso: router.delete('/usuarios/:id', protect, admin, deleteUsuario)
 */
export const admin = (req, res, next) => {
  const privilegedRoles = ['admin', 'desarrollador'];
  if (req.user && privilegedRoles.includes(req.user.role)) {
    next(); // Es admin, permitir acceso
  } else {
    // No es admin o no hay usuario
    res.status(403).json({ message: 'Acceso denegado. Se requiere rol autorizado' });
  }
};

/**
 * GENERATETOKEN - Función auxiliar para generar tokens JWT
 * 
 * @param {string} id - ID del usuario de MongoDB
 * @returns {string} Token JWT firmado que expira en 30 días
 * 
 * El token contiene solo el ID del usuario como payload.
 * Se usa en login y registro para devolver el token al cliente.
 */
export const generateToken = (user) => {
  return jwt.sign({ id: user._id, version: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d',
    algorithm: 'HS256', issuer: 'mecanet', audience: 'mecanet-api'
  });
};
