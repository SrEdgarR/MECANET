import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import Return from '../models/Return.js';

// @desc    Obtener estadísticas del dashboard (optimizado)
// @route   GET /api/dashboard/stats
// @access  Private
export const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    console.log('📅 Dates for filtering:');
    console.log('  Today:', today.toISOString());
    console.log('  Week:', startOfWeek.toISOString());
    console.log('  Month:', startOfMonth.toISOString());

    // Primero, obtener todas las devoluciones completadas para debug
    const allReturns = await Return.find({ status: 'Completada' })
      .populate('sale', 'createdAt invoiceNumber total')
      .limit(10)
      .lean();

    console.log('🔍 All Approved Returns (first 10):');
    allReturns.forEach(ret => {
      console.log(`  - Return ID: ${ret._id}`);
      console.log(`    Total: ${ret.totalAmount}`);
      console.log(`    Sale: ${ret.sale?.invoiceNumber || 'N/A'}`);
      console.log(`    Sale Date: ${ret.sale?.createdAt ? new Date(ret.sale.createdAt).toISOString() : 'N/A'}`);
      console.log(`    Return Date: ${new Date(ret.createdAt).toISOString()}`);
    });

    // Calcular ventas y beneficios usando agregación
    const salesStats = await Sale.aggregate([
      {
        $match: {
          status: 'Completada',
          total: { $ne: null, $exists: true }
        }
      },
      {
        $unwind: '$items' // Descomponer array de items
      },
      {
        $addFields: {
          // Calcular beneficio por item: (precioVenta - precioCompra) * cantidad
          itemProfit: {
            $multiply: [
              { $subtract: ['$items.priceAtSale', { $ifNull: ['$items.purchasePriceAtSale', 0] }] },
              '$items.quantity'
            ]
          }
        }
      },
      {
        $group: {
          _id: '$_id',
          createdAt: { $first: '$createdAt' },
          total: { $first: '$total' },
          totalProfit: { $sum: '$itemProfit' } // Sumar beneficio de todos los items
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
                profit: { $sum: '$totalProfit' },
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
                profit: { $sum: '$totalProfit' },
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
                profit: { $sum: '$totalProfit' },
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    // Calcular devoluciones SIMPLIFICADO - usar fecha de venta directamente
    const returnsStats = await Return.aggregate([
      {
        $match: {
          status: 'Completada',
          totalAmount: { $ne: null, $exists: true }
        }
      },
      {
        $lookup: {
          from: 'sales', // Colección de ventas en MongoDB
          localField: 'sale',
          foreignField: '_id',
          as: 'originalSale'
        }
      },
      {
        $unwind: {
          path: '$originalSale',
          preserveNullAndEmptyArrays: false // Solo incluir si encuentra la venta
        }
      },
      {
        $project: {
          _id: 1,
          totalAmount: 1,
          saleDate: '$originalSale.createdAt', // Fecha de la venta original
          items: 1,
          'originalSale.items': 1
        }
      },
      {
        $facet: {
          today: [
            { $match: { saleDate: { $gte: today } } },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' },
                count: { $sum: 1 }
              }
            }
          ],
          week: [
            { $match: { saleDate: { $gte: startOfWeek } } },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' },
                count: { $sum: 1 }
              }
            }
          ],
          month: [
            { $match: { saleDate: { $gte: startOfMonth } } },
            {
              $group: {
                _id: null,
                total: { $sum: '$totalAmount' },
                count: { $sum: 1 }
              }
            }
          ],
          debug: [
            { $limit: 5 },
            {
              $project: {
                totalAmount: 1,
                saleDate: 1,
                status: 1
              }
            }
          ]
        }
      }
    ]);

    // DEBUG: Verificar qué devuelve la consulta
    console.log('🔍 Returns Query Debug:', JSON.stringify(returnsStats[0].debug, null, 2));

    const todayData = salesStats[0].today[0] || { total: 0, profit: 0, count: 0 };
    const weekData = salesStats[0].week[0] || { total: 0, profit: 0, count: 0 };
    const monthData = salesStats[0].month[0] || { total: 0, profit: 0, count: 0 };

    const todayReturns = returnsStats[0].today[0] || { total: 0, count: 0 };
    const weekReturns = returnsStats[0].week[0] || { total: 0, count: 0 };
    const monthReturns = returnsStats[0].month[0] || { total: 0, count: 0 };

    // DEBUG: Log para verificar cálculos
    console.log('📊 Dashboard Stats Debug:');
    console.log('Today:', today.toISOString());
    console.log('Sales Today:', todayData);
    console.log('Returns Today:', todayReturns);
    console.log('Net Total Today:', todayData.total - todayReturns.total);


    // Calcular totales netos (ventas - devoluciones)
    const todayNetTotal = todayData.total - todayReturns.total;
    const weekNetTotal = weekData.total - weekReturns.total;
    const monthNetTotal = monthData.total - monthReturns.total;

    // Calcular beneficio neto (solo de ventas, las devoluciones ya no tienen profit calculado)
    const todayNetProfit = todayData.profit;
    const weekNetProfit = weekData.profit;
    const monthNetProfit = monthData.profit;

    // Ejecutar queries de conteo en paralelo
    const [lowStockCount, totalProducts, totalCustomers, activeUsers] = await Promise.all([
      Product.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
      Product.countDocuments(),
      Customer.countDocuments(),
      User.countDocuments({ isActive: true })
    ]);

    res.json({
      today: {
        total: todayNetTotal,
        profit: todayNetProfit,
        transactions: todayData.count,
        avgTicket: todayData.count > 0 ? todayNetTotal / todayData.count : 0,
        returns: todayReturns.count,
        returnsAmount: todayReturns.total
      },
      week: {
        total: weekNetTotal,
        profit: weekNetProfit,
        transactions: weekData.count,
        returns: weekReturns.count,
        returnsAmount: weekReturns.total
      },
      month: {
        total: monthNetTotal,
        profit: monthNetProfit,
        transactions: monthData.count,
        returns: monthReturns.count,
        returnsAmount: monthReturns.total
      },
      inventory: {
        totalProducts,
        lowStockProducts: lowStockCount
      },
      customers: totalCustomers,
      users: activeUsers
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
};

// @desc    Obtener ventas por día (última semana)
// @route   GET /api/dashboard/sales-by-day
// @access  Private
export const getSalesByDay = async (req, res) => {
  try {
    const daysAgo = parseInt(req.query.days) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    startDate.setHours(0, 0, 0, 0);

    // Obtener ventas por día
    const sales = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'Completada'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$total' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Obtener devoluciones aprobadas agrupadas por FECHA DE VENTA ORIGINAL
    const returns = await Return.aggregate([
      {
        $match: {
          status: 'Completada'
        }
      },
      {
        $lookup: {
          from: 'sales',
          localField: 'sale',
          foreignField: '_id',
          as: 'saleData'
        }
      },
      {
        $unwind: '$saleData'
      },
      {
        $match: {
          'saleData.createdAt': { $gte: startDate } // Filtrar por fecha de venta original
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleData.createdAt' } }, // Agrupar por fecha de venta
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Crear mapa de devoluciones por fecha de venta original
    const returnsMap = {};
    returns.forEach(ret => {
      returnsMap[ret._id] = {
        total: ret.total,
        count: ret.count
      };
    });

    // Formatear para el frontend restando devoluciones
    const formattedSales = sales.map(item => {
      const returnData = returnsMap[item._id] || { total: 0, count: 0 };
      return {
        date: item._id,
        total: item.total - returnData.total, // Neto después de devoluciones
        transactions: item.count,
        returns: returnData.count,
        returnsAmount: returnData.total
      };
    });

    res.json(formattedSales);
  } catch (error) {
    console.error('Error al obtener ventas por día:', error);
    res.status(500).json({ message: 'Error al obtener ventas', error: error.message });
  }
};

// @desc    Obtener productos más vendidos
// @route   GET /api/dashboard/top-products
// @access  Private
export const getTopProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const topProducts = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'Completada'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          name: '$product.name',
          sku: '$product.sku',
          totalQuantity: 1,
          totalRevenue: 1
        }
      }
    ]);

    res.json(topProducts);
  } catch (error) {
    console.error('Error al obtener productos más vendidos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
};

// @desc    Obtener ventas por método de pago
// @route   GET /api/dashboard/sales-by-payment
// @access  Private
export const getSalesByPayment = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const salesByPayment = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
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

    res.json(salesByPayment);
  } catch (error) {
    console.error('Error al obtener ventas por método de pago:', error);
    res.status(500).json({ message: 'Error al obtener datos', error: error.message });
  }
};

// @desc    Obtener todos los datos del dashboard en una sola petición (OPTIMIZADO)
// @route   GET /api/dashboard/all
// @access  Private
export const getAllDashboardData = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const days30Ago = new Date();
    days30Ago.setDate(days30Ago.getDate() - 30);
    const days7Ago = new Date();
    days7Ago.setDate(days7Ago.getDate() - 7);

    // Ejecutar TODAS las queries en paralelo (incluyendo devoluciones)
    const [salesStats, returnsStats, salesByDay, topProducts, salesByPayment, counts, lowStockItems] = await Promise.all([
      // Stats de ventas
      Sale.aggregate([
        { $match: { status: 'Completada', total: { $ne: null, $exists: true } } },
        {
          $facet: {
            today: [
              { $match: { createdAt: { $gte: today } } },
              { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
            ],
            week: [
              { $match: { createdAt: { $gte: startOfWeek } } },
              { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
            ],
            month: [
              { $match: { createdAt: { $gte: startOfMonth } } },
              { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
            ]
          }
        }
      ]),

      // Stats de devoluciones (por fecha de venta original)
      Return.aggregate([
        {
          $match: {
            status: 'Completada',
            totalAmount: { $ne: null, $exists: true }
          }
        },
        {
          $lookup: {
            from: 'sales',
            localField: 'sale',
            foreignField: '_id',
            as: 'originalSale'
          }
        },
        {
          $unwind: {
            path: '$originalSale',
            preserveNullAndEmptyArrays: false
          }
        },
        {
          $project: {
            _id: 1,
            totalAmount: 1,
            saleDate: '$originalSale.createdAt'
          }
        },
        {
          $facet: {
            today: [
              { $match: { saleDate: { $gte: today } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' },
                  count: { $sum: 1 }
                }
              }
            ],
            week: [
              { $match: { saleDate: { $gte: startOfWeek } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' },
                  count: { $sum: 1 }
                }
              }
            ],
            month: [
              { $match: { saleDate: { $gte: startOfMonth } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' },
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]),

      // Sales by day (last 7 days)
      Sale.aggregate([
        { $match: { createdAt: { $gte: days7Ago }, status: 'Completada', total: { $ne: null, $exists: true } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$total' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      // Top products (last 30 days)
      Sale.aggregate([
        { $match: { createdAt: { $gte: days30Ago }, status: 'Completada', total: { $ne: null, $exists: true } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.subtotal' }
          }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $project: {
            _id: 1,
            name: '$product.name',
            sku: '$product.sku',
            totalQuantity: 1,
            totalRevenue: 1
          }
        }
      ]),

      // Sales by payment method (last 30 days)
      Sale.aggregate([
        { $match: { createdAt: { $gte: days30Ago }, status: 'Completada', total: { $ne: null, $exists: true } } },
        {
          $group: {
            _id: '$paymentMethod',
            total: { $sum: '$total' },
            count: { $sum: 1 }
          }
        }
      ]),

      // Counts
      Promise.all([
        Product.countDocuments({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
        Product.countDocuments(),
        Customer.countDocuments(),
        User.countDocuments({ isActive: true })
      ]),

      // Low stock items
      Product.find({ $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
        .select('name sku stock lowStockThreshold')
        .sort({ stock: 1 })
        .limit(10)
        .lean()
    ]);

    const todayData = salesStats[0].today[0] || { total: 0, count: 0 };
    const weekData = salesStats[0].week[0] || { total: 0, count: 0 };
    const monthData = salesStats[0].month[0] || { total: 0, count: 0 };

    const todayReturns = returnsStats[0].today[0] || { total: 0, count: 0 };
    const weekReturns = returnsStats[0].week[0] || { total: 0, count: 0 };
    const monthReturns = returnsStats[0].month[0] || { total: 0, count: 0 };

    // Calcular totales netos (ventas - devoluciones)
    const todayNetTotal = todayData.total - todayReturns.total;
    const weekNetTotal = weekData.total - weekReturns.total;
    const monthNetTotal = monthData.total - monthReturns.total;

    // Normalizar métodos de pago respetando capitalización correcta y mantener orden
    const paymentMethodMap = {
      'efectivo': 'Efectivo',
      'tarjeta': 'Tarjeta',
      'transferencia': 'Transferencia'
    };

    const normalizeMethodName = (value) => {
      const base = value ? value.toString().trim() : '';
      const lower = base.toLowerCase();
      if (!base) return 'Desconocido';
      if (paymentMethodMap[lower]) return paymentMethodMap[lower];
      if (lower.includes('efect')) return 'Efectivo';
      if (lower.includes('tarj')) return 'Tarjeta';
      if (lower.includes('trans')) return 'Transferencia';
      return base;
    };

    const aggregatedPaymentData = salesByPayment.reduce((acc, item) => {
      const normalizedName = normalizeMethodName(item._id);

      if (!acc[normalizedName]) {
        acc[normalizedName] = { name: normalizedName, total: 0, count: 0 };
      }

      acc[normalizedName].total += item.total || 0;
      acc[normalizedName].count += item.count || 0;
      return acc;
    }, {});

    const preferredOrder = ['Efectivo', 'Tarjeta', 'Transferencia'];

    const normalizedPaymentData = [
      ...preferredOrder
        .filter(method => aggregatedPaymentData[method])
        .map(method => aggregatedPaymentData[method]),
      ...Object.keys(aggregatedPaymentData)
        .filter(method => !preferredOrder.includes(method))
        .map(method => aggregatedPaymentData[method])
    ];

    res.json({
      stats: {
        today: {
          total: todayNetTotal,
          transactions: todayData.count,
          avgTicket: todayData.count > 0 ? todayNetTotal / todayData.count : 0,
          returns: todayReturns.count,
          returnsAmount: todayReturns.total
        },
        week: {
          total: weekNetTotal,
          transactions: weekData.count,
          returns: weekReturns.count,
          returnsAmount: weekReturns.total
        },
        month: {
          total: monthNetTotal,
          transactions: monthData.count,
          returns: monthReturns.count,
          returnsAmount: monthReturns.total
        },
        inventory: {
          totalProducts: counts[1],
          lowStockProducts: counts[0],
          lowStockItems: lowStockItems
        },
        customers: counts[2],
        users: counts[3]
      },
      salesByDay: salesByDay.map(item => ({
        date: item._id,
        total: item.total,
        transactions: item.count
      })),
      topProducts,
      salesByPayment: normalizedPaymentData
    });
  } catch (error) {
    console.error('Error al obtener datos del dashboard:', error);
    res.status(500).json({ message: 'Error al obtener datos', error: error.message });
  }
};

// @desc    Obtener productos con beneficio calculado
// @route   GET /api/dashboard/products-with-profit
// @access  Private/Admin
export const getProductsWithProfit = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Construir filtro de fechas
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate + 'T00:00:00.000');
      }
      if (endDate) {
        dateFilter.createdAt.$lte = new Date(endDate + 'T23:59:59.999');
      }
    }

    // Agregar ventas por producto (solo ventas completadas)
    const salesByProduct = await Sale.aggregate([
      {
        $match: {
          status: 'Completada',
          ...dateFilter
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
          totalCost: {
            $sum: {
              $multiply: [
                { $ifNull: ['$items.purchasePriceAtSale', 0] },
                '$items.quantity'
              ]
            }
          }
        }
      },
      {
        $addFields: {
          totalProfit: { $subtract: ['$totalRevenue', '$totalCost'] },
          profitPerUnit: {
            $cond: {
              if: { $gt: ['$totalQuantitySold', 0] },
              then: {
                $divide: [
                  { $subtract: ['$totalRevenue', '$totalCost'] },
                  '$totalQuantitySold'
                ]
              },
              else: 0
            }
          }
        }
      }
    ]);

    // Agregar devoluciones por producto (solo completadas)
    const returnsByProduct = await Return.aggregate([
      {
        $match: {
          status: 'Completada'
        }
      },
      {
        $lookup: {
          from: 'sales',
          localField: 'sale',
          foreignField: '_id',
          as: 'saleData'
        }
      },
      { $unwind: '$saleData' },
      ...(Object.keys(dateFilter).length > 0 ? [{
        $match: {
          'saleData.createdAt': dateFilter.createdAt
        }
      }] : []),
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          returnedQuantity: { $sum: '$items.quantity' },
          returnedRevenue: { $sum: '$items.subtotal' },
          returnedCost: {
            $sum: {
              $multiply: [
                { $ifNull: ['$items.purchasePrice', 0] },
                '$items.quantity'
              ]
            }
          }
        }
      }
    ]);

    // Crear mapa de devoluciones
    const returnsMap = {};
    returnsByProduct.forEach(ret => {
      returnsMap[ret._id.toString()] = {
        quantity: ret.returnedQuantity,
        revenue: ret.returnedRevenue,
        cost: ret.returnedCost
      };
    });

    // Crear mapa de ventas
    const salesMap = {};
    salesByProduct.forEach(sale => {
      salesMap[sale._id.toString()] = sale;
    });

    // Obtener todos los productos
    const allProducts = await Product.find().lean();

    // Combinar datos de productos con ventas y devoluciones
    const productsWithProfit = allProducts.map(product => {
      const productSales = salesMap[product._id.toString()] || {
        totalQuantitySold: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        profitPerUnit: 0
      };

      const returns = returnsMap[product._id.toString()] || {
        quantity: 0,
        revenue: 0,
        cost: 0
      };

      // Calcular netos (ventas - devoluciones)
      const netQuantity = productSales.totalQuantitySold - returns.quantity;
      const netRevenue = productSales.totalRevenue - returns.revenue;
      const netCost = productSales.totalCost - returns.cost;
      const netProfit = netRevenue - netCost;
      const profitPerUnit = netQuantity > 0 ? netProfit / netQuantity : 0;
      const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

      return {
        _id: product._id,
        sku: product.sku,
        name: product.name,
        category: product.category || '',
        brand: product.brand || '',
        purchasePrice: product.purchasePrice || 0,
        sellingPrice: product.sellingPrice || 0,
        stock: product.stock || 0,
        minStock: product.minStock || 0,
        soldCount: product.soldCount || 0,
        // Datos de ventas netas (ventas - devoluciones)
        totalQuantitySold: netQuantity,
        totalRevenue: netRevenue,
        totalCost: netCost,
        totalProfit: netProfit,
        profitPerUnit: profitPerUnit,
        profitMargin: profitMargin
      };
    });

    res.json({ products: productsWithProfit });
  } catch (error) {
    console.error('Error al obtener productos con beneficio:', error);
    res.status(500).json({ message: 'Error al obtener datos', error: error.message });
  }
};
