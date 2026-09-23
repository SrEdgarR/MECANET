import express from 'express';
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  convertToSale,
  updateQuotationStatus,
} from '../controllers/quotationController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Rutas públicas (requieren autenticación)
router.get('/', protect, getQuotations);
router.get('/:id', protect, getQuotationById);
router.post('/', protect, createQuotation);
router.put('/:id', protect, updateQuotation);
router.put('/:id/status', protect, updateQuotationStatus);

// Convertir cotización a venta
router.post('/:id/convert', protect, convertToSale);

// Solo admin puede eliminar
router.delete('/:id', protect, admin, deleteQuotation);

export default router;
