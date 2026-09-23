/**
 * ERRORMIDDLEWARE.JS - Middleware para manejo de errores
 * 
 * Contiene funciones para capturar y formatear errores de forma centralizada.
 * Se registra en server.js al final de todas las rutas.
 */

/**
 * ERRORHANDLER - Middleware de manejo centralizado de errores
 * 
 * Captura cualquier error que ocurra en controladores o middlewares previos.
 * Formatea la respuesta de error de manera consistente.
 * 
 * @param {Error} err - Objeto de error capturado
 * @param {Request} req - Objeto de petición Express
 * @param {Response} res - Objeto de respuesta Express
 * @param {Function} next - Siguiente middleware (no se usa aquí)
 * 
 * En producción, oculta el stack trace por seguridad.
 * En desarrollo, muestra el stack completo para debugging.
 */
export const errorHandler = (err, req, res, next) => {
  // Si el statusCode es 200 (OK), cambiar a 500 (Error del servidor)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Loguear error en consola del servidor para debugging
  console.error('\n❌ ERROR CAPTURADO POR ERROR HANDLER:');
  console.error('   URL:', req.method, req.originalUrl);
  console.error('   Error:', err.message);
  console.error('   Stack:', err.stack);

  // Enviar respuesta JSON con el error
  res.status(statusCode).json({
    message: err.message, // Mensaje descriptivo del error
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack // Ocultar stack en producción
  });
};

/**
 * NOTFOUND - Middleware para rutas no encontradas (404)
 * 
 * Se ejecuta cuando ninguna ruta coincide con la petición.
 * Crea un error 404 y lo pasa al errorHandler.
 * 
 * Uso: app.use(notFound) - Registrar ANTES de errorHandler
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404); // Establecer código de estado 404
  next(error); // Pasar el error al errorHandler
};
