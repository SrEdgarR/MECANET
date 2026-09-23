#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
const MONGODB_URI = process.env.MONGODB_URI;
await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

console.log('Corrigiendo ventas sin total...');

const sales = await db.collection('sales').find({
  $or: [{ total: null }, { total: { $exists: false } }]
}).toArray();

console.log(`Ventas a corregir: ${sales.length}`);

let fixed = 0;
for (const sale of sales) {
  const itemsTotal = sale.items?.reduce((sum, item) => sum + (item.lineTotal || 0), 0) || 0;
  
  await db.collection('sales').updateOne(
    { _id: sale._id },
    { 
      $set: { 
        total: itemsTotal,
        subtotal: itemsTotal,
        totalDiscount: 0
      } 
    }
  );
  fixed++;
}

console.log(`✅ ${fixed} ventas corregidas`);
await mongoose.disconnect();
