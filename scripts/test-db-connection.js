import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz
dotenv.config({ path: path.join(__dirname, '..', '.env') });

try {
  await connectDB({ allowFallback: false });
  await mongoose.connection.db.admin().ping();
  console.log('Conexión exitosa a MongoDB');
} catch (err) {
  console.error('Error conectando a MongoDB:', err.originalError?.code || err.code || err.name);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => undefined);
}
