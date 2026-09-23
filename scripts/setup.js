import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSecureJWT, assertLocalSetup } from './generateJwtSecret.js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear interfaz de readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Función para hacer preguntas
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Función para mostrar el banner
function showBanner() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║       🚗 MECANET - Configuración Inicial       ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('Este asistente te ayudará a configurar las variables de entorno\n');
}

// Función principal de setup
async function setup() {
  try {
    showBanner();

    // Verificar si ya existe un archivo .env
    const envPath = path.join(__dirname, '..', '.env');
    assertLocalSetup(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {});
    if (fs.existsSync(envPath)) {
      console.log('⚠️  Ya existe un archivo .env en el proyecto.\n');
      const overwrite = await question('¿Deseas sobrescribirlo? (s/n): ');
      if (overwrite.toLowerCase() !== 's') {
        console.log('\n✅ Configuración cancelada. Se mantendrá el archivo .env actual.\n');
        rl.close();
        return;
      }
      console.log('');
    }

    console.log('📝 Por favor, proporciona la siguiente información:\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. MongoDB URI
    console.log('1️⃣  MONGODB_URI');
    console.log('   Cadena de conexión a tu base de datos MongoDB');
    console.log('   Ejemplos:');
    console.log('   • Local: mongodb://localhost:27017/autoparts');
    console.log('   • Atlas: mongodb+srv://usuario:pass@cluster.mongodb.net/database\n');
    
    const mongoUri = await question('   Ingresa tu MONGODB_URI: ');
    console.log('');

    // 2. JWT Secret
    console.log('2️⃣  JWT_SECRET');
    console.log('   Clave secreta para firmar tokens de autenticación');
    console.log('   Debe ser una cadena larga y segura (mínimo 32 caracteres)\n');
    
    const generateJwt = await question('   ¿Deseas generar un JWT_SECRET automáticamente? (s/n): ');
    let jwtSecret;
    
    if (generateJwt.toLowerCase() === 's') {
      jwtSecret = generateSecureJWT();
      console.log('   ✅ JWT_SECRET generado automáticamente\n');
    } else {
      jwtSecret = await question('   Ingresa tu JWT_SECRET personalizado: ');
      console.log('');
    }

    // 3. Puerto
    console.log('3️⃣  PORT');
    console.log('   Puerto en el que se ejecutará el servidor backend\n');
    
    const portInput = await question('   Puerto del servidor (presiona Enter para usar 5000): ');
    const port = portInput.trim() || '5000';
    console.log('');

    // 4. NODE_ENV
    console.log('4️⃣  NODE_ENV');
    console.log('   Entorno de ejecución: development o production\n');
    
    const nodeEnvInput = await question('   NODE_ENV (presiona Enter para "development"): ');
    const nodeEnv = nodeEnvInput.trim() || 'development';
    console.log('');

  // 5. JWT_EXPIRE (opcional)
  console.log('5️⃣  JWT_EXPIRE (opcional)');
  console.log('   Tiempo de expiración del token JWT (ej: 7d, 24h). Presiona Enter para omitir y usar el valor por defecto del código.\n');
  const jwtExpireInput = await question('   JWT_EXPIRE (presiona Enter para omitir): ');
  const jwtExpire = jwtExpireInput.trim();
  console.log('');

  // 6. BACKEND_URL (opcional)
  console.log('6️⃣  BACKEND_URL (opcional)');
  console.log('   URL pública del backend (ej: https://miapp.example.com). Presiona Enter para omitir.\n');
  const backendUrlInput = await question('   BACKEND_URL (presiona Enter para omitir): ');
  const backendUrl = backendUrlInput.trim();
  console.log('');

    // Función para escapar comillas simples dentro de los valores
    function escapeSingleQuotes(value) {
      return String(value).replace(/'/g, "\\'");
    }

    // Crear contenido del archivo .env (valores entre comillas simples obligatorias)
    const lines = [];
    lines.push("# Configuración de MECANET");
    lines.push(`# Generado automáticamente el ${new Date().toLocaleString('es-MX')}`);
    lines.push("");
    lines.push("# Conexión a MongoDB");
    lines.push(`MONGODB_URI='${escapeSingleQuotes(mongoUri)}'`);
    lines.push("");
    lines.push("# Secreto para JWT (¡NUNCA COMPARTAS ESTE VALOR!)");
    lines.push(`JWT_SECRET='${escapeSingleQuotes(jwtSecret)}'`);
    if (jwtExpire) {
      lines.push(`JWT_EXPIRE='${escapeSingleQuotes(jwtExpire)}'`);
    }
    lines.push("");
    lines.push("# Puerto del servidor");
    lines.push(`PORT='${escapeSingleQuotes(port)}'`);
    lines.push("");
    lines.push("# Entorno de ejecución");
    lines.push(`NODE_ENV='${escapeSingleQuotes(nodeEnv)}'`);
    if (backendUrl) {
      lines.push("");
      lines.push("# URL pública del backend");
      lines.push(`BACKEND_URL='${escapeSingleQuotes(backendUrl)}'`);
    }

    const envContent = lines.join('\n') + '\n';

    // Guardar archivo .env
    fs.writeFileSync(envPath, envContent, 'utf8');

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ Archivo .env creado exitosamente en la raíz del proyecto\n');
    console.log('📋 Resumen de configuración:');
    console.log('   • Base de datos: configurada');
    console.log(`   • JWT Secret: configurado (${jwtSecret.length} caracteres)`);
    console.log(`   • Puerto: ${port}`);
    console.log(`   • Entorno: ${nodeEnv}\n`);
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🚀 Próximos pasos:');
    console.log('   1. Verifica tu archivo .env en la raíz del proyecto');
    console.log('   2. Ejecuta "npm run seed" para poblar la base de datos');
    console.log('   3. Ejecuta "npm run dev" para iniciar el servidor\n');
    console.log('⚠️  IMPORTANTE: Nunca subas el archivo .env a GitHub\n');

    rl.close();
  } catch (error) {
    console.error('\n❌ Error durante la configuración:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Ejecutar setup
setup();
