import express from 'express';
import { checkUpdate, performUpdate } from '../controllers/systemController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Rutas protegidas (solo admin)
router.get('/check-update', protect, admin, checkUpdate);
router.post('/update', protect, admin, performUpdate);

export default router;
