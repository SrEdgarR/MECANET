#!/usr/bin/env node
/**
 * Script para verificar estadísticas del dashboard
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function verifyDashboard() {
  try {
    console.log('🔗 Conectando a MongoDB...\n');
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    console.log('📅 FECHAS DE CONSULTA:');
    console.log('-'.repeat(60));
    console.log(`Hoy (inicio): ${today.toISOString()}`);
    console.log(`Semana (inicio): ${startOfWeek.toISOString()}`);
    console.log(`Mes (inicio): ${startOfMonth.toISOString()}`);
    console.log();

    // Ejecutar la misma agregación que el endpoint
    const salesStats = await db.collection('sales').aggregate([
      {
        $match: {
          status: 'Completada'
        }
      },
      {
        $facet: {
          today: [
            { $match: { createdAt: { $gte: today } } },
            {
              $group: {
                _id: null,
                total: { $sum: '$total' },
                count: { $sum: 1 }
              }
            }
          ],
          week: [
            { $match: { createdAt: { $gte: startOfWeek } } },
            {
              $group: {
                _id: null,
                total: { $sum: '$total' },
                count: { $sum: 1 }
              }
            }
          ],
          month: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            {
              $group: {
                _id: null,
                total: { $sum: '$total' },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]).toArray();

    const todayData = salesStats[0].today[0] || { total: 0, count: 0 };
    const weekData = salesStats[0].week[0] || { total: 0, count: 0 };
    const monthData = salesStats[0].month[0] || { total: 0, count: 0 };

    console.log('📊 ESTADÍSTICAS DEL DASHBOARD:');
    console.log('-'.repeat(60));
    console.log();
    
    console.log('HOY:');
    console.log(`  Total: $${todayData.total.toFixed(2)}`);
    console.log(`  Transacciones: ${todayData.count}`);
    console.log(`  Ticket promedio: $${todayData.count > 0 ? (todayData.total / todayData.count).toFixed(2) : '0.00'}`);
    console.log();

    console.log('SEMANA (últimos 7 días):');
    console.log(`  Total: $${weekData.total.toFixed(2)}`);
    console.log(`  Transacciones: ${weekData.count}`);
    console.log();

    console.log('MES:');
    console.log(`  Total: $${monthData.total.toFixed(2)}`);
    console.log(`  Transacciones: ${monthData.count}`);
    console.log();

    // Ver algunas ventas de hoy
    console.log('🔍 MUESTRA DE VENTAS DE HOY:');
    console.log('-'.repeat(60));
    const todaySamples = await db.collection('sales').find({
      createdAt: { $gte: today },
      status: 'Completada'
    }).limit(5).toArray();

    todaySamples.forEach((sale, i) => {
      console.log(`${i + 1}. ${sale.invoiceNumber} - $${sale.total} - ${sale.createdAt.toISOString()}`);
    });
    console.log();

    await mongoose.disconnect();
    console.log('✅ Verificación completada\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyDashboard();
