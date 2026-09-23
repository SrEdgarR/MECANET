import PurchaseOrder from '../models/PurchaseOrder.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import { sendPurchaseOrderEmail } from '../services/emailService.js';
import mongoose from 'mongoose';

// Obtener todas las Ã³rdenes de compra
export const getPurchaseOrders = async (req, res) => {
  try {
    const orders = await PurchaseOrder.find()
      .populate('supplier', 'name email phone')
      .populate('items.product', 'sku name')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error al obtener Ã³rdenes:', error);
    res.status(500).json({ message: 'Error al obtener Ã³rdenes de compra' });
  }
};

// Obtener una orden por ID
export const getPurchaseOrderById = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('supplier')
      .populate('items.product')
      .populate('createdBy', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Orden no encontrada' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error al obtener orden:', error);
    res.status(500).json({ message: 'Error al obtener orden' });
  }
};

// Crear orden de compra
export const createPurchaseOrder = async (req, res) => {
  try {
    const { supplier, genericSupplierName, items, notes, expectedDeliveryDate } = req.body;

    // Verificar que el proveedor existe (solo si se proporciona)
    if (supplier && supplier.trim() !== '') {
      const supplierExists = await Supplier.findById(supplier);
      if (!supplierExists) {
        return res.status(404).json({ message: 'Proveedor no encontrado' });
      }
    }

    // Calcular totales (solo si los items tienen precio)
    let subtotal = 0;
    let hasPrices = true;
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Producto ${item.product} no encontrado` });
      }

      // Si no se proporciona precio, usar 0 y marcar que no hay precios
      const unitPrice = item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== ''
        ? parseFloat(item.unitPrice)
        : 0;

      if (unitPrice === 0) {
        hasPrices = false;
      }

      const itemSubtotal = item.quantity * unitPrice;
      subtotal += itemSubtotal;

      processedItems.push({
        product: item.product,
        quantity: item.quantity,
        unitPrice: unitPrice,
        subtotal: itemSubtotal,
      });
    }

    // Solo calcular impuesto y total si hay precios definidos
    const tax = hasPrices ? subtotal * 0.18 : 0;
    const total = subtotal + tax;

    // Preparar datos de la orden
    const orderData = {
      items: processedItems,
      subtotal,
      tax,
      total,
      notes,
      expectedDeliveryDate,
      createdBy: req.user.id,
    };

    // Solo agregar supplier si se proporciona y no estÃ¡ vacÃ­o
    if (supplier && supplier.trim() !== '') {
      orderData.supplier = supplier;
    }

    // Agregar nombre de proveedor genÃ©rico si se proporciona
    if (genericSupplierName && genericSupplierName.trim() !== '') {
      orderData.genericSupplierName = genericSupplierName.trim();
    }

    const order = new PurchaseOrder(orderData);

    await order.save();

    // Populate para retornar datos completos
    await order.populate('supplier', 'name email phone');
    await order.populate('items.product', 'sku name');
    await order.populate('createdBy', 'name email');

    res.status(201).json(order);
  } catch (error) {
    console.error('Error al crear orden:', error);
    res.status(500).json({ message: 'Error al crear orden de compra' });
  }
};

// Generar orden automÃ¡tica por productos con bajo stock
export const generateAutoOrder = async (req, res) => {
  try {
    const { supplierId, productIds } = req.body;

    let query = {};

    // Productos con stock menor o igual al threshold
    const allProducts = await Product.find().populate('supplier');
    let lowStockProducts = allProducts.filter(p => p.stock <= p.lowStockThreshold);

    if (supplierId) {
      lowStockProducts = lowStockProducts.filter(p =>
        p.supplier && p.supplier._id.toString() === supplierId
      );
    }

    if (productIds && productIds.length > 0) {
      lowStockProducts = lowStockProducts.filter(p =>
        productIds.includes(p._id.toString())
      );
    }

    if (lowStockProducts.length === 0) {
      return res.status(404).json({ message: 'No hay productos con stock bajo' });
    }

    // Agrupar por proveedor
    const ordersBySupplier = {};

    for (const product of lowStockProducts) {
      // Si tiene proveedor, usar su ID. Si no, usar 'generic'
      const supplierId = (product.supplier && product.supplier._id)
        ? product.supplier._id.toString()
        : 'generic';

      if (!ordersBySupplier[supplierId]) {
        ordersBySupplier[supplierId] = {
          supplier: supplierId === 'generic' ? null : product.supplier,
          isGeneric: supplierId === 'generic',
          items: [],
        };
      }

      // Cantidad sugerida: el doble del threshold menos el stock actual
      const suggestedQuantity = Math.max((product.lowStockThreshold * 2) - product.stock, 1);

      ordersBySupplier[supplierId].items.push({
        product: product._id,
        quantity: suggestedQuantity,
        unitPrice: 0, // Sin precio, se define con el proveedor
        subtotal: 0,
      });
    }

    // Crear Ã³rdenes
    const createdOrders = [];

    for (const supplierId in ordersBySupplier) {
      const orderData = ordersBySupplier[supplierId];

      const orderPayload = {
        items: orderData.items,
        subtotal: 0,
        tax: 0,
        total: 0,
        notes: orderData.isGeneric
          ? 'Orden generada automÃ¡ticamente para productos SIN PROVEEDOR asignado - Revisar proveedores'
          : 'Orden generada automÃ¡ticamente por stock bajo - Precios a confirmar con proveedor',
        createdBy: req.user.id,
      };

      // Solo asignar supplier si no es genÃ©rico
      if (!orderData.isGeneric) {
        orderPayload.supplier = supplierId;
      } else {
        // Para genÃ©ricos, podemos poner un nombre descriptivo si el modelo lo permite
        orderPayload.genericSupplierName = 'Proveedor GenÃ©rico / Por Asignar';
      }

      const order = new PurchaseOrder(orderPayload);

      await order.save();

      // Populate condicional
      if (!orderData.isGeneric) {
        await order.populate('supplier', 'name email phone');
      }
      await order.populate('items.product', 'sku name');

      createdOrders.push(order);
    }

    res.status(201).json({
      message: `${createdOrders.length} orden(es) creada(s) exitosamente`,
      orders: createdOrders,
    });
  } catch (error) {
    console.error('Error al generar Ã³rdenes automÃ¡ticas:', error);
    res.status(500).json({ message: 'Error al generar Ã³rdenes automÃ¡ticas' });
  }
};

// Actualizar orden completa (editar)
export const updatePurchaseOrder = async (req, res) => {
  try {
    const { supplier, items, notes, expectedDeliveryDate } = req.body;

    // Validar proveedor
    if (supplier) {
      const supplierExists = await Supplier.findById(supplier);
      if (!supplierExists) {
        return res.status(404).json({ message: 'Proveedor no encontrado' });
      }
    }

    // Validar y calcular items
    let processedItems = [];
    let subtotal = 0;

    if (items && items.length > 0) {
      for (const item of items) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(404).json({ message: `Producto ${item.product} no encontrado` });
        }

        const itemSubtotal = item.quantity * item.unitPrice;
        subtotal += itemSubtotal;

        processedItems.push({
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: itemSubtotal,
        });
      }
    }

    // Calcular impuesto y total
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    const updateData = {
      ...(supplier && { supplier }),
      ...(items && items.length > 0 && { items: processedItems, subtotal, tax, total }),
      ...(notes !== undefined && { notes }),
      ...(expectedDeliveryDate && { expectedDeliveryDate }),
    };

    const order = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('supplier', 'name email phone')
      .populate('items.product', 'sku name')
      .populate('createdBy', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Orden no encontrada' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error al actualizar orden:', error);
    res.status(500).json({ message: 'Error al actualizar orden de compra' });
  }
};

// Actualizar estado de orden
export const updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { status, receivedDate, receivedQuantities, receiveNotes } = req.body;

    session.startTransaction();

    const order = await PurchaseOrder.findById(req.params.id).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Orden no encontrada' });
    }

    const wasAlreadyReceived = order.status === 'Recibida' || Boolean(order.receivedDate);
    if (wasAlreadyReceived && status && status !== 'Recibida') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Una orden recibida no puede reabrirse' });
    }
    if (status === 'Recibida' && !order.receivedDate) order.receivedDate = new Date();

    if (status) {
      order.status = status;
    }
    if (status === 'Recibida' && receivedDate) {
      order.receivedDate = receivedDate;
    }
    if (receiveNotes !== undefined) {
      order.receiveNotes = receiveNotes;
    }

    // Aplicar stock solo una vez cuando la orden pasa a 'Recibida'
    const shouldApplyStock = status === 'Recibida' && !wasAlreadyReceived;

    if (shouldApplyStock) {
      for (const item of order.items) {
        const productId = item.product?._id || item.product;
        const quantityOverride = receivedQuantities?.[item._id.toString()];

        let quantityToAdd = item.quantity;
        if (quantityOverride !== undefined) {
          const parsedQuantity = Number(quantityOverride);
          if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 0) {
            await session.abortTransaction();
            return res.status(400).json({
              message: `Cantidad recibida inválida para el ítem ${item._id}`
            });
          }
          quantityToAdd = parsedQuantity;
        }

        const product = await Product.findById(productId).session(session);
        if (!product) {
          await session.abortTransaction();
          return res.status(404).json({ message: `Producto ${productId} no encontrado` });
        }

        if (!Number.isSafeInteger(quantityToAdd) || quantityToAdd < 0 || quantityToAdd > 1000000 ||
            !Number.isSafeInteger(product.stock + quantityToAdd)) {
          await session.abortTransaction();
          return res.status(400).json({ message: 'Cantidad recibida inválida' });
        }
        product.stock += quantityToAdd;
        await product.save({ session });
      }
    }

    await order.save({ session });
    await session.commitTransaction();

    await order.populate('supplier', 'name email phone');
    await order.populate('items.product', 'sku name');

    res.json({
      ...order.toObject(),
      stockApplied: shouldApplyStock
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error al actualizar orden:', error);
    res.status(500).json({ message: 'Error al actualizar orden' });
  } finally {
    session.endSession();
  }
};

// Enviar orden de compra por email al proveedor
export const sendPurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('supplier')
      .populate('items.product', 'name sku')
      .populate('createdBy', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Orden no encontrada' });
    }

    // Verificar que la orden tenga proveedor y email válido
    if (!order.supplier) {
      return res.status(400).json({
        message: 'La orden no tiene proveedor asignado. No se puede enviar por email.'
      });
    }

    if (!order.supplier.email) {
      return res.status(400).json({
        message: 'El proveedor no tiene email configurado. Por favor actualiza sus datos.'
      });
    }

    // Preparar datos para el email
    const orderData = {
      orderNumber: order.orderNumber,
      expectedDate: order.expectedDeliveryDate,
      totalAmount: order.total,
      notes: order.notes,
      createdAt: order.createdAt,
      items: order.items.map(item => ({
        productName: item.product?.name || 'Producto',
        quantity: item.quantity,
        unitCost: item.unitPrice,
        total: item.subtotal
      }))
    };

    // Enviar email (la funciÃ³n lee settings desde la BD)
    await sendPurchaseOrderEmail(orderData, order.supplier);

    // Actualizar estado de la orden
    order.emailSent = true;
    order.emailSentDate = new Date();
    await order.save();

    res.json({
      message: `Orden enviada exitosamente a ${order.supplier.email}`,
      order
    });
  } catch (error) {
    console.error('Error al enviar orden:', error);
    const emailDisabled = error.message?.includes('desactivado');
    res.status(emailDisabled ? 400 : 500).json({
      message: emailDisabled ? error.message : 'Error al enviar orden de compra',
      error: emailDisabled ? undefined : error.message
    });
  }
};

// Eliminar orden
export const deletePurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Orden no encontrada' });
    }
    res.json({ message: 'Orden eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar orden:', error);
    res.status(500).json({ message: 'Error al eliminar orden' });
  }
};



