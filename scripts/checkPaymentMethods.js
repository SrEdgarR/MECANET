import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const Sale = mongoose.model('Sale', new mongoose.Schema({
      paymentMethod: String,
      total: Number,
      status: String,
      createdAt: Date
    }));

    const days30Ago = new Date();
    days30Ago.setDate(days30Ago.getDate() - 30);

    const result = await Sale.aggregate([
      { 
        $match: { 
          createdAt: { $gte: days30Ago }, 
          status: 'Completada' 
        } 
      },
      { 
        $group: { 
          _id: '$paymentMethod', 
          total: { $sum: '$total' }, 
          count: { $sum: 1 } 
        } 
      }
    ]);

    console.log('Ventas por método de pago (últimos 30 días):');
    console.log(JSON.stringify(result, null, 2));

    // Verificar valores únicos de paymentMethod
    const uniqueMethods = await Sale.distinct('paymentMethod', {
      createdAt: { $gte: days30Ago },
      status: 'Completada'
    });
    console.log('\nMétodos de pago únicos encontrados:');
    console.log(uniqueMethods);

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
