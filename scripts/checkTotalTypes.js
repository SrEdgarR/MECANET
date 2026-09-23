#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
const MONGODB_URI = process.env.MONGODB_URI;
await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const startOfWeek = new Date();
startOfWeek.setDate(startOfWeek.getDate() - 7);
startOfWeek.setHours(0, 0, 0, 0);

// Verificar tipos de datos en campo total
const sales = await db.collection('sales').find({
  createdAt: { $gte: startOfWeek },
  status: 'Completada'
}).limit(10).toArray();

console.log('Verificando tipos de datos en campo total:');
sales.forEach((sale, i) => {
  console.log(`${i + 1}. ${sale.invoiceNumber}: total = ${sale.total} (type: ${typeof sale.total})`);
});

// Contar ventas con total no numérico
const invalidTotals = await db.collection('sales').countDocuments({
  createdAt: { $gte: startOfWeek },
  status: 'Completada',
  $or: [
    { total: null },
    { total: { $exists: false } },
    { total: { $type: 'string' } }
  ]
});

console.log(`\nVentas con total inválido en la semana: ${invalidTotals}`);

await mongoose.disconnect();
