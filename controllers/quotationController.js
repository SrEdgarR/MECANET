import { searchLiteral } from '../services/searchLiteral.js';
﻿import Quotation from '../models/Quotation.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import mongoose from 'mongoose';
import AuditLogService from '../services/auditLogService.js';
import { auditChanges } from '../services/auditChanges.js';

const quotationLabels = { customer: 'Cliente', genericCustomerName: 'Cliente genérico', genericCustomerContact: 'Contacto', items: 'Productos y cantidades', subtotal: 'Subtotal', tax: 'Impuesto', total: 'Total', status: 'Estado', validUntil: 'Válida hasta', notes: 'Notas', terms: 'Términos', convertedToSale: 'Venta generada' };
const quotationSnapshot = quotation => quotation && ({
  ...Object.fromEntries(Object.keys(quotationLabels).filter(key => key !== 'items').map(key => [key, quotation[key] ?? null])),
  customer: quotation.customer?._id?.toString() || quotation.customer?.toString() || null,
  convertedToSale: quotation.convertedToSale?.toString() || null,
  items: quotation.items?.map(item => ({ product: item.product?._id?.toString() || item.product?.toString(), quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount, subtotal: item.subtotal })) || []
});
const logQuotation = (req, quotation, action, description, before = null) => AuditLogService.log({
  user: req.user, module: 'cotizaciones', action,
  entity: { type: 'Cotización', id: quotation._id, name: `Cotización #${quotation.quotationNumber}` },
  description, changes: auditChanges(quotationSnapshot(before), quotationSnapshot(quotation), quotationLabels), req
});

const addBusinessDays = (startDate, days) => {
  const date = new Date(startDate);
  let added = 0;

  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }

  return date;
};

// @desc    Obtener todas las cotizaciones
// @route   GET /api/quotations
// @access  Private
export const getQuotations = async (req, res) => {
  try {
    const { status, customer, startDate, endDate, search } = req.query;
    
    let query = {};

    // Filtro por estado
    if (status) {
      query.status = status;
    }

    // Filtro por cliente
    if (customer) {
      query.customer = customer;
    }

    // Filtro por rango de fechas
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate + 'T00:00:00.000');
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate + 'T23:59:59.999');
      }
    }

    // Filtro por bÃºsqueda de nÃºmero
    if (search) {
      const cleanSearch = search.trim().replace(/[\s-]/g, '');
      query.$or = [
        { quotationNumber: { $regex: searchLiteral(cleanSearch), $options: 'i' } },
        { quotationNumber: cleanSearch.toUpperCase() }
      ];
    }

    const quotations = await Quotation.find(query)
      .populate('customer', 'fullName phone email')
      .populate('items.product', 'name sku')
      .populate('createdBy', 'name email')
      .populate('convertedToSale', 'invoiceNumber')
      .sort({ createdAt: -1 })
      .lean();

    res.json(quotations);
  } catch (error) {
    console.error('Error al obtener cotizaciones:', error);
    res.status(500).json({ message: 'Error al obtener cotizaciones' });
  }
};

// @desc    Obtener una cotizaciÃ³n por ID
// @route   GET /api/quotations/:id
// @access  Private
export const getQuotationById = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('customer')
      .populate('items.product')
      .populate('createdBy', 'name email')
      .populate('processedBy', 'name email')
      .populate('convertedToSale');

    if (!quotation) {
      return res.status(404).json({ message: 'CotizaciÃ³n no encontrada' });
    }

    res.json(quotation);
  } catch (error) {
    console.error('Error al obtener cotizaciÃ³n:', error);
    res.status(500).json({ message: 'Error al obtener cotizaciÃ³n' });
  }
};

// @desc    Crear nueva cotizaciÃ³n
// @route   POST /api/quotations
// @access  Private
export const createQuotation = async (req, res) => {
  try {
    const { customer, genericCustomerName, genericCustomerContact, items, validUntil, notes, terms } = req.body;
    if (!Array.isArray(items) || !items.length || items.length > 1000) return res.status(400).json({ message: 'Indique entre 1 y 1000 productos' });
    const cleanGenericName = genericCustomerName?.trim();
    const cleanGenericContact = genericCustomerContact?.trim();


    if (!customer && (!cleanGenericName || cleanGenericName === '')) {
      return res.status(400).json({ message: 'Debes seleccionar un cliente o ingresar un nombre genÃ©rico' });
    }

    let customerExists = null;
    if (customer) {
      customerExists = await Customer.findById(customer);
      if (!customerExists) {
        return res.status(404).json({ message: 'Cliente no encontrado' });
      }
    }

    // Validar y calcular items
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Producto ${item.product} no encontrado` });
      }

      const unitPrice = Number(item.unitPrice ?? product.sellingPrice);
      if (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000000 ||
          !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(Number(item.discount || 0)) ||
          Number(item.discount || 0) < 0 || Number(item.discount || 0) > 100) {
        return res.status(400).json({ message: 'Cantidad, precio o descuento de cotización inválido' });
      }
      item.quantity = Number(item.quantity);
      const discount = item.discount || 0;
      const priceAfterDiscount = unitPrice * (1 - discount / 100);
      const itemSubtotal = priceAfterDiscount * item.quantity;
      
      if (!Number.isSafeInteger(Math.round((subtotal + itemSubtotal) * 118))) return res.status(400).json({ message: 'El importe de la cotización excede el límite permitido' });
      subtotal += itemSubtotal;

      processedItems.push({
        product: item.product,
        quantity: item.quantity,
        unitPrice: unitPrice,
        discount: discount,
        subtotal: itemSubtotal,
      });
    }

    // Calcular impuesto (18% ITBIS)
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    // Crear cotizaciÃ³n
    const fallbackValidUntil = validUntil ? new Date(validUntil) : addBusinessDays(new Date(), 5);

    const quotation = new Quotation({
      customer: customerExists ? customerExists._id : null,
      genericCustomerName: !customerExists ? cleanGenericName : undefined,
      genericCustomerContact: !customerExists ? cleanGenericContact : undefined,
      items: processedItems,
      subtotal,
      tax,
      total,
      validUntil: fallbackValidUntil,
      notes,
      terms,
      createdBy: req.user.id,
    });

    await quotation.save();
    await logQuotation(req, quotation, 'Creación de Cotización', `Se creó la cotización ${quotation.quotationNumber}`);

    // Populate para retornar datos completos
    await quotation.populate('customer', 'fullName phone email');
    await quotation.populate('items.product', 'name sku');
    await quotation.populate('createdBy', 'name email');

    res.status(201).json(quotation);
  } catch (error) {
    console.error('Error al crear cotizaciÃ³n:', error);
    res.status(500).json({ message: 'Error al crear cotizaciÃ³n' });
  }
};

// @desc    Actualizar cotizaciÃ³n
// @route   PUT /api/quotations/:id
// @access  Private
export const updateQuotation = async (req, res) => {
  try {
    if (req.body.items !== undefined && (!Array.isArray(req.body.items) || !req.body.items.length || req.body.items.length > 1000)) return res.status(400).json({ message: 'Lista de productos inválida' });
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({ message: 'CotizaciÃ³n no encontrada' });
    }
    const previous = quotation.toObject();

    // Solo se puede editar si estÃ¡ pendiente
    if (quotation.status !== 'Pendiente') {
      return res.status(400).json({ 
        message: 'Solo se pueden editar cotizaciones pendientes' 
      });
    }

    const { customer, genericCustomerName, genericCustomerContact, items, validUntil, notes, terms } = req.body;
    const cleanGenericName = genericCustomerName?.trim();
    const cleanGenericContact = genericCustomerContact?.trim();

    // Validar cliente si se proporciona
    if (customer !== undefined) {
      if (customer) {
        const customerExists = await Customer.findById(customer);
        if (!customerExists) {
          return res.status(404).json({ message: 'Cliente no encontrado' });
        }
        quotation.customer = customerExists._id;
        quotation.genericCustomerName = undefined;
        quotation.genericCustomerContact = undefined;
      } else {
        quotation.customer = null;
      }
    }

    if (genericCustomerName !== undefined) {
      quotation.genericCustomerName = cleanGenericName || undefined;
    }
    if (genericCustomerContact !== undefined) {
      quotation.genericCustomerContact = cleanGenericContact || undefined;
    }

    if (!quotation.customer && (!quotation.genericCustomerName || quotation.genericCustomerName.trim() === '')) {
      return res.status(400).json({ message: 'Debes mantener un cliente asignado o un nombre genÃ©rico' });
    }

    // Recalcular items si se proporcionan
    if (items && items.length > 0) {
      let subtotal = 0;
      const processedItems = [];

      for (const item of items) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({ message: `Producto ${item.product} no encontrado` });
        }

        const unitPrice = Number(item.unitPrice ?? product.sellingPrice);
      if (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000000 ||
          !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(Number(item.discount || 0)) ||
          Number(item.discount || 0) < 0 || Number(item.discount || 0) > 100) {
        return res.status(400).json({ message: 'Cantidad, precio o descuento de cotización inválido' });
      }
      item.quantity = Number(item.quantity);
        const discount = item.discount || 0;
        const priceAfterDiscount = unitPrice * (1 - discount / 100);
        const itemSubtotal = priceAfterDiscount * item.quantity;
        
        if (!Number.isSafeInteger(Math.round((subtotal + itemSubtotal) * 118))) return res.status(400).json({ message: 'El importe de la cotización excede el límite permitido' });
      subtotal += itemSubtotal;

        processedItems.push({
          product: item.product,
          quantity: item.quantity,
          unitPrice: unitPrice,
          discount: discount,
          subtotal: itemSubtotal,
        });
      }

      const tax = subtotal * 0.18;
      const total = subtotal + tax;

      quotation.items = processedItems;
      quotation.subtotal = subtotal;
      quotation.tax = tax;
      quotation.total = total;
    }

    if (validUntil) {
      quotation.validUntil = new Date(validUntil);
    }
    if (notes !== undefined) quotation.notes = notes;
    if (terms !== undefined) quotation.terms = terms;

    await quotation.save();
    if (auditChanges(quotationSnapshot(previous), quotationSnapshot(quotation), quotationLabels).length) {
      await logQuotation(req, quotation, 'Modificación de Cotización', `Se modificó la cotización ${quotation.quotationNumber}`, previous);
    }

    await quotation.populate('customer', 'fullName phone email');
    await quotation.populate('items.product', 'name sku');
    await quotation.populate('createdBy', 'name email');

    res.json(quotation);
  } catch (error) {
    console.error('Error al actualizar cotizaciÃ³n:', error);
    res.status(500).json({ message: 'Error al actualizar cotizaciÃ³n' });
  }
};

// @desc    Eliminar cotizaciÃ³n
// @route   DELETE /api/quotations/:id
// @access  Private (Admin only)
export const deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({ message: 'CotizaciÃ³n no encontrada' });
    }

    // No permitir eliminar si ya fue convertida
    if ((quotation.status === 'Convertida' || quotation.convertedToSale)) {
      return res.status(400).json({ 
        message: 'No se puede eliminar una cotizaciÃ³n que ya fue convertida en venta' 
      });
    }

    const deleted = await Quotation.deleteOne({ _id: quotation._id, __v: quotation.__v,
      status: { $ne: 'Convertida' }, convertedToSale: null });
    if (!deleted.deletedCount) return res.status(409).json({ message: 'La cotización cambió. Recarga antes de eliminarla.' });
    await AuditLogService.log({ user: req.user, module: 'cotizaciones', action: 'Eliminación de Cotización',
      entity: { type: 'Cotización', id: quotation._id, name: `Cotización #${quotation.quotationNumber}` },
      description: `Se eliminó la cotización ${quotation.quotationNumber}`,
      changes: auditChanges(quotationSnapshot(quotation), null, quotationLabels), req });

    res.json({ message: 'CotizaciÃ³n eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar cotizaciÃ³n:', error);
    res.status(500).json({ message: 'Error al eliminar cotizaciÃ³n' });
  }
};

// @desc    Convertir cotización a venta
// @route   POST /api/quotations/:id/convert
// @access  Private
export const convertToSale = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const quotation = await Quotation.findById(req.params.id)
      .populate('items.product')
      .session(session);

    if (!quotation) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Cotización no encontrada' });
    }

    // Validar estado
    if ((quotation.status === 'Convertida' || quotation.convertedToSale)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Esta cotización ya fue convertida en venta'
      });
    }

    if (quotation.status === 'Rechazada' || quotation.status === 'Vencida') {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'No se puede convertir una cotización rechazada o vencida'
      });
    }

    const { paymentMethod, globalDiscount = 0 } = req.body;

    if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(paymentMethod) ||
        !Number.isFinite(globalDiscount) || globalDiscount < 0 || globalDiscount > 100) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Método de pago requerido' });
    }

    // Crear venta con los datos de la cotización, cumpliendo el esquema de Sale
    if (!quotation.items.length || quotation.items.some(item => !item.product || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
        item.quantity > 1000000 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
        !Number.isFinite(item.discount || 0) || item.discount < 0 || item.discount > 100)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Corrige las cantidades o precios de la cotización antes de convertirla' });
    }
    const saleItems = quotation.items.map((item) => {
      const discountApplied = item.discount || 0;
      const priceAfterDiscount = item.unitPrice * (1 - discountApplied / 100);
      const itemSubtotal = priceAfterDiscount * item.quantity;

      return {
        product: item.product._id,
        quantity: item.quantity,
        priceAtSale: item.unitPrice,
        purchasePriceAtSale: item.product.purchasePrice || 0,
        discountApplied,
        subtotal: itemSubtotal,
      };
    });

    // Subtotal bruto (antes de descuentos), para mantener consistencia con createSale
    let saleSubtotal = 0;
    let totalDiscountFromItems = 0;

    for (const item of saleItems) {
      const priceAfterDiscount = item.priceAtSale * (1 - item.discountApplied / 100);
      saleSubtotal += item.priceAtSale * item.quantity;
      totalDiscountFromItems += (item.priceAtSale - priceAfterDiscount) * item.quantity;
    }

    const globalDiscountAmount = (globalDiscount / 100) * (saleSubtotal - totalDiscountFromItems);
    const totalDiscount = totalDiscountFromItems + globalDiscountAmount;
    const total = saleSubtotal - totalDiscount;
    if (!Number.isSafeInteger(Math.round(total * 100)) || total < 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Importe de venta inválido' });
    }
    const invoiceNumber = await Sale.generateInvoiceNumber();

    const sale = new Sale({
      invoiceNumber,
      items: saleItems,
      customer: quotation.customer || null,
      paymentMethod,
      user: req.user.id,
      status: 'Completada',
      subtotal: saleSubtotal,
      totalDiscount,
      total,
    });

    // Verificar y actualizar stock con bloqueo transaccional
    for (const item of sale.items) {
      const product = await Product.findById(item.product).session(session);

      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ message: `Producto ${item.product} no encontrado` });
      }

      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}, Requerido: ${item.quantity}`
        });
      }

      product.stock -= item.quantity;
      product.soldCount = (product.soldCount || 0) + item.quantity;
      await product.save({ session });
    }

    await sale.save({ session });
    if (sale.customer) await Customer.findByIdAndUpdate(sale.customer, {
      $push: { purchaseHistory: sale._id }, $inc: { totalPurchases: sale.total }
    }, { session });

    // Actualizar cotización
    const previous = quotation.toObject();
    quotation.status = 'Convertida';
    quotation.convertedToSale = sale._id;
    quotation.convertedDate = new Date();
    quotation.processedBy = req.user.id;
    await quotation.save({ session });

    await session.commitTransaction();
    await logQuotation(req, quotation, 'Cambio de Estado de Cotización', `Se convirtió la cotización ${quotation.quotationNumber} en venta`, previous);
    await AuditLogService.logSale({ user: req.user, action: 'Creación de Venta', saleId: sale._id,
      saleNumber: sale.invoiceNumber, description: `Se creó la venta ${sale.invoiceNumber} desde la cotización ${quotation.quotationNumber}`,
      amount: sale.total, changes: [{ field: 'sourceQuotation', fieldLabel: 'Cotización origen', oldValue: null, newValue: quotation.quotationNumber }], req });

    await sale.populate('customer', 'fullName phone email');
    await sale.populate('items.product', 'name sku');
    await sale.populate('user', 'name email');

    res.json({
      message: 'Cotización convertida en venta exitosamente',
      sale,
      quotation
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error al convertir cotización:', error);
    res.status(500).json({ message: 'Error al convertir cotización en venta' });
  } finally {
    session.endSession();
  }
};

// @desc    Cambiar estado de cotización (Aprobar/Rechazar)
// @route   PUT /api/quotations/:id/status
// @access  Private
export const updateQuotationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const quotation = await Quotation.findById(req.params.id);

    if (!quotation) {
      return res.status(404).json({ message: 'CotizaciÃ³n no encontrada' });
    }

    if (!['Aprobada', 'Rechazada'].includes(status)) {
      return res.status(400).json({ message: 'Estado invÃ¡lido' });
    }

    if (quotation.convertedToSale || !['Pendiente', 'Aprobada', 'Rechazada'].includes(quotation.status)) {
      return res.status(400).json({ message: 'No se puede cambiar el estado de una cotización cerrada' });
    }
    const previous = quotation.toObject();
    quotation.status = status;
    quotation.processedBy = req.user.id;
    await quotation.save();
    await logQuotation(req, quotation, 'Cambio de Estado de Cotización', `Se cambió el estado de la cotización ${quotation.quotationNumber} a ${quotation.status}`, previous);

    await quotation.populate('customer', 'fullName phone email');
    await quotation.populate('createdBy', 'name email');
    await quotation.populate('processedBy', 'name email');

    res.json(quotation);
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ message: 'Error al actualizar estado de cotizaciÃ³n' });
  }
};






