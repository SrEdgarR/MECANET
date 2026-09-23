import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

export function generateSecureJWT() {
  return crypto.randomBytes(32).toString('hex');
}

export function assertLocalSetup(config = {}) {
  const env = { ...config, ...process.env };
  if (env.APP_MODE === 'cloud' || env.VERCEL || env.RAILWAY_ENVIRONMENT || env.HEROKU_APP_NAME) {
    throw new Error('La configuración automática es solo local. En la nube configura las variables en tu proveedor.');
  }
}

export function updateOrCreateEnvFile(jwtSecret) {
  const envPath = path.join(process.cwd(), '.env');
  const exists = fs.existsSync(envPath);
  const examplePath = fileURLToPath(new URL('../.env.example', import.meta.url));
  let content = fs.readFileSync(exists ? envPath : examplePath, 'utf8');
  const config = dotenv.parse(content);
  assertLocalSetup(config);

  const currentSecret = config.JWT_SECRET || '';
  if (exists && currentSecret.length >= 32 && !/CAMBIA_|placeholder|your_|un_secreto/i.test(currentSecret)) {
    console.log('JWT_SECRET válido: se conserva el archivo .env existente.');
    return false;
  }

  if (/^\s*(?:export\s+)?JWT_SECRET\s*=/m.test(content)) {
    content = content.replace(/^\s*(?:export\s+)?JWT_SECRET\s*=.*$/gm, `JWT_SECRET=${jwtSecret}`);
  } else {
    content += `\nJWT_SECRET=${jwtSecret}\n`;
  }
  fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600, flag: exists ? 'w' : 'wx' });
  console.log(exists ? 'JWT_SECRET generado en .env.' : 'Archivo .env local creado con JWT_SECRET seguro.');
  console.log('Configura MONGODB_URI en .env para tu instancia de MongoDB antes de iniciar.');
  return true;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    updateOrCreateEnvFile(generateSecureJWT());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
