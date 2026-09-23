// Compatibilidad: la comprobacion de actualizaciones se realiza desde Releases.
process.argv[2] ||= 'INICIAR-MECANET.bat';
await import('./check-release-update.js');
