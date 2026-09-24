#!/usr/bin/env node

/**
 * Datos ficticios coherentes para probar los módulos comerciales de MECANET.
 * Solo opera sobre MECANET_TEST y nunca crea usuarios ni registros de log.
 * `npm run seed -- --dry-run` revisa el plan sin escribir; `npm run seed` lo aplica.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import connectDB from '../config/db.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const TEST_DATABASE = 'MECANET_TEST';
const isDryRun = process.argv.includes('--dry-run');
const unexpectedArguments = process.argv.slice(2).filter(argument => argument !== '--dry-run');

function databaseNameFromUri(uri) {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?[^/]+\/([^/?#]*)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function seedId(number) {
  return new mongoose.Types.ObjectId(`5eed${number.toString(16).padStart(20, '0')}`);
}

function daysAgo(days, hour = 12, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  if (days === 0 && date > new Date()) return new Date();
  return date;
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeQuotationItems(productSpecs, productIds, entries) {
  return entries.map(([productIndex, quantity, discount = 0]) => {
    const product = productSpecs[productIndex];
    const unitPrice = product.sellingPrice;
    return {
      product: productIds[productIndex],
      quantity,
      unitPrice,
      discount,
      subtotal: money(unitPrice * quantity * (1 - discount / 100))
    };
  });
}

async function normalizeDocuments(Model, documents) {
  const normalized = [];
  for (const data of documents) {
    const document = new Model(data);
    await document.validate();
    normalized.push(document.toObject({ depopulate: true, versionKey: false }));
  }
  return normalized;
}

async function assertSeedOwnership(Model, documents, keyField, label) {
  if (!documents.length) return;

  const ids = documents.map(document => document._id);
  const existingById = await Model.find({ _id: { $in: ids } })
    .select(keyField ? `_id ${keyField}` : '_id notes')
    .lean();
  const expectedById = new Map(documents.map(document => [String(document._id), document]));

  for (const existing of existingById) {
    const expected = expectedById.get(String(existing._id));
    if (keyField && existing[keyField] !== expected[keyField]) {
      throw new Error(`El ID reservado para ${label} ya pertenece a otro registro. No se modificó la base.`);
    }
    if (!keyField && existing.notes !== expected.notes) {
      throw new Error(`El ID reservado para ${label} ya pertenece a otro registro. No se modificó la base.`);
    }
  }

  if (!keyField) return;
  const expectedIds = new Set(ids.map(String));
  const existingByKey = await Model.find({
    [keyField]: { $in: documents.map(document => document[keyField]) },
    _id: { $nin: ids }
  }).select(`_id ${keyField}`).lean();

  const conflict = existingByKey.find(document => !expectedIds.has(String(document._id)));
  if (conflict) {
    throw new Error(`El identificador de prueba de ${label} ya se usa en otro registro. No se modificó la base.`);
  }
}

async function writeDocuments(Model, documents) {
  if (!documents.length) return;
  const operations = documents.map(({ _id, ...fields }) => ({
    updateOne: {
      filter: { _id },
      update: { $set: fields, $setOnInsert: { _id } },
      upsert: true
    }
  }));
  await Model.bulkWrite(operations, { ordered: true, timestamps: false });
}

async function collectionCount(name) {
  try {
    return await mongoose.connection.db.collection(name).countDocuments();
  } catch {
    return 0;
  }
}

async function main() {
  if (unexpectedArguments.length) {
    throw new Error(`Argumentos no reconocidos: ${unexpectedArguments.join(', ')}`);
  }

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('No se encontró MONGODB_URI en el .env del proyecto.');

  const configuredDatabase = databaseNameFromUri(uri);
  if (configuredDatabase.toUpperCase() !== TEST_DATABASE) {
    throw new Error(`Este seed solo opera en ${TEST_DATABASE}; la URI configurada apunta a otra base.`);
  }

  // Evita que importar los modelos cree o cambie índices durante el seed.
  mongoose.set('autoIndex', false);
  const [
    { default: User },
    { default: Supplier },
    { default: Customer },
    { default: Product },
    { default: Sale },
    { default: Quotation },
    { default: PurchaseOrder },
    { default: Return },
    { default: CashWithdrawal },
    { default: CashierSession }
  ] = await Promise.all([
    import('../models/User.js'),
    import('../models/Supplier.js'),
    import('../models/Customer.js'),
    import('../models/Product.js'),
    import('../models/Sale.js'),
    import('../models/Quotation.js'),
    import('../models/PurchaseOrder.js'),
    import('../models/Return.js'),
    import('../models/CashWithdrawal.js'),
    import('../models/CashierSession.js')
  ]);

  await connectDB({ allowFallback: false });
  if (mongoose.connection.name.toUpperCase() !== TEST_DATABASE) {
    throw new Error(`La conexión terminó en una base distinta de ${TEST_DATABASE}.`);
  }

  try {
    const activeUsers = await User.find({ isActive: true }).select('_id role').lean();
    const responsibleUser = ['admin', 'cajero', 'desarrollador']
      .map(role => activeUsers.find(user => user.role === role))
      .find(Boolean);
    if (!responsibleUser) {
      throw new Error('No hay un usuario activo para asociar las operaciones. El seed no crea usuarios.');
    }

    const userId = responsibleUser._id;
    const supplierIds = [201, 202, 203].map(seedId);
    const customerIds = Array.from({ length: 8 }, (_, index) => seedId(101 + index));
    const productIds = Array.from({ length: 12 }, (_, index) => seedId(301 + index));

    const suppliers = [
      {
        _id: supplierIds[0], name: 'Importadora Caribe Motor, SRL', contactName: 'Patricia Rivas',
        email: 'ventas@caribemotor.example.com', phone: '809-555-0140',
        address: 'Av. John F. Kennedy, Santo Domingo', paymentTerms: '30 días',
        notes: 'Distribución de filtros, correas y consumibles de mantenimiento.',
        isActive: true, isArchived: false, createdAt: daysAgo(240), updatedAt: daysAgo(18)
      },
      {
        _id: supplierIds[1], name: 'Repuestos Técnicos del Cibao, SRL', contactName: 'Andrés Polanco',
        email: 'pedidos@tecnicocibao.example.com', phone: '809-555-0182',
        address: 'Av. 27 de Febrero, Santiago de los Caballeros', paymentTerms: '45 días',
        notes: 'Especialistas en frenos, suspensión y componentes eléctricos.',
        isActive: true, isArchived: false, createdAt: daysAgo(205), updatedAt: daysAgo(24)
      },
      {
        _id: supplierIds[2], name: 'Lubricantes y Baterías Antillanas, SRL', contactName: 'Lucía Jiménez',
        email: 'atencion@antillanas.example.com', phone: '809-555-0167',
        address: 'Av. Charles de Gaulle, Santo Domingo Este', paymentTerms: '15 días',
        notes: 'Entrega programada de lubricantes, baterías y material de encendido.',
        isActive: true, isArchived: false, createdAt: daysAgo(176), updatedAt: daysAgo(9)
      }
    ];

    const customers = [
      ['Laura Méndez', '809-555-0101', 'laura.mendez@example.com', 'Piantini, Santo Domingo'],
      ['José Miguel Rosario', '809-555-0102', 'jose.rosario@example.com', 'Los Prados, Santo Domingo'],
      ['Daniela Peña', '809-555-0103', 'daniela.pena@example.com', 'Los Jardines, Santiago'],
      ['Carlos Alberto Núñez', '809-555-0104', 'carlos.nunez@example.com', 'Madre Vieja, San Cristóbal'],
      ['Mariela Castillo', '809-555-0105', 'mariela.castillo@example.com', 'Bella Vista, Santo Domingo'],
      ['Rafael Guzmán', '809-555-0106', 'rafael.guzman@example.com', 'Villa Mella, Santo Domingo Norte'],
      ['Ingrid Valdez', '809-555-0107', 'ingrid.valdez@example.com', 'Centro, La Vega'],
      ['Nelson de León', '809-555-0108', 'nelson.deleon@example.com', 'Ensanche Ozama, Santo Domingo Este']
    ].map(([fullName, phone, email, address], index) => ({
      _id: customerIds[index], fullName, phone, email, address,
      purchaseHistory: [], totalPurchases: 0, isArchived: false,
      createdAt: daysAgo(130 + index * 7), updatedAt: daysAgo(4 + index)
    }));

    const productSpecs = [
      { sku: 'DEMO-MEC-FIL-001', name: 'Filtro de aceite para motor 1.6 L', brand: 'Bosch', category: 'Filtros', description: 'Filtro roscado para mantenimiento periódico de motores de gasolina.', warranty: '6 meses', purchasePrice: 445, sellingPrice: 760, openingStock: 20, lowStockThreshold: 6, supplier: 0, supplierSKU: 'OF-16-BS' },
      { sku: 'DEMO-MEC-FRE-002', name: 'Pastillas de freno delanteras cerámicas', brand: 'TRW', category: 'Frenos', description: 'Juego de pastillas delanteras con compuesto cerámico para sedán compacto.', warranty: '12 meses', purchasePrice: 1940, sellingPrice: 3150, openingStock: 14, lowStockThreshold: 5, supplier: 1, supplierSKU: 'GDB-1842' },
      { sku: 'DEMO-MEC-ENC-003', name: 'Bujía de encendido Iridium', brand: 'NGK', category: 'Encendido', description: 'Bujía de iridio de larga duración para motores de cuatro cilindros.', warranty: '12 meses', purchasePrice: 700, sellingPrice: 1150, openingStock: 25, lowStockThreshold: 8, supplier: 1, supplierSKU: 'IZFR6K-11' },
      { sku: 'DEMO-MEC-ELE-004', name: 'Batería 12 V 650 CCA', brand: 'LTH', category: 'Eléctrico', description: 'Batería sellada para vehículos compactos y medianos.', warranty: '18 meses', purchasePrice: 5600, sellingPrice: 7350, openingStock: 8, lowStockThreshold: 3, supplier: 2, supplierSKU: 'L-24F-650' },
      { sku: 'DEMO-MEC-ELE-005', name: 'Alternador remanufacturado 90 A', brand: 'Denso', category: 'Eléctrico', description: 'Alternador probado en banco, con regulador integrado.', warranty: '6 meses', purchasePrice: 8900, sellingPrice: 11950, openingStock: 5, lowStockThreshold: 3, supplier: 1, supplierSKU: 'ALT-90A-R' },
      { sku: 'DEMO-MEC-MOT-006', name: 'Correa serpentina 6 canales', brand: 'Gates', category: 'Motor', description: 'Correa EPDM para accesorios de motor; revisar longitud con el VIN.', warranty: '12 meses', purchasePrice: 1350, sellingPrice: 2150, openingStock: 14, lowStockThreshold: 4, supplier: 0, supplierSKU: 'K060912' },
      { sku: 'DEMO-MEC-SUS-007', name: 'Amortiguador delantero hidráulico', brand: 'Monroe', category: 'Suspensión', description: 'Amortiguador delantero para uso urbano y carretera.', warranty: '12 meses', purchasePrice: 4300, sellingPrice: 6250, openingStock: 8, lowStockThreshold: 3, supplier: 1, supplierSKU: '72908' },
      { sku: 'DEMO-MEC-FRE-008', name: 'Disco de freno ventilado delantero', brand: 'Brembo', category: 'Frenos', description: 'Disco ventilado de reemplazo; se recomienda instalar por pares.', warranty: '12 meses', purchasePrice: 3575, sellingPrice: 5250, openingStock: 10, lowStockThreshold: 4, supplier: 1, supplierSKU: '09.A921.11' },
      { sku: 'DEMO-MEC-FIL-009', name: 'Filtro de aire de motor', brand: 'MANN-FILTER', category: 'Filtros', description: 'Elemento filtrante de papel plisado para admisión de aire.', warranty: '6 meses', purchasePrice: 830, sellingPrice: 1375, openingStock: 18, lowStockThreshold: 5, supplier: 0, supplierSKU: 'C 26 168' },
      { sku: 'DEMO-MEC-MOT-010', name: 'Termostato de refrigeración', brand: 'Wahler', category: 'Motor', description: 'Termostato de apertura calibrada para el sistema de refrigeración.', warranty: '6 meses', purchasePrice: 1250, sellingPrice: 1920, openingStock: 6, lowStockThreshold: 3, supplier: 1, supplierSKU: 'T-1920' },
      { sku: 'DEMO-MEC-LUB-011', name: 'Líquido de frenos DOT 4, 1 L', brand: 'ATE', category: 'Lubricantes', description: 'Líquido DOT 4 para mantenimiento del sistema hidráulico de frenos.', warranty: 'No aplica', purchasePrice: 500, sellingPrice: 850, openingStock: 20, lowStockThreshold: 6, supplier: 2, supplierSKU: 'ATE-DOT4-1L' },
      { sku: 'DEMO-MEC-ENC-012', name: 'Juego de cables de bujía', brand: 'NGK', category: 'Encendido', description: 'Juego de cables de alta resistencia para motor de cuatro cilindros.', warranty: '12 meses', purchasePrice: 2400, sellingPrice: 3700, openingStock: 5, lowStockThreshold: 2, supplier: 2, supplierSKU: 'RC-ZE58' }
    ];

    const saleSpecs = [
      { customer: 0, minutes: 55, paymentMethod: 'Efectivo', items: [[0, 1], [8, 1], [10, 1]], notes: 'Mantenimiento preventivo; se verificó compatibilidad por modelo.' },
      { customer: 1, minutes: 125, paymentMethod: 'Tarjeta', items: [[1, 1], [10, 2]], notes: 'Pastillas y líquido de frenos para servicio programado.' },
      { customer: 2, days: 1, hour: 8, minute: 20, paymentMethod: 'Transferencia', items: [[3, 1], [2, 2]], notes: 'Batería y bujías; instalación realizada en taller.' },
      { customer: 3, days: 1, hour: 10, minute: 45, paymentMethod: 'Efectivo', items: [[0, 2], [5, 1]], notes: 'Retiro en mostrador, factura solicitada.' },
      { customer: 4, days: 4, paymentMethod: 'Tarjeta', items: [[4, 1]], notes: 'Alternador entregado con comprobante de prueba.' },
      { customer: 5, days: 7, paymentMethod: 'Transferencia', items: [[6, 2]], notes: 'Par de amortiguadores delanteros.' },
      { customer: 6, days: 10, paymentMethod: 'Efectivo', items: [[7, 1], [2, 2]] },
      { customer: 7, days: 14, paymentMethod: 'Tarjeta', items: [[1, 1], [8, 1]] },
      { customer: 0, days: 19, paymentMethod: 'Efectivo', items: [[9, 2]], notes: 'Dos termostatos para vehículos de la misma flotilla.' },
      { customer: 1, days: 24, paymentMethod: 'Transferencia', items: [[0, 3], [5, 1]] },
      { customer: 2, days: 30, paymentMethod: 'Efectivo', items: [[3, 1], [10, 1]] },
      { customer: 3, days: 36, paymentMethod: 'Tarjeta', items: [[4, 1], [1, 1]] },
      { customer: 4, days: 43, paymentMethod: 'Efectivo', items: [[5, 2], [7, 1]] },
      { customer: 5, days: 50, paymentMethod: 'Transferencia', items: [[9, 1], [6, 1]] },
      { customer: 6, days: 58, paymentMethod: 'Efectivo', items: [[2, 4], [8, 1], [10, 2]] },
      { customer: 7, days: 67, paymentMethod: 'Tarjeta', items: [[0, 3], [1, 1]] },
      { customer: 0, days: 75, paymentMethod: 'Transferencia', items: [[3, 1]] },
      { customer: 1, days: 86, paymentMethod: 'Efectivo', items: [[11, 1], [10, 1]] }
    ];

    const sales = saleSpecs.map((spec, index) => {
      const items = spec.items.map(([productIndex, quantity]) => {
        const product = productSpecs[productIndex];
        const subtotal = money(product.sellingPrice * quantity);
        return {
          product: productIds[productIndex], quantity,
          priceAtSale: product.sellingPrice,
          purchasePriceAtSale: product.purchasePrice,
          discountApplied: 0,
          subtotal
        };
      });
      const total = money(items.reduce((sum, item) => sum + item.subtotal, 0));
      const createdAt = spec.minutes !== undefined
        ? minutesAgo(spec.minutes)
        : daysAgo(spec.days, spec.hour ?? 12, spec.minute ?? 0);
      return {
        _id: seedId(401 + index),
        invoiceNumber: `TST-INV-${String(index + 1).padStart(4, '0')}`,
        user: userId,
        customer: customerIds[spec.customer],
        items,
        subtotal: total,
        totalDiscount: 0,
        total,
        paymentMethod: spec.paymentMethod,
        status: 'Completada',
        notes: spec.notes || '',
        returnRevision: 0,
        createdAt
      };
    });

    const returnSpecs = [
      { saleIndex: 1, productIndex: 1, quantity: 1, reason: 'Incorrecto', refundMethod: 'Efectivo', defective: false, notes: 'Empaque íntegro; se cambió la referencia por la aplicación correcta.' },
      { saleIndex: 2, productIndex: 2, quantity: 1, reason: 'Defectuoso', refundMethod: 'Crédito en Tienda', defective: true, notes: 'La pieza falló durante la instalación; quedó retenida para revisión del proveedor.' }
    ];
    const returns = returnSpecs.map((spec, index) => {
      const sale = sales[spec.saleIndex];
      const saleItem = sale.items.find(item => String(item.product) === String(productIds[spec.productIndex]));
      const originalPrice = saleItem.priceAtSale;
      const totalAmount = money(originalPrice * spec.quantity);
      const createdAt = index === 0 ? minutesAgo(22) : daysAgo(1, 15, 10);
      return {
        _id: seedId(701 + index),
        returnNumber: `TST-DEV-${String(index + 1).padStart(4, '0')}`,
        sale: sale._id,
        customer: sale.customer,
        items: [{
          product: productIds[spec.productIndex], quantity: spec.quantity,
          originalPrice, returnAmount: totalAmount, isDefective: spec.defective
        }],
        reason: spec.reason,
        notes: spec.notes,
        totalAmount,
        refundMethod: spec.refundMethod,
        status: 'Completada',
        processedBy: userId,
        approvedBy: userId,
        exchangeItems: [],
        priceDifference: 0,
        createdAt,
        updatedAt: createdAt
      };
    });

    const receivedOrderItems = [[0, 12], [5, 6]];
    const receivedByProduct = Array(productSpecs.length).fill(0);
    const soldByProduct = Array(productSpecs.length).fill(0);
    const returnedToStock = Array(productSpecs.length).fill(0);
    const defectiveReturns = Array(productSpecs.length).fill(0);
    for (const [productIndex, quantity] of receivedOrderItems) {
      receivedByProduct[productIndex] += quantity;
    }
    for (const sale of sales) {
      for (const item of sale.items) {
        const productIndex = productIds.findIndex(id => String(id) === String(item.product));
        soldByProduct[productIndex] += item.quantity;
      }
    }
    for (const spec of returnSpecs) {
      if (spec.defective) defectiveReturns[spec.productIndex] += spec.quantity;
      else returnedToStock[spec.productIndex] += spec.quantity;
    }

    const products = productSpecs.map((spec, index) => {
      const stock = spec.openingStock + receivedByProduct[index] - soldByProduct[index] + returnedToStock[index];
      if (stock < 0) throw new Error(`El inventario calculado sería negativo para ${spec.sku}.`);
      return {
        _id: productIds[index], sku: spec.sku, name: spec.name,
        description: spec.description, warranty: spec.warranty, brand: spec.brand,
        category: spec.category, purchasePrice: spec.purchasePrice,
        sellingPrice: spec.sellingPrice, stock,
        defectiveStock: defectiveReturns[index], lowStockThreshold: spec.lowStockThreshold,
        discountPercentage: 0, soldCount: soldByProduct[index],
        supplier: supplierIds[spec.supplier], supplierSKU: spec.supplierSKU,
        imageUrl: '/placeholder-product.png', isArchived: false,
        createdAt: daysAgo(150 - index * 3), updatedAt: daysAgo(1)
      };
    });

    const salesByCustomer = new Map(customerIds.map(id => [String(id), []]));
    for (const sale of sales) salesByCustomer.get(String(sale.customer)).push(sale);
    for (const customer of customers) {
      const customerSales = salesByCustomer.get(String(customer._id));
      customer.purchaseHistory = customerSales.map(sale => sale._id);
      customer.totalPurchases = money(customerSales.reduce((sum, sale) => sum + sale.total, 0));
    }

    const makeOrder = (number, supplierIndex, status, days, itemEntries, notes, receivedDaysAgo = null) => {
      const items = itemEntries.map(([productIndex, quantity]) => {
        const product = productSpecs[productIndex];
        return {
          product: productIds[productIndex], quantity,
          unitPrice: product.purchasePrice,
          subtotal: money(quantity * product.purchasePrice)
        };
      });
      const subtotal = money(items.reduce((sum, item) => sum + item.subtotal, 0));
      const tax = money(subtotal * 0.18);
      const orderDate = daysAgo(days);
      const expectedDeliveryDate = new Date(orderDate);
      expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);
      return {
        _id: seedId(601 + number - 1),
        orderNumber: `TST-OC-${String(number).padStart(4, '0')}`,
        supplier: supplierIds[supplierIndex],
        items, subtotal, tax, total: money(subtotal + tax), status,
        orderDate,
        expectedDeliveryDate,
        receivedDate: receivedDaysAgo === null ? undefined : daysAgo(receivedDaysAgo),
        notes,
        receiveNotes: receivedDaysAgo === null ? '' : 'Mercancía revisada contra la orden; cantidades completas y empaque en buen estado.',
        emailSent: false,
        createdBy: userId,
        createdAt: orderDate,
        updatedAt: receivedDaysAgo === null ? orderDate : daysAgo(receivedDaysAgo)
      };
    };

    const purchaseOrders = [
      makeOrder(1, 0, 'Recibida', 66, receivedOrderItems, 'Reposición mensual de filtros y correas.', 60),
      makeOrder(2, 1, 'Enviada', 3, [[1, 8], [6, 4]], 'Reposición de frenos y suspensión; entrega coordinada con el proveedor.'),
      makeOrder(3, 2, 'Pendiente', 0, [[3, 5], [10, 12]], 'Solicitud preparada para aprobación antes del próximo ciclo de mantenimiento.'),
      makeOrder(4, 1, 'Cancelada', 16, [[4, 1]], 'Cancelada por cambio de disponibilidad; no se recibió mercancía.')
    ];

    const makeQuotation = (number, { customer, genericCustomerName, status, createdDaysAgo, validDays, items, notes }) => {
      const quotationItems = makeQuotationItems(productSpecs, productIds, items);
      const subtotal = money(quotationItems.reduce((sum, item) => sum + item.subtotal, 0));
      const tax = money(subtotal * 0.18);
      const createdAt = daysAgo(createdDaysAgo);
      const validUntil = daysAgo(createdDaysAgo - validDays);
      return {
        _id: seedId(501 + number - 1),
        quotationNumber: `TST-COT-${String(number).padStart(4, '0')}`,
        customer: customer === undefined ? null : customerIds[customer],
        genericCustomerName,
        genericCustomerContact: genericCustomerName ? '809-555-0199' : undefined,
        items: quotationItems, subtotal, tax, total: money(subtotal + tax), status,
        validUntil, notes,
        terms: 'Precios en DOP. Cotización válida hasta la fecha indicada; no incluye instalación salvo que se detalle.',
        createdBy: userId,
        processedBy: ['Aprobada', 'Rechazada'].includes(status) ? userId : undefined,
        emailSent: false,
        createdAt, updatedAt: createdAt
      };
    };

    const quotations = [
      makeQuotation(1, { customer: 0, status: 'Pendiente', createdDaysAgo: 0, validDays: 7, items: [[0, 1], [8, 1], [10, 1]], notes: 'Mantenimiento preventivo solicitado para la próxima semana.' }),
      makeQuotation(2, { customer: 1, status: 'Aprobada', createdDaysAgo: 10, validDays: 7, items: [[1, 1], [7, 2]], notes: 'Aprobada por el cliente; pendiente coordinar fecha de instalación.' }),
      makeQuotation(3, { customer: 4, status: 'Rechazada', createdDaysAgo: 20, validDays: 10, items: [[6, 2], [7, 2]], notes: 'El cliente decidió aplazar el trabajo.' }),
      makeQuotation(4, { customer: 6, status: 'Vencida', createdDaysAgo: 45, validDays: 7, items: [[3, 1], [4, 1]], notes: 'Cotización vencida sin confirmación del cliente.' }),
      makeQuotation(5, { genericCustomerName: 'Flotilla de transporte local', status: 'Pendiente', createdDaysAgo: 6, validDays: 8, items: [[0, 4], [10, 4]], notes: 'Previsión de consumibles para cuatro vehículos de la flotilla.' })
    ];

    const withdrawals = [
      {
        _id: seedId(801), withdrawalNumber: 'TST-RET-0001', amount: 5000,
        reason: 'Pago de servicio de grúa para traslado de un vehículo de cliente',
        category: 'business', withdrawnBy: userId, authorizedBy: userId,
        withdrawalDate: daysAgo(12, 14, 25), status: 'approved', receiptAttached: true,
        notes: 'Comprobante de servicio archivado en el expediente de caja.',
        createdAt: daysAgo(12, 14, 25), updatedAt: daysAgo(12, 14, 25)
      },
      {
        _id: seedId(802), withdrawalNumber: 'TST-RET-0002', amount: 3200,
        reason: 'Compra urgente de material de limpieza para el área de taller',
        category: 'business', withdrawnBy: userId, authorizedBy: null,
        withdrawalDate: daysAgo(2, 11, 10), status: 'pending', receiptAttached: false,
        notes: 'Pendiente de revisión del responsable de caja.',
        createdAt: daysAgo(2, 11, 10), updatedAt: daysAgo(2, 11, 10)
      },
      {
        _id: seedId(803), withdrawalNumber: 'TST-RET-0003', amount: 1800,
        reason: 'Solicitud de anticipo para gasto personal',
        category: 'personal', withdrawnBy: userId, authorizedBy: userId,
        withdrawalDate: daysAgo(9, 16, 40), status: 'rejected', receiptAttached: false,
        notes: 'Solicitud rechazada; el motivo no corresponde a un gasto autorizado de caja.',
        createdAt: daysAgo(9, 16, 40), updatedAt: daysAgo(9, 9, 5)
      }
    ];

    const yesterdayStart = daysAgo(1, 0, 0);
    const yesterdayEnd = daysAgo(1, 23, 59);
    const sessionSales = sales.filter(sale => sale.createdAt >= yesterdayStart && sale.createdAt <= yesterdayEnd);
    let cashierSessions = [];
    let sessionSkippedReason = '';
    if (sessionSales.length) {
      const [otherSales, otherApprovedWithdrawals] = await Promise.all([
        Sale.countDocuments({
          user: userId,
          createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
          _id: { $nin: sales.map(sale => sale._id) }
        }),
        CashWithdrawal.countDocuments({
          withdrawnBy: userId,
          status: 'approved',
          withdrawalDate: { $gte: yesterdayStart, $lte: yesterdayEnd },
          _id: { $nin: withdrawals.map(withdrawal => withdrawal._id) }
        })
      ]);
      if (otherSales || otherApprovedWithdrawals) {
        sessionSkippedReason = 'Hay movimientos previos ajenos al seed en esa jornada; se omite el cierre para no mezclarlos.';
      } else {
        const systemTotals = { totalSales: sessionSales.length, totalAmount: 0, cash: 0, card: 0, transfer: 0 };
        for (const sale of sessionSales) {
          systemTotals.totalAmount += sale.total;
          if (sale.paymentMethod === 'Efectivo') systemTotals.cash += sale.total;
          if (sale.paymentMethod === 'Tarjeta') systemTotals.card += sale.total;
          if (sale.paymentMethod === 'Transferencia') systemTotals.transfer += sale.total;
        }
        systemTotals.totalAmount = money(systemTotals.totalAmount);
        systemTotals.cash = money(systemTotals.cash);
        systemTotals.card = money(systemTotals.card);
        systemTotals.transfer = money(systemTotals.transfer);
        const countedTotals = {
          cash: money(Math.max(0, systemTotals.cash - 50)),
          card: systemTotals.card,
          transfer: systemTotals.transfer
        };
        const differences = {
          cash: money(countedTotals.cash - systemTotals.cash),
          card: 0,
          transfer: 0,
          total: money(countedTotals.cash + countedTotals.card + countedTotals.transfer - systemTotals.totalAmount)
        };
        cashierSessions = [{
          _id: seedId(901), cashier: userId,
          openedAt: daysAgo(1, 8, 0), closedAt: daysAgo(1, 23, 50),
          systemTotals, countedTotals, differences,
          notes: 'Se verificaron los pagos electrónicos. Diferencia de RD$50.00 en efectivo reportada al supervisor.',
          sales: sessionSales.map(sale => sale._id), totalWithdrawals: 0, withdrawals: [],
          createdAt: daysAgo(1, 23, 50), updatedAt: daysAgo(1, 23, 50)
        }];
      }
    }

    const batches = [
      { label: 'proveedores', Model: Supplier, keyField: 'email', documents: suppliers },
      { label: 'clientes', Model: Customer, keyField: 'email', documents: customers },
      { label: 'productos', Model: Product, keyField: 'sku', documents: products },
      { label: 'ventas', Model: Sale, keyField: 'invoiceNumber', documents: sales },
      { label: 'cotizaciones', Model: Quotation, keyField: 'quotationNumber', documents: quotations },
      { label: 'órdenes de compra', Model: PurchaseOrder, keyField: 'orderNumber', documents: purchaseOrders },
      { label: 'devoluciones', Model: Return, keyField: 'returnNumber', documents: returns },
      { label: 'retiros de caja', Model: CashWithdrawal, keyField: 'withdrawalNumber', documents: withdrawals },
      { label: 'cierres de caja', Model: CashierSession, keyField: null, documents: cashierSessions }
    ];

    const preparedBatches = [];
    for (const batch of batches) {
      const documents = await normalizeDocuments(batch.Model, batch.documents);
      await assertSeedOwnership(batch.Model, documents, batch.keyField, batch.label);
      preparedBatches.push({ ...batch, documents });
    }

    const logsBefore = {
      logs: await collectionCount('logs'),
      auditLogs: await collectionCount('audit_logs')
    };

    console.log(`Base de datos validada: ${TEST_DATABASE}`);
    console.log(`Responsable: usuario activo existente (rol ${responsibleUser.role}); no se crearán cuentas.`);
    console.log('Registros preparados:');
    for (const { label, documents } of preparedBatches) console.log(`  ${label}: ${documents.length}`);
    console.log('  usuarios nuevos: 0');
    console.log('  logs y auditorías nuevos: 0');
    if (sessionSkippedReason) console.log(`  cierre de caja: omitido. ${sessionSkippedReason}`);

    if (isDryRun) {
      console.log('\nVista previa terminada. No se escribió ningún registro.');
      return;
    }

    for (const { Model, documents } of preparedBatches) {
      await writeDocuments(Model, documents);
    }

    const persistedCounts = await Promise.all(preparedBatches.map(async ({ label, Model, documents }) => ({
      label,
      expected: documents.length,
      persisted: await Model.countDocuments({ _id: { $in: documents.map(document => document._id) } })
    })));
    const missingRecords = persistedCounts.filter(({ expected, persisted }) => expected !== persisted);
    if (missingRecords.length) {
      throw new Error(`La verificación encontró registros faltantes: ${missingRecords.map(({ label, persisted, expected }) => `${label} (${persisted}/${expected})`).join(', ')}.`);
    }

    const [logsAfter, auditLogsAfter] = await Promise.all([
      collectionCount('logs'),
      collectionCount('audit_logs')
    ]);
    const afterCounts = { logs: logsAfter, auditLogs: auditLogsAfter };

    console.log('\nSeed aplicado correctamente.');
    console.log('Los registros con folio TST- o SKU DEMO-MEC- se pueden volver a sembrar sin duplicarse.');
    console.log(`Verificación de persistencia: ${persistedCounts.map(({ label, persisted }) => `${label} ${persisted}`).join(', ')}.`);
    console.log('Los usuarios, permisos, configuración y logs existentes quedaron fuera del seed.');
    if (logsBefore.logs !== afterCounts.logs || logsBefore.auditLogs !== afterCounts.auditLogs) {
      console.warn('Los conteos de logs cambiaron durante la ejecución; el seed no escribe en esas colecciones.');
    } else {
      console.log('Verificación: los conteos de logs y auditorías no cambiaron.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(`No se pudo preparar el seed: ${error.message}`);
  if (mongoose.connection.readyState !== 0) mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
