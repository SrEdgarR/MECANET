/**
 * Agrega un usuario administrador sin borrar ni modificar los datos existentes.
 * Uso: npm run create-admin
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import readline from 'node:readline';
import User from '../models/User.js';
import connectDB from '../config/db.js';
import {
  createAdminUser,
  printGeneratedPassword,
  promptAdminCredentials,
} from './adminCredentials.js';

dotenv.config();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  await connectDB({ allowFallback: false });
  const name = await new Promise((resolve) => rl.question('Nombre del administrador [Administrador]: ', (value) => resolve(value.trim() || 'Administrador')));
  const credentials = await promptAdminCredentials(rl);
  const admin = await createAdminUser(User, {
    name,
    email: credentials.email,
    password: credentials.password,
  });

  console.log(`\nAdministrador creado: ${admin.name} (${admin.email}).`);
  console.log('La configuración y los demás usuarios de la base de datos se conservaron.');
  printGeneratedPassword(credentials);
  console.log('Cambia la contraseña después del primer inicio de sesión.');
} catch (error) {
  console.error(`\nNo se pudo crear el administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}
