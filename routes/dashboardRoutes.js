/**
 * @file dashboardRoutes.js
 * @description Rutas para estadísticas y datos del dashboard
 * 
 * Endpoints:
 * - GET /api/dashboard/stats - Estadísticas generales (ventas hoy, productos bajos, etc.)
 * - GET /api/dashboard/sales-by-day - Ventas por día (parámetro: days, default 7)
 * - GET /api/dashboard/top-products - Productos más vendidos (parámetros: limit=10, days=30)
 * - GET /api/dashboard/sales-by-payment - Ventas por método de pago (parámetro: days=30)
 * 
 * Middleware:
 * - protect: Todas las rutas requieren autenticación
 * - Sin restricción de admin (cajeros también pueden ver dashboard)
 * 
 * Query Params:
 * - /sales-by-day: days (número de días hacia atrás)
 * - /top-products: limit (cantidad de productos), days (rango de fechas)
 * - /sales-by-payment: days (rango de fechas)
 */

import express from 'express';
import {
  getDashboardStats,
  getSalesByDay,
  getTopProducts,
  getSalesByPayment,
  getAllDashboardData,
  getProductsWithProfit
} from '../controllers/dashboardController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Endpoint optimizado que devuelve todo en una sola petición
router.get('/all', protect, getAllDashboardData);

// Endpoints individuales (legacy, mantener por compatibilidad)
router.get('/stats', protect, getDashboardStats);
router.get('/sales-by-day', protect, getSalesByDay);
router.get('/top-products', protect, getTopProducts);
router.get('/sales-by-payment', protect, getSalesByPayment);

// Productos con beneficio (admin only)
router.get('/products-with-profit', protect, getProductsWithProfit);


export default router;
