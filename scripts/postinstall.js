/**
 * Script que se ejecuta después de npm install
 * Informa al usuario sobre los siguientes pasos
 */

console.log('\n' + '='.repeat(60));
console.log('✅ Instalación completada exitosamente');
console.log('='.repeat(60));
console.log('\n📋 SIGUIENTES PASOS:\n');
console.log('1️⃣  Configurar el sistema:');
console.log('   npm run setup');
console.log('   (Configuración interactiva de .env, MongoDB, JWT, etc.)\n');
console.log('2️⃣  Inicializar la base de datos:');
console.log('   npm run create-admin  (Agrega un admin sin borrar datos existentes)');
console.log('   npm run seed          (Datos de ejemplo - desarrollo)\n');
console.log('3️⃣  Iniciar el servidor:');
console.log('   Terminal 1: npm run dev      (Backend)');
console.log('   Terminal 2: cd client && npm run dev  (Frontend)\n');
console.log('='.repeat(60));
console.log('💡 Tip: Ejecuta "npm run setup" ahora para comenzar');
console.log('='.repeat(60) + '\n');
