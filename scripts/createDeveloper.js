/**
 * Crea un usuario desarrollador con credenciales únicas.
 * Uso: node scripts/createDeveloper.js
 */
import crypto from 'node:crypto';
import readline from 'node:readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import connectDB from '../config/db.js';

dotenv.config();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = prompt => new Promise(resolve => rl.question(prompt, resolve));
const onlyIfEmpty = process.argv.includes('--if-empty');

try {
  await connectDB({ allowFallback: false });
  if (onlyIfEmpty && await User.exists({})) {
    console.log('Ya existe al menos un usuario. No se creará otra cuenta inicial.');
  } else {
    if (onlyIfEmpty) {
      if (!process.stdin.isTTY) throw new Error('Abre una consola interactiva para crear el primer usuario.');
      console.log('No hay usuarios en la base de datos. Crea el primer usuario desarrollador.');
    }
    const name = (await question('Nombre del desarrollador: ')).trim();
    const email = (await question('Correo del desarrollador: ')).trim().toLowerCase();
    if (!name || !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      throw new Error('Nombre o correo inválido.');
    }
    if (await User.exists({ email })) {
      throw new Error('Ya existe un usuario con ese correo. No se modificó.');
    }
    const password = crypto.randomBytes(32).toString('hex');
    await User.create({ name, email, password, role: 'desarrollador', isActive: true });
    console.log('Usuario desarrollador creado: ' + email);
    console.log('Guarda esta contraseña; no volverá a mostrarse:');
    console.log(password);
  }
} catch (error) {
  console.error('No se pudo crear el desarrollador: ' + error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}
