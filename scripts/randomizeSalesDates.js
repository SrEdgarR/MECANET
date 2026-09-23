#!/usr/bin/env node
/**
 * Script para aleatorizar fechas de ventas en los últimos 90 días
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

function getRandomDate(daysBack) {
  const now = new Date();
  const randomDays = Math.floor(Math.random() * daysBack);
  const randomHours = Math.floor(Math.random() * 24);
  const randomMinutes = Math.floor(Math.random() * 60);
  
  const date = new Date(now);
  date.setDate(date.getDate() - randomDays);
  date.setHours(randomHours, randomMinutes, 0, 0);
  
  return date;
}

async function randomizeSalesDates() {
  try {
    console.log('🔗 Conectando a MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    console.log('📊 Aleatorizando fechas de ventas...');
    const sales = await db.collection('sales').find({}).toArray();
    console.log(`Total de ventas a actualizar: ${sales.length}`);

    let updated = 0;
    const daysBack = 90; // Distribuir en los últimos 90 días

    for (const sale of sales) {
      const randomDate = getRandomDate(daysBack);
      
      await db.collection('sales').updateOne(
        { _id: sale._id },
        { 
          $set: { 
            createdAt: randomDate,
            updatedAt: randomDate
          } 
        }
      );
      
      updated++;
      if (updated % 500 === 0) {
        console.log(`  Actualizadas ${updated}/${sales.length}...`);
      }
    }

    console.log(`✅ ${updated} ventas actualizadas con fechas aleatorias`);
    console.log();

    // Verificar distribución
    console.log('📈 VERIFICACIÓN DE DISTRIBUCIÓN:');
    console.log('-'.repeat(60));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);

    const [todayCount, yesterdayCount, last7Count, last30Count] = await Promise.all([
      db.collection('sales').countDocuments({ createdAt: { $gte: today } }),
      db.collection('sales').countDocuments({ 
        createdAt: { $gte: yesterday, $lt: today } 
      }),
      db.collection('sales').countDocuments({ createdAt: { $gte: last7Days } }),
      db.collection('sales').countDocuments({ createdAt: { $gte: last30Days } })
    ]);

    console.log(`Ventas hoy: ${todayCount}`);
    console.log(`Ventas ayer: ${yesterdayCount}`);
    console.log(`Ventas últimos 7 días: ${last7Count}`);
    console.log(`Ventas últimos 30 días: ${last30Count}`);
    console.log();

    // Calcular totales
    const todayStats = await db.collection('sales').aggregate([
      { $match: { createdAt: { $gte: today }, status: 'Completada' } },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    if (todayStats.length > 0) {
      const stats = todayStats[0];
      console.log('💰 ESTADÍSTICAS DE HOY:');
      console.log(`Total ventas: $${stats.total.toFixed(2)}`);
      console.log(`Número de transacciones: ${stats.count}`);
      console.log(`Ticket promedio: $${(stats.total / stats.count).toFixed(2)}`);
    } else {
      console.log('⚠️  No hay ventas hoy');
    }
    console.log();

    await mongoose.disconnect();
    console.log('✅ Proceso completado\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

randomizeSalesDates();
