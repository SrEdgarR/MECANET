import express from 'express';
import AuditLogService from '../services/auditLogService.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Todas las rutas requieren autenticación y rol de administrador
 */
router.use(protect);
router.use(admin);

/**
 * @route   GET /api/audit-logs
 * @desc    Obtener logs de auditoría con filtros
 * @access  Administradores
 */
router.get('/', async (req, res) => {
  try {
    const {
      page,
      limit,
      module,
      action,
      user,
      startDate,
      endDate,
      severity,
      entityType
    } = req.query;
    
    const result = await AuditLogService.getLogs({
      page,
      limit,
      module,
      action,
      user,
      startDate,
      endDate,
      severity,
      entityType
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Error al obtener logs de auditoría:', error);
    res.status(500).json({
      message: 'Error al obtener logs de auditoría',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/audit-logs/stats
 * @desc    Obtener estadísticas de auditoría
 * @access  Administradores
 */
router.get('/stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const stats = await AuditLogService.getStats(parseInt(days));
    
    res.json(stats);
    
  } catch (error) {
    console.error('Error al obtener estadísticas de auditoría:', error);
    res.status(500).json({
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/audit-logs/clean
 * @desc    Limpiar logs antiguos
 * @access  Administradores
 */
router.delete('/clean', async (req, res) => {
  try {
    const { daysToKeep = 365 } = req.body;
    
    const result = await AuditLogService.cleanOldLogs(daysToKeep);
    
    res.json({
      message: `Se eliminaron ${result.deleted} logs anteriores a ${result.cutoffDate.toLocaleDateString('es-DO')}`,
      ...result
    });
    
  } catch (error) {
    console.error('Error al limpiar logs de auditoría:', error);
    res.status(500).json({
      message: 'Error al limpiar logs',
      error: error.message
    });
  }
});

export default router;
