/**
 * @file validationMiddleware.js
 * @description Middleware de validación de datos usando express-validator
 * 
 * Exports:
 * - validate: Middleware que verifica errores de validación
 * - productValidation: Reglas de validación para productos
 * - userValidation: Reglas de validación para usuarios
 * - customerValidation: Reglas de validación para clientes
 * - saleValidation: Reglas de validación para ventas
 * 
 * Uso:
 * router.post('/', protect, productValidation, validate, createProduct);
 * 
 * Primero se ejecutan las reglas (productValidation), luego validate verifica errores.
 */

import { body, param, query, validationResult } from 'express-validator';

/**
 * Middleware para verificar errores de validación
 * @description Verifica si hay errores de express-validator y retorna 400 si los hay
 * @returns {Object} JSON con errores de validación si los hay
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      message: 'Errores de validación',
      errors: errors.array().map(({ value, ...error }) => error)
    });
  }
  
  next();
};

// Validaciones para productos
export const productValidation = [
  body('sku').trim().notEmpty().withMessage('El SKU es requerido'),
  body('name').trim().notEmpty().withMessage('El nombre es requerido'),
  body('purchasePrice').isFloat({ min: 0 }).withMessage('El precio de compra debe ser mayor o igual a 0'),
  body('sellingPrice').isFloat({ min: 0 }).withMessage('El precio de venta debe ser mayor o igual a 0'),
  body('stock').isInt({ min: 0 }).withMessage('El stock debe ser mayor o igual a 0')
];

// Validaciones para usuarios
export const userValidation = [
  body('name').trim().notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isString().bail().isLength({ min: 12 }).withMessage('La contraseña debe tener al menos 12 caracteres')
    .custom(value => Buffer.byteLength(value, 'utf8') <= 72).withMessage('La contraseña supera 72 bytes'),
  body('role').isIn(['admin', 'desarrollador', 'cajero']).withMessage('Rol inválido')
];

export const userUpdateValidation = [
  body('name').optional().isString().bail().trim().notEmpty(),
  body('email').optional().isString().bail().isEmail(),
  body('password').optional().isString().bail().isLength({ min: 12 })
    .custom(value => Buffer.byteLength(value, 'utf8') <= 72),
  body('role').optional().isIn(['admin', 'desarrollador', 'cajero']),
  body('isActive').optional().isBoolean({ strict: true }),
  body('shortcutsEnabled').optional().isBoolean({ strict: true })
];

// Los operadores de MongoDB y las claves de prototipo nunca son datos de formularios.
export const rejectUnsafeKeys = (req, res, next) => {
  const safe = (value, depth = 0) => {
    if (depth > 30) return false;
    if (!value || typeof value !== 'object') return true;
    return Object.entries(value).every(([key, item]) =>
      !key.startsWith('$') && !key.includes('.') &&
      !['__proto__', 'prototype', 'constructor'].includes(key) && safe(item, depth + 1));
  };
  if (!safe(req.body)) return res.status(400).json({ message: 'Estructura de datos no permitida' });
  next();
};

// Validaciones para clientes
export const customerValidation = [
  body('fullName').trim().notEmpty().withMessage('El nombre completo es requerido'),
  body('cedula').trim().notEmpty().withMessage('La cédula es requerida'),
  body('phone').optional({ checkFalsy: true }).trim(),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Email inválido'),
  body('address').optional({ checkFalsy: true }).trim()
];

// Validaciones para ventas
export const saleValidation = [
  body('items').isArray({ min: 1 }).withMessage('Debe haber al menos un producto'),
  body('items.*.product').notEmpty().withMessage('ID de producto requerido'),
  body('items.*.quantity').isInt({ min: 1, max: 1000000 }).toInt().withMessage('La cantidad debe ser al menos 1'),
  body('items.*.discountApplied').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('globalDiscount').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('globalDiscountAmount').optional().isFloat({ min: 0, max: 1000000000 }).toFloat(),
  body('paymentMethod').isIn(['Efectivo', 'Tarjeta', 'Transferencia']).withMessage('Método de pago inválido')
];
