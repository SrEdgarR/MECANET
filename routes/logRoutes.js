import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import LogService from '../services/logService.js';

const router = express.Router();

// Todas las rutas requieren autenticación y rol de admin
router.use(protect);
router.use(admin);

/**
 * @route   GET /api/logs
 * @desc    Obtener logs con filtros
 * @access  Admin
 */
router.get('/', async (req, res) => {
  try {
    const {
      type,
      module,
      user,
      startDate,
      endDate,
      severity,
      isSystemAction,
      statusCode,
      page = 1,
      limit = 50
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const result = await LogService.getLogs({
      type,
      module,
      user,
      startDate,
      endDate,
      severity,
      isSystemAction,
      statusCode,
      limit: parseInt(limit),
      skip
    });

    res.json({
      logs: result.logs,
      pagination: {
        total: result.total,
        page: parseInt(page),
        pages: Math.ceil(result.total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener logs:', error);
    res.status(500).json({ message: 'Error al obtener logs', error: error.message });
  }
});

/**
 * @route   GET /api/logs/stats
 * @desc    Obtener estadísticas de logs
 * @access  Admin
 */
router.get('/stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const stats = await LogService.getStats(parseInt(days));

    res.json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

/**
 * @route   DELETE /api/logs/clean
 * @desc    Limpiar logs antiguos
 * @access  Admin
 */
router.delete('/clean', async (req, res) => {
  try {
    const { daysToKeep, severity, type, all } = req.body;

    let deletedCount = 0;
    let message = '';

    if (daysToKeep) {
      // Legacy support or specific "keep X days" request
      deletedCount = await LogService.cleanOldLogs(parseInt(daysToKeep));
      message = `${deletedCount} logs eliminados (antigüedad > ${daysToKeep} días)`;
    } else {
      // Advanced deletion
      deletedCount = await LogService.deleteLogsByCriteria({
        severity,
        days: req.body.days, // "days" parameter for "older than X days"
        type,
        all
      });
      message = `${deletedCount} logs eliminados según criterios`;
    }

    // Registrar la limpieza
    await LogService.logAction({
      action: 'clean',
      module: 'system',
      user: req.user,
      req,
      entityName: 'Logs',
      details: { filters: req.body, deletedCount },
      success: true
    });

    res.json({
      message,
      deletedCount
    });
  } catch (error) {
    console.error('Error al limpiar logs:', error);
    res.status(500).json({ message: 'Error al limpiar logs', error: error.message });
  }
});

/**
 * @route   GET /api/logs/performance
 * @desc    Obtener métricas de rendimiento
 * @access  Admin
 */
router.get('/performance', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const metrics = await LogService.getPerformanceMetrics(parseInt(hours));

    res.json(metrics);
  } catch (error) {
    console.error('Error al obtener métricas de rendimiento:', error);
    res.status(500).json({ message: 'Error al obtener métricas', error: error.message });
  }
});

/**
 * @route   GET /api/logs/errors
 * @desc    Obtener errores recientes sin resolver
 * @access  Admin
 */
router.get('/errors', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const errors = await LogService.getRecentErrors(parseInt(limit));

    res.json(errors);
  } catch (error) {
    console.error('Error al obtener errores:', error);
    res.status(500).json({ message: 'Error al obtener errores', error: error.message });
  }
});

/**
 * @route   GET /api/logs/alerts
 * @desc    Obtener alertas críticas sin resolver
 * @access  Admin
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await LogService.getCriticalAlerts();

    res.json(alerts);
  } catch (error) {
    console.error('Error al obtener alertas:', error);
    res.status(500).json({ message: 'Error al obtener alertas', error: error.message });
  }
});

/**
 * @route   GET /api/logs/audit
 * @desc    Obtener resumen de auditoría
 * @access  Admin
 */
router.get('/audit', async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const summary = await LogService.getAuditSummary(start, end, userId);

    res.json(summary);
  } catch (error) {
    console.error('Error al obtener resumen de auditoría:', error);
    res.status(500).json({ message: 'Error al obtener resumen', error: error.message });
  }
});

/**
 * @route   PATCH /api/logs/:id/resolve
 * @desc    Marcar un log como resuelto
 * @access  Admin
 */
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { resolution } = req.body;

    if (!resolution) {
      return res.status(400).json({ message: 'Se requiere una descripción de la resolución' });
    }

    const log = await LogService.resolveLog(req.params.id, req.user._id, resolution);

    if (!log) {
      return res.status(404).json({ message: 'Log no encontrado' });
    }

    res.json({ message: 'Log marcado como resuelto', log });
  } catch (error) {
    console.error('Error al resolver log:', error);
    res.status(500).json({ message: 'Error al resolver log', error: error.message });
  }
});

/**
 * @route   GET /api/logs/monitoring/system
 * @desc    Obtener métricas del sistema en tiempo real
 * @access  Admin
 */
router.get('/monitoring/system', async (req, res) => {
  try {
    const systemInfo = LogService.getSystemInfo();

    // Agregar métricas adicionales en tiempo real
    const metrics = {
      ...systemInfo,
      timestamp: new Date(),
      loadAverage: systemInfo.cpu.loadAvg,
      memoryUsagePercent: ((systemInfo.memory.used / systemInfo.memory.total) * 100).toFixed(2),
      freeMemoryPercent: ((systemInfo.memory.free / systemInfo.memory.total) * 100).toFixed(2)
    };

    res.json(metrics);
  } catch (error) {
    console.error('Error al obtener métricas del sistema:', error);
    res.status(500).json({ message: 'Error al obtener métricas', error: error.message });
  }
});

export default router;
