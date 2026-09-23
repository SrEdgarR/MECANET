import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const Return = mongoose.model('Return', new mongoose.Schema({
      returnNumber: String,
      totalAmount: Number,
      status: String,
      createdAt: Date,
      items: Array,
      sale: mongoose.Schema.Types.ObjectId
    }));

    // Buscar la devolución DEV-000002
    const returnDoc = await Return.findOne({ returnNumber: 'DEV-000002' });

    console.log('Devolución DEV-000002:');
    console.log(JSON.stringify(returnDoc, null, 2));

    // Buscar todas las devoluciones recientes
    const allReturns = await Return.find().sort({ createdAt: -1 }).limit(5);
    console.log('\n--- Últimas 5 devoluciones ---');
    allReturns.forEach(ret => {
      console.log(`${ret.returnNumber} - totalAmount: ${ret.totalAmount} - items: ${ret.items?.length || 0}`);
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
