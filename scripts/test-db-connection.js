import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectDB = async () => {
  try {
    // Configurar timeout corto para la prueba
    const options = {
      serverSelectionTimeoutMS: 5000, // 5 segundos timeout
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('Conexión exitosa a MongoDB');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error conectando a MongoDB:');
    console.error(err.message);
    process.exit(1);
  }
};

connectDB();
