import UpdaterService from '../services/updaterService.js';

/**
 * @desc    Verificar si hay actualizaciones disponibles
 * @route   GET /api/system/check-update
 * @access  Private/Admin
 */
export const checkUpdate = async (req, res) => {
  try {
    const result = await UpdaterService.checkForUpdates();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al buscar actualizaciones', 
      error: error.message 
    });
  }
};

/**
 * @desc    Descargar y aplicar actualización
 * @route   POST /api/system/update
 * @access  Private/Admin
 */
export const performUpdate = async (req, res) => {
  res.status(409).json({
    message: 'Cierre MECANET y ejecute INICIAR-MECANET.bat para actualizar con confirmación.'
  });
};
