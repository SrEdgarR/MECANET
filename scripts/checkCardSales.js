import 'dotenv/config';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const Sale = mongoose.model('Sale', new mongoose.Schema({
      paymentMethod: String,
      total: Number,
      status: String,
      createdAt: Date,
      saleNumber: String
    }));

    const days30Ago = new Date();
    days30Ago.setDate(days30Ago.getDate() - 30);

    // Buscar ventas con tarjeta
    const cardSales = await Sale.find({
      paymentMethod: 'Tarjeta',
      createdAt: { $gte: days30Ago }
    }).select('saleNumber status total createdAt paymentMethod');

    console.log('Ventas con TARJETA (últimos 30 días):');
    console.log(JSON.stringify(cardSales, null, 2));

    console.log('\n--- Resumen ---');
    console.log(`Total ventas con tarjeta: ${cardSales.length}`);
    cardSales.forEach(sale => {
      console.log(`${sale.saleNumber} - ${sale.status} - $${sale.total}`);
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
