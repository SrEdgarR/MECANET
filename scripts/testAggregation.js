#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
await connectDB({ allowFallback: false });
const db = mongoose.connection.db;

const startOfWeek = new Date();
startOfWeek.setDate(startOfWeek.getDate() - 7);
startOfWeek.setHours(0, 0, 0, 0);

console.log('Testing aggregation...');

const result = await db.collection('sales').aggregate([
  {
    $match: {
      createdAt: { $gte: startOfWeek },
      status: 'Completada'
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: '$total' },
      count: { $sum: 1 },
      maxTotal: { $max: '$total' },
      minTotal: { $min: '$total' }
    }
  }
]).toArray();

console.log('Result:', JSON.stringify(result, null, 2));

await mongoose.disconnect();
