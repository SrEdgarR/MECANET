import { searchLiteral } from '../services/searchLiteral.js';
import { getReturnBalances } from '../services/returnPolicy.js';
import Return from '../models/Return.js';
﻿import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import CashierSession from '../models/CashierSession.js';
import LogService from '../services/logService.js';
import AuditLogService from '../services/auditLogService.js';
import mongoose from 'mongoose';

// @desc    Crear nueva venta
// @route   POST /api/sales
// @access  Private
export const createSale = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { items, paymentMethod, customer, notes, globalDiscount = 0, globalDiscountAmount = 0 } = req.body;

    // Validar que hay items
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Debe haber al menos un producto en la venta' });
    }

    session.startTransaction();

    // Verificar stock y calcular totales
    let subtotal = 0;
    let totalDiscount = 0;
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product).session(session);

      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto con ID ${item.product} no encontrado` });
      }

      // Verificar stock disponible
      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}`
        });
      }

      // Calcular precio con descuento del producto
      const priceWithDiscount = product.sellingPrice * (1 - product.discountPercentage / 100);

      // Aplicar descuento adicional si se proporciona
      const additionalDiscount = item.discountApplied || 0;
      const finalPrice = priceWithDiscount * (1 - additionalDiscount / 100);

      const itemSubtotal = finalPrice * item.quantity;
      const itemDiscount = (product.sellingPrice * item.quantity) - itemSubtotal;

      subtotal += product.sellingPrice * item.quantity;
      totalDiscount += itemDiscount;

      processedItems.push({
        product: product._id,
        quantity: item.quantity,
        priceAtSale: product.sellingPrice,
        purchasePriceAtSale: product.purchasePrice || 0, // Guardar costo para calcular beneficio
        discountApplied: product.sellingPrice ? 100 * (1 - finalPrice / product.sellingPrice) : 0,
        subtotal: itemSubtotal
      });

      // Actualizar stock y soldCount del producto
      product.stock -= item.quantity;
      product.soldCount = (product.soldCount || 0) + item.quantity;
      await product.save({ session });
    }

    // Aplicar descuento global
    const subtotalAfterItemDiscounts = subtotal - totalDiscount;
    // Si se proporciona el monto exacto del descuento, usar ese; si no, calcular desde el porcentaje
    const finalGlobalDiscountAmount = globalDiscountAmount > 0
      ? globalDiscountAmount
      : (globalDiscount / 100) * subtotalAfterItemDiscounts;
    if (!Number.isFinite(finalGlobalDiscountAmount) || finalGlobalDiscountAmount < 0 ||
        finalGlobalDiscountAmount > subtotalAfterItemDiscounts) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'El descuento supera el importe de la venta' });
    }
    totalDiscount += finalGlobalDiscountAmount;

    const total = subtotal - totalDiscount;
    if (!Number.isSafeInteger(Math.round(total * 100)) || total < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Importe de venta inválido' });
    }

    // Generar número de factura
    const invoiceNumber = await Sale.generateInvoiceNumber();

    // Crear venta
    const createdSales = await Sale.create([{
      invoiceNumber,
      user: req.user._id,
      customer: customer || null,
      items: processedItems,
      subtotal,
      totalDiscount,
      total,
      paymentMethod,
      notes
    }], { session });

    const sale = createdSales[0];

    // Si hay cliente, actualizar su historial
    if (customer) {
      await Customer.findByIdAndUpdate(customer, {
        $push: { purchaseHistory: sale._id },
        $inc: { totalPurchases: total }
      }, { session });
    }

    await session.commitTransaction();

    // Poblar información de la venta
    const populatedSale = await Sale.findById(sale._id)
      .populate('user', 'name email')
      .populate('customer', 'fullName phone email')
      .populate('items.product', 'name sku purchasePrice warranty');

    // Log técnico del sistema
    await LogService.logAction({
      action: 'create',
      module: 'sales',
      user: req.user,
      req,
      entityId: sale._id.toString(),
      entityName: sale.invoiceNumber,
      details: {
        invoiceNumber: sale.invoiceNumber,
        total: sale.total,
        itemsCount: sale.items.length,
        paymentMethod: sale.paymentMethod,
        customer: populatedSale?.customer?.fullName || 'Cliente General'
      },
      success: true
    });

    // Log de auditoría de usuario
    const customerInfo = customer ? await Customer.findById(customer).select('fullName').lean() : null;
    await AuditLogService.logSale({
      user: req.user,
      action: 'Creación de Venta',
      saleId: sale._id.toString(),
      saleNumber: sale.invoiceNumber,
      description: `Se creó la factura #${sale.invoiceNumber} por un monto de RD$${total.toFixed(2)}${customerInfo ? ` para el cliente ${customerInfo.fullName}` : ''}`,
      changes: [
        { field: 'items', fieldLabel: 'Productos vendidos', oldValue: null, newValue: sale.items.map(item => ({ product: String(item.product), quantity: item.quantity, priceAtSale: item.priceAtSale, discountApplied: item.discountApplied })) },
        { field: 'total', fieldLabel: 'Total', oldValue: null, newValue: sale.total },
        { field: 'paymentMethod', fieldLabel: 'Método de pago', oldValue: null, newValue: sale.paymentMethod }
      ],
      amount: total,
      customer: customerInfo?.fullName,
      metadata: {
        itemsCount: sale.items.length,
        paymentMethod: sale.paymentMethod,
        discount: totalDiscount
      },
      req
    });

    res.status(201).json(populatedSale);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error('Error al crear venta:', error);

    // Log de error
    await LogService.logError({
      module: 'sales',
      action: 'create',
      message: `Error al crear venta: ${error.message}`,
      error,
      user: req.user,
      req,
      details: { itemsCount: req.body.items?.length }
    });

    res.status(500).json({ message: 'Error al crear venta', error: error.message });
  } finally {
    session.endSession();
  }
};

// @desc    Obtener todas las ventas (con paginación)
// @route   GET /api/sales
// @access  Private
export const getSales = async (req, res) => {
  try {
    const { startDate, endDate, user, paymentMethod, status, search, page = 1, limit = 50 } = req.query;

    let query = {};

    // Filtro por bÃºsqueda de nÃºmero de factura
    if (search) {
      // Limpiar espacios y caracteres especiales del search
      const cleanSearch = search.trim().replace(/[\s-]/g, '');
      // Buscar exactamente o que contenga el tÃ©rmino (mÃ¡s flexible)
      query.$or = [
        { invoiceNumber: { $regex: searchLiteral(cleanSearch), $options: 'i' } },
        { invoiceNumber: cleanSearch.toUpperCase() }
      ];
    }

    // Filtro por rango de fechas
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00.000');
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59.999');
        query.createdAt.$lte = end;
      }
    }

    // Filtro por usuario (cajero)
    if (user) {
      query.user = user;
    }

    // Filtro por mÃ©todo de pago
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    // Filtro por estado
    if (status) {
      query.status = status;
    }

    // Calcular skip y limit para paginaciÃ³n
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Contar total de documentos que coinciden con el query
    const totalDocs = await Sale.countDocuments(query);

    // Calcular estadÃ­sticas globales (sin paginaciÃ³n)
    const allSales = await Sale.find(query).select('status total').lean();
    const stats = {
      total: allSales.length,
      completed: allSales.filter(s => s.status === 'Completada').length,
      cancelled: allSales.filter(s => s.status === 'Cancelada').length,
      totalAmount: allSales.filter(s => s.status === 'Completada').reduce((sum, s) => sum + (s.total || 0), 0)
    };

    // Obtener ventas con paginaciÃ³n
    const sales = await Sale.find(query)
      .populate('user', 'name email')
      .populate('customer', 'fullName phone')
      .populate('items.product', 'name sku warranty')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(); // usar lean() para mejorar performance

    // Obtener informaciÃ³n de devoluciones para cada venta (en paralelo)
    const Return = mongoose.model('Return');
    const saleIds = sales.map(s => s._id);
    const allReturns = await Return.find({ sale: { $in: saleIds } })
      .select('sale returnNumber status totalAmount createdAt items')
      .lean();

    // Agrupar returns por sale
    const returnsBySale = {};
    allReturns.forEach(ret => {
      const saleId = ret.sale.toString();
      if (!returnsBySale[saleId]) returnsBySale[saleId] = [];
      returnsBySale[saleId].push(ret);
    });

    // Agregar info de returns a cada sale
    const salesWithReturns = sales.map(sale => {
      const returns = returnsBySale[sale._id.toString()] || [];
      return {
        ...sale,
        returns,
        hasReturns: returns.length > 0,
        returnsCount: returns.length,
        totalReturned: returns.reduce((sum, ret) => sum + (ret.totalAmount || 0), 0)
      };
    });

    res.json({
      sales: salesWithReturns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalDocs,
        pages: Math.ceil(totalDocs / limitNum),
        hasNextPage: pageNum < Math.ceil(totalDocs / limitNum),
        hasPrevPage: pageNum > 1
      },
      stats
    });
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ message: 'Error al obtener ventas', error: error.message });
  }
};

// @desc    Obtener una venta por ID
// @route   GET /api/sales/:id
// @access  Private
export const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Obtener devoluciones previas de esta venta para calcular cantidades disponibles
    const Return = mongoose.model('Return');
    const previousReturns = await Return.find({
      sale: req.params.id,
      status: { $ne: 'Rechazada' } // Contar todas excepto rechazadas
    });

    const balances = getReturnBalances(sale, previousReturns);
    const ids = sale.items.map(item => String(item.product));
    await sale.populate('user', 'name email');
    await sale.populate('customer', 'fullName phone email address');
    await sale.populate('items.product', 'name sku brand');
    const saleObj = sale.toObject();
    saleObj.items = saleObj.items.map((item, index) => ({ ...item,
      returnedQuantity: balances.get(ids[index])?.returned || 0,
      availableToReturn: Math.max(0, (balances.get(ids[index])?.quantity || 0) - (balances.get(ids[index])?.returned || 0))
    }));
    saleObj.returnableItems = [...balances].map(([id, balance]) => ({
      product: saleObj.items[ids.indexOf(id)]?.product,
      quantity: balance.quantity, returnedQuantity: balance.returned,
      availableToReturn: Math.max(0, balance.quantity - balance.returned),
      priceAtSale: balance.paid / 100 / balance.quantity,
      paidCents: balance.paid, refundedCents: balance.refunded
    }));

    res.json(saleObj);
  } catch (error) {
    console.error('Error al obtener venta:', error);
    res.status(500).json({ message: 'Error al obtener venta', error: error.message });
  }
};

// @desc    Obtener ventas del usuario actual (para cierre de caja)
// @route   GET /api/sales/user/me
// @access  Private
export const getMySales = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sales = await Sale.find({
      user: req.user._id,
      createdAt: { $gte: today },
      status: 'Completada'
    })
      .populate('customer', 'fullName phone email')
      .populate('items.product', 'name sku')
      .sort({ createdAt: -1 });

    // Calcular totales por mÃ©todo de pago
    const summary = {
      totalSales: sales.length,
      totalAmount: 0,
      byPaymentMethod: {
        Efectivo: 0,
        Tarjeta: 0,
        Transferencia: 0
      }
    };

    sales.forEach(sale => {
      summary.totalAmount += sale.total;
      summary.byPaymentMethod[sale.paymentMethod] += sale.total;
    });

    res.json({
      sales,
      summary
    });
  } catch (error) {
    console.error('Error al obtener ventas del usuario:', error);
    res.status(500).json({ message: 'Error al obtener ventas', error: error.message });
  }
};

// @desc    Cancelar venta
// @route   PUT /api/sales/:id/cancel
// @access  Private/Admin
export const cancelSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const sale = await Sale.findOneAndUpdate({ _id: req.params.id, status: 'Completada' },
      { $inc: { returnRevision: 1 } }, { new: true, session });

    if (!sale) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    if (await Return.exists({ sale: sale._id, status: { $ne: 'Rechazada' } }).session(session)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede cancelar una venta con devoluciones pendientes o completadas' });
    }

    // Restaurar stock de los productos (solo si el producto aÃºn existe)
    let restoredCount = 0;
    let skippedCount = 0;

    for (const item of sale.items) {
      // Verificar que el producto existe antes de actualizar
      const productId = item.product?._id || item.product;

      if (productId) {
        const productExists = await Product.findById(productId).session(session);

        if (productExists) {
          await Product.findByIdAndUpdate(productId, {
            $inc: { stock: item.quantity }
          }, { session });
          restoredCount++;
        } else {
          console.warn(`âš ï¸ Producto ${productId} no existe. No se puede restaurar stock.`);
          skippedCount++;
        }
      } else {
        console.warn(`âš ï¸ Item sin producto vÃ¡lido en venta ${sale._id}`);
        skippedCount++;
      }
    }

    sale.status = 'Cancelada';
    await sale.save({ session });

    console.log(`âœ… Venta cancelada. Stock restaurado: ${restoredCount}, Productos no disponibles: ${skippedCount}`);

    // Actualizar historial del cliente si existe
    if (sale.customer) {
      await Customer.findByIdAndUpdate(sale.customer, {
        $inc: { totalPurchases: -sale.total }
      }, { session });
    }

    await session.commitTransaction();

    // Log tÃ©cnico del sistema
    await LogService.logAction({
      action: 'cancel',
      module: 'sales',
      user: req.user,
      req,
      entityId: sale._id.toString(),
      entityName: sale.invoiceNumber,
      details: {
        invoiceNumber: sale.invoiceNumber,
        total: sale.total,
        restoredCount,
        skippedCount,
        reason: req.body.reason || 'No especificado'
      },
      success: true
    });

    // Log de auditorÃ­a de usuario
    await AuditLogService.logSale({
      user: req.user,
      action: 'Anulación de Venta',
      saleId: sale._id.toString(),
      saleNumber: sale.invoiceNumber,
      description: `Se anuló la factura #${sale.invoiceNumber} por un monto de RD$${sale.total.toFixed(2)}. ${req.body.reason ? `Motivo: ${req.body.reason}` : ''}`,
      changes: [{ field: 'status', fieldLabel: 'Estado', oldValue: 'Completada', newValue: 'Cancelada' }],
      amount: sale.total,
      metadata: {
        itemsRestored: restoredCount,
        itemsSkipped: skippedCount,
        reason: req.body.reason || 'No especificado'
      },
      req
    });

    res.json({ message: 'Venta cancelada exitosamente', sale });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error('Error al cancelar venta:', error);

    // Log de error
    await LogService.logError({
      module: 'sales',
      action: 'cancel',
      message: `Error al cancelar venta: ${error.message}`,
      error,
      user: req.user,
      req,
      details: { saleId: req.params.id }
    });

    res.status(500).json({ message: 'Error al cancelar venta', error: error.message });
  } finally {
    await session.endSession();
  }
};

// @desc    Cerrar caja / Finalizar turno del cajero
// @route   POST /api/sales/close-register
// @access  Private
export const closeCashRegister = async (req, res) => {
  try {
    const { countedTotals, notes } = req.body;
    const cashierId = req.user._id;

    // Validar datos requeridos
    if (!countedTotals || countedTotals.cash === undefined || countedTotals.card === undefined || countedTotals.transfer === undefined) {
      return res.status(400).json({ message: 'Debe proporcionar los totales contados (efectivo, tarjeta, transferencia)' });
    }

    const normalizedCountedTotals = {
      cash: Number(countedTotals.cash),
      card: Number(countedTotals.card),
      transfer: Number(countedTotals.transfer)
    };

    if (Object.values(normalizedCountedTotals).some((value) => Number.isNaN(value) || value < 0)) {
      return res.status(400).json({ message: 'Los totales contados deben ser números válidos mayores o iguales a 0' });
    }

    // Obtener ventas del cajero del día actual (desde las 00:00:00 hasta ahora)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const now = new Date();

    const sales = await Sale.find({
      user: cashierId,
      createdAt: {
        $gte: startOfDay,
        $lte: now
      },
      status: { $ne: 'Cancelada' }
    });

    // Obtener retiros de caja del día actual
    const CashWithdrawal = mongoose.model('CashWithdrawal');
    const withdrawals = await CashWithdrawal.find({
      withdrawnBy: cashierId,
      createdAt: {
        $gte: startOfDay,
        $lte: now
      },
      status: 'approved'
    });

    // Calcular total de retiros
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Calcular totales del sistema
    const systemTotals = {
      totalSales: sales.length,
      totalAmount: 0,
      cash: 0,
      card: 0,
      transfer: 0
    };

    sales.forEach((sale) => {
      systemTotals.totalAmount += sale.total;

      if (sale.paymentMethod === 'Efectivo') {
        systemTotals.cash += sale.total;
      } else if (sale.paymentMethod === 'Tarjeta') {
        systemTotals.card += sale.total;
      } else if (sale.paymentMethod === 'Transferencia') {
        systemTotals.transfer += sale.total;
      }
    });

    // Restar retiros del efectivo esperado
    systemTotals.cash -= totalWithdrawals;

    // Calcular diferencias
    const differences = {
      cash: normalizedCountedTotals.cash - systemTotals.cash,
      card: normalizedCountedTotals.card - systemTotals.card,
      transfer: normalizedCountedTotals.transfer - systemTotals.transfer,
      total: (normalizedCountedTotals.cash + normalizedCountedTotals.card + normalizedCountedTotals.transfer) - systemTotals.totalAmount
    };

    // Crear registro de sesión de caja
    const session = await CashierSession.create({
      cashier: cashierId,
      openedAt: startOfDay,
      closedAt: now,
      systemTotals,
      countedTotals: normalizedCountedTotals,
      differences,
      notes: notes || '',
      sales: sales.map((s) => s._id),
      totalWithdrawals,
      withdrawals: withdrawals.map((w) => w._id)
    });
    await AuditLogService.log({ user: req.user, module: 'caja', action: 'Cierre de Caja',
      entity: { type: 'Caja', id: session._id, name: `Caja de ${req.user.name}` },
      description: `Se cerró la caja de ${req.user.name} con ${sales.length} ventas`,
      changes: [
        { field: 'systemTotals', fieldLabel: 'Totales del sistema', oldValue: null, newValue: systemTotals },
        { field: 'countedTotals', fieldLabel: 'Totales contados', oldValue: null, newValue: normalizedCountedTotals },
        { field: 'differences', fieldLabel: 'Diferencias', oldValue: null, newValue: differences },
        { field: 'totalWithdrawals', fieldLabel: 'Retiros', oldValue: null, newValue: totalWithdrawals }
      ], req });

    // Poblar datos del cajero para la respuesta
    await session.populate('cashier', 'fullName email');

    res.status(201).json({
      message: 'Cierre de caja realizado exitosamente',
      session,
      summary: {
        systemTotals,
        countedTotals: normalizedCountedTotals,
        differences
      }
    });

  } catch (error) {
    console.error('Error al cerrar caja:', error);
    res.status(500).json({ message: 'Error al cerrar caja', error: error.message });
  }
};







