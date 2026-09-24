import { searchLiteral } from '../services/searchLiteral.js';
import { calculateReturn, exchangePrice } from '../services/returnPolicy.js';
﻿import Return from '../models/Return.js';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import mongoose from 'mongoose';
import AuditLogService from '../services/auditLogService.js';
import { auditChanges } from '../services/auditChanges.js';

const returnLabels = { sale: 'Venta', items: 'Productos devueltos', reason: 'Motivo', notes: 'Notas', totalAmount: 'Total', refundMethod: 'Método de reembolso', status: 'Estado', exchangeItems: 'Productos de cambio', priceDifference: 'Diferencia de precio' };
const returnSnapshot = doc => doc && ({ ...Object.fromEntries(Object.keys(returnLabels).filter(key => !['items', 'exchangeItems'].includes(key)).map(key => [key, doc[key] ?? null])),
  sale: doc.sale?.toString(),
  items: doc.items?.map(item => ({ product: item.product?.toString(), quantity: item.quantity, originalPrice: item.originalPrice, returnAmount: item.returnAmount, isDefective: item.isDefective })) || [],
  exchangeItems: doc.exchangeItems?.map(item => ({ product: item.product?.toString(), quantity: item.quantity, price: item.price })) || []
});
const logReturnChange = (req, doc, action, description, before = null, extraChanges = []) => AuditLogService.logReturn({
  user: req.user, action, returnId: doc._id, returnNumber: doc.returnNumber,
  description, amount: doc.totalAmount,
  changes: [...auditChanges(returnSnapshot(before), returnSnapshot(doc), returnLabels), ...extraChanges], req
});

// Obtener todas las devoluciones con filtros y paginaciÃ³n
export const getReturns = async (req, res) => {
  try {
    const { startDate, endDate, status, search, page = 1, limit = 50 } = req.query;

    let query = {};

    // Filtro por fecha
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z'),
      };
    }

    // Filtro por estado
    if (status) {
      query.status = status;
    }

    // BÃºsqueda por nÃºmero de devoluciÃ³n o por cÃ³digo de factura
    if (search) {
      const cleanSearch = search.trim().replace(/[\s-]/g, '');

      // Buscar ventas que coincidan con el invoiceNumber
      const Sale = mongoose.model('Sale');
      const matchingSales = await Sale.find({
        $or: [
          { invoiceNumber: { $regex: searchLiteral(cleanSearch), $options: 'i' } },
          { invoiceNumber: cleanSearch.toUpperCase() }
        ]
      }).select('_id').lean();

      const saleIds = matchingSales.map(s => s._id);

      // Buscar por returnNumber o por sale ID
      query.$or = [
        { returnNumber: { $regex: searchLiteral(search), $options: 'i' } },
        { sale: { $in: saleIds } }
      ];
    }

    // PaginaciÃ³n
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Contar total
    const totalDocs = await Return.countDocuments(query);

    const returns = await Return.find(query)
      .populate('sale', 'invoiceNumber totalAmount')
      .populate('customer', 'fullName email phone')
      .populate('items.product', 'name sku warranty')
      .populate('processedBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      returns,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalDocs,
        pages: Math.ceil(totalDocs / limitNum),
        hasNextPage: pageNum < Math.ceil(totalDocs / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error al obtener devoluciones:', error);
    res.status(500).json({ message: 'Error al obtener devoluciones', error: error.message });
  }
};

// Obtener una devoluciÃ³n por ID
export const getReturnById = async (req, res) => {
  try {
    const returnDoc = await Return.findById(req.params.id)
      .populate('sale')
      .populate('customer')
      .populate('items.product')
      .populate('processedBy', 'name email')
      .populate('approvedBy', 'name email');

    if (!returnDoc) {
      return res.status(404).json({ message: 'DevoluciÃ³n no encontrada' });
    }

    res.json(returnDoc);
  } catch (error) {
    console.error('Error al obtener devoluciÃ³n:', error);
    res.status(500).json({ message: 'Error al obtener devoluciÃ³n', error: error.message });
  }
};

// Crear una nueva devolución
export const createReturn = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { saleId, items, reason, notes, refundMethod, exchangeItems } = req.body;

    if (!saleId) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'La venta es requerida para procesar la devolución' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Debe indicar al menos un producto para devolver' });
    }

    if (!reason || typeof reason !== 'string') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'La razón de devolución es requerida' });
    }

    const normalizedReason = reason.trim();

    if (normalizedReason !== 'Cambio' && !refundMethod) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'El método de reembolso es requerido' });
    }

    // Validar que la venta existe
    const sale = await Sale.findOneAndUpdate({ _id: saleId }, { $inc: { returnRevision: 1 } }, { new: true, session });
    if (!sale) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Validar que la venta no esté cancelada
    if (sale.status === 'Cancelada') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'No se puede devolver una venta cancelada' });
    }

    // Obtener devoluciones previas de esta venta (excluir solo las rechazadas)
    const previousReturns = await Return.find({
      sale: saleId,
      status: { $ne: 'Rechazada' }
    }).session(session);

    const { items: returnItems, totalAmount } = calculateReturn(
      sale, items, previousReturns, normalizedReason === 'Defectuoso'
    );

    let exchangeData = null;
    if (normalizedReason === 'Cambio') {
      if (!Array.isArray(exchangeItems) || !exchangeItems.length) {
        throw Object.assign(new Error('Debe indicar los productos de cambio'), { statusCode: 400 });
      }
      const seen = new Set();
      const pricedItems = [];
      for (const item of exchangeItems) {
        const id = String(item.productId);
        if (seen.has(id)) throw Object.assign(new Error('Producto de cambio duplicado'), { statusCode: 400 });
        seen.add(id);
        const product = await Product.findById(id).session(session);
        if (!product) throw Object.assign(new Error('Producto de cambio no encontrado'), { statusCode: 400 });
        const quantity = Number(item.quantity);
        pricedItems.push({ product: id, quantity, price: exchangePrice(product, quantity) });
      }
      const exchangeTotal = pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      exchangeData = { items: pricedItems, priceDifference: Math.round((exchangeTotal - totalAmount) * 100) / 100 };
    }

    // Crear la devolución como pendiente para aprobación
    const newReturn = new Return({
      sale: saleId,
      customer: sale.customer,
      items: returnItems,
      reason: normalizedReason,
      notes,
      totalAmount,
      refundMethod: normalizedReason === 'Cambio' ? 'Cambio' : refundMethod,
      processedBy: req.user._id,
      status: 'Pendiente',
      exchangeItems: exchangeData ? exchangeData.items : undefined,
      priceDifference: exchangeData ? exchangeData.priceDifference : undefined,
    });

    await newReturn.save({ session });
    await session.commitTransaction();
    await logReturnChange(req, newReturn, 'Creación de Devolución', `Se creó la devolución ${newReturn.returnNumber}`);

    // Obtener la devolución completa con populate
    const populatedReturn = await Return.findById(newReturn._id)
      .populate('sale', 'invoiceNumber')
      .populate('customer', 'fullName email phone')
      .populate('items.product', 'name sku')
      .populate('processedBy', 'name email');

    res.status(201).json(populatedReturn);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error al crear devolución:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Error al crear devolución' });
  } finally {
    session.endSession();
  }
};

// Aprobar una devolución (requiere permiso de administrador)
export const approveReturn = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const returnDoc = await Return.findById(req.params.id).session(session);

    if (!returnDoc) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Devolución no encontrada' });
    }

    if (returnDoc.status !== 'Pendiente') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Solo se pueden aprobar devoluciones pendientes' });
    }
    const previous = returnDoc.toObject();

    const sale = await Sale.findOneAndUpdate({ _id: returnDoc.sale }, { $inc: { returnRevision: 1 } }, { new: true, session });
    if (!sale) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Venta asociada no encontrada' });
    }

    // Revalidate old pending records and serialize concurrent requests on the sale.
    const previousReturns = await Return.find({ sale: sale._id, status: { $ne: 'Rechazada' },
      _id: { $ne: returnDoc._id } }).session(session);
    const calculated = calculateReturn(sale, returnDoc.items, previousReturns, returnDoc.reason === 'Defectuoso');
    if (Math.abs(calculated.totalAmount - returnDoc.totalAmount) > 0.001 ||
        calculated.items.some((item, i) => Math.abs(item.returnAmount - returnDoc.items[i].returnAmount) > 0.001)) {
      throw Object.assign(new Error('El importe pendiente no coincide con lo pagado. Rechace y cree la devolución nuevamente.'), { statusCode: 400 });
    }
    returnDoc.items = calculated.items;
    if (returnDoc.reason === 'Cambio') {
      if (!returnDoc.exchangeItems?.length) throw Object.assign(new Error('Faltan productos de cambio'), { statusCode: 400 });
      const seen = new Set();
      let exchangeTotal = 0;
      for (const item of returnDoc.exchangeItems) {
        const id = String(item.product);
        const product = await Product.findById(id).session(session);
        if (!product || seen.has(id)) throw Object.assign(new Error('Producto de cambio inválido'), { statusCode: 400 });
        seen.add(id);
        const price = exchangePrice(product, item.quantity);
        if (Math.abs(price - item.price) > 0.001) throw Object.assign(new Error('Cambió el precio del producto. Cree nuevamente la devolución.'), { statusCode: 400 });
        exchangeTotal += price * item.quantity;
      }
      if (Math.abs(Math.round((exchangeTotal - calculated.totalAmount) * 100) / 100 - returnDoc.priceDifference) > 0.001) {
        throw Object.assign(new Error('Diferencia de cambio inválida. Cree nuevamente la devolución.'), { statusCode: 400 });
      }
    }

    // Aplicar movimiento de inventario de productos devueltos
    for (const item of returnDoc.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto ${item.product} no encontrado` });
      }

      if (item.isDefective) {
        product.defectiveStock = (product.defectiveStock || 0) + item.quantity;
      } else {
        product.stock += item.quantity;
      }

      await product.save({ session });
    }

    // Si es cambio, descontar los productos de cambio al aprobar
    if (returnDoc.reason === 'Cambio' && Array.isArray(returnDoc.exchangeItems) && returnDoc.exchangeItems.length > 0) {
      for (const exchangeItem of returnDoc.exchangeItems) {
        const product = await Product.findById(exchangeItem.product).session(session);
        if (!product) {
          await session.abortTransaction();
          return res.status(404).json({ message: `Producto de cambio ${exchangeItem.product} no encontrado` });
        }

        if (product.stock < exchangeItem.quantity) {
          await session.abortTransaction();
          return res.status(400).json({
            message: `No hay suficiente stock de ${product.name}. Disponible: ${product.stock}`
          });
        }

        product.stock -= exchangeItem.quantity;
        await product.save({ session });
      }
    }

    // Actualizar estado de venta si queda totalmente devuelta (solo devoluciones no-cambio)
    if (returnDoc.reason !== 'Cambio') {
      const completedReturns = await Return.find({
        sale: returnDoc.sale,
        status: 'Completada',
        _id: { $ne: returnDoc._id }
      }).session(session);

      const totalSaleItems = sale.items.reduce((sum, item) => sum + item.quantity, 0);
      const totalReturnedBefore = completedReturns.reduce(
        (sum, ret) => sum + ret.items.reduce((itemSum, retItem) => itemSum + retItem.quantity, 0),
        0
      );
      const totalCurrentReturn = returnDoc.items.reduce((sum, item) => sum + item.quantity, 0);

      if (totalSaleItems === totalReturnedBefore + totalCurrentReturn) {
        sale.status = 'Devuelta';
        await sale.save({ session });
      }
    }

    // Cerrar devolución como completada
    returnDoc.status = 'Completada';
    returnDoc.approvedBy = req.user._id;
    await returnDoc.save({ session });

    await session.commitTransaction();
    await logReturnChange(req, returnDoc, 'Aprobación de Devolución', `Se aprobó la devolución ${returnDoc.returnNumber}`, previous,
      [{ field: 'stock', fieldLabel: 'Productos reintegrados o intercambiados', oldValue: null,
        newValue: returnDoc.items.map(item => ({ product: item.product.toString(), quantity: item.quantity, defective: item.isDefective })) }]);

    const updatedReturn = await Return.findById(returnDoc._id)
      .populate('sale', 'invoiceNumber')
      .populate('customer', 'fullName email phone')
      .populate('items.product', 'name sku')
      .populate('processedBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json(updatedReturn);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error al aprobar devolución:', error);
    res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Error al aprobar devolución' });
  } finally {
    session.endSession();
  }
};

// Rechazar una devoluciÃ³n
export const rejectReturn = async (req, res) => {
  try {
    const { notes } = req.body;

    const returnDoc = await Return.findById(req.params.id);

    if (!returnDoc) {
      return res.status(404).json({ message: 'DevoluciÃ³n no encontrada' });
    }

    if (returnDoc.status !== 'Pendiente') {
      return res.status(400).json({ message: 'Solo se pueden rechazar devoluciones pendientes' });
    }
    const previous = returnDoc.toObject();

    returnDoc.status = 'Rechazada';
    returnDoc.notes = notes || returnDoc.notes;
    returnDoc.approvedBy = req.user._id;
    await returnDoc.save();
    await logReturnChange(req, returnDoc, 'Rechazo de Devolución', `Se rechazó la devolución ${returnDoc.returnNumber}`, previous);

    const updatedReturn = await Return.findById(returnDoc._id)
      .populate('sale', 'invoiceNumber')
      .populate('customer', 'fullName email phone')
      .populate('items.product', 'name sku')
      .populate('processedBy', 'name email')
      .populate('approvedBy', 'name email');

    res.json(updatedReturn);
  } catch (error) {
    console.error('Error al rechazar devoluciÃ³n:', error);
    res.status(500).json({ message: 'Error al rechazar devoluciÃ³n', error: error.message });
  }
};

// Obtener estadÃ­sticas de devoluciones
export const getReturnStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate + 'T23:59:59.999Z'),
        },
      };
    }

    // Total de devoluciones
    const totalReturns = await Return.countDocuments(dateFilter);

    // Devoluciones por estado
    const returnsByStatus = await Return.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' },
        },
      },
    ]);

    // Devoluciones por razÃ³n
    const returnsByReason = await Return.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$reason',
          count: { $sum: 1 },
        },
      },
    ]);

    // Productos mÃ¡s devueltos
    const topReturnedProducts = await Return.aggregate([
      { $match: dateFilter },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalAmount: { $sum: '$items.returnAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
    ]);

    // Monto total devuelto
    const totalAmountReturned = await Return.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' },
        },
      },
    ]);

    res.json({
      totalReturns,
      returnsByStatus,
      returnsByReason,
      topReturnedProducts,
      totalAmountReturned: totalAmountReturned[0]?.total || 0,
    });
  } catch (error) {
    console.error('Error al obtener estadÃ­sticas de devoluciones:', error);
    res.status(500).json({ message: 'Error al obtener estadÃ­sticas', error: error.message });
  }
};



