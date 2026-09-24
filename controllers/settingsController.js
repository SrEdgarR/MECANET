import Settings from '../models/Settings.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Return from '../models/Return.js';
import CashWithdrawal from '../models/CashWithdrawal.js';
import { verifySmtpConfig } from '../services/emailService.js';
import AuditLogService from '../services/auditLogService.js';
import { auditChanges } from '../services/auditChanges.js';

const settingLabels = { businessName: 'Nombre del negocio', businessLogoUrl: 'Logo', businessAddress: 'Dirección', businessPhone: 'Teléfono', businessEmail: 'Email', autoUpdate: 'Actualizaciones automáticas', taxRate: 'Impuesto', currency: 'Moneda', receiptFooter: 'Pie del comprobante', lowStockAlert: 'Alerta de stock bajo', weatherLocation: 'Ubicación del clima', showWeather: 'Mostrar clima', autoCreatePurchaseOrders: 'Órdenes automáticas', requireOrderReception: 'Recepción obligatoria', autoOrderThreshold: 'Umbral de órdenes', toastPosition: 'Posición de avisos', logRetention: 'Retención de logs' };
const settingSection = {
  businessName: 'configuracion/negocio', businessLogoUrl: 'configuracion/negocio', businessAddress: 'configuracion/negocio', businessPhone: 'configuracion/negocio', businessEmail: 'configuracion/negocio',
  taxRate: 'configuracion/facturacion', currency: 'configuracion/facturacion', receiptFooter: 'configuracion/facturacion',
  weatherLocation: 'configuracion/integraciones', weatherApiKey: 'configuracion/integraciones', showWeather: 'configuracion/integraciones', smtp: 'configuracion/integraciones'
};
const logSettings = (req, settings, description, changes) => changes.length && AuditLogService.log({
  user: req.user, module: 'configuracion', action: 'Modificación de Configuración',
  entity: { type: 'Configuración', id: settings._id, name: 'Configuración del sistema' },
  description, changes, req
});

const settingsResponse = (settings, privileged = true) => {
  const { weatherApiKey, smtp, ...visible } = settings.toObject();
  return {
    ...visible, weatherApiKey: '', weatherApiKeyConfigured: Boolean(weatherApiKey),
    ...(privileged ? { smtp: { ...smtp, password: '' } } : {})
  };
};

export const getPublicSettings = async (req, res) => {
  try {
    const settings = await Settings.getInstance();
    res.json({ businessName: settings.businessName, businessLogoUrl: settings.businessLogoUrl, toastPosition: settings.toastPosition });
  } catch {
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
};

export const getSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne().select('+weatherApiKey') || await Settings.create({});
    res.json(settingsResponse(settings, ['admin', 'desarrollador'].includes(req.user.role)));
  } catch {
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
};

// @desc    Actualizar configuración del sistema
// @route   PUT /api/settings
// @access  Private/Admin
export const updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne().select('+weatherApiKey') || await Settings.create({});
    const previous = settings.toObject();

    // Actualizar campos
    const allowed = ['businessName', 'businessLogoUrl', 'businessAddress', 'businessPhone', 'businessEmail', 'autoUpdate', 'smtp', 'taxRate', 'currency', 'receiptFooter', 'lowStockAlert', 'weatherLocation', 'weatherApiKey', 'showWeather', 'autoCreatePurchaseOrders', 'requireOrderReception', 'autoOrderThreshold', 'toastPosition', 'logRetention'];
    Object.keys(req.body).filter(key => allowed.includes(key)).forEach(key => {
      if (key === 'weatherApiKey' && req.body[key] === '') return;
      if (req.body[key] !== undefined) {
        // Para smtp, hacer merge de objetos en lugar de reemplazar
        if (key === 'smtp' && typeof req.body[key] === 'object') {
          if (!settings.smtp) {
            settings.smtp = {};
          }
          // Solo actualizar campos SMTP que no estén vacíos
          Object.keys(req.body[key]).forEach(smtpKey => {
            const value = req.body[key][smtpKey];
            // No sobrescribir password si viene vacío (es por seguridad del frontend)
            if (smtpKey === 'password' && value === '') {
              return;
            }
            settings.smtp[smtpKey] = value;
          });
        } else {
          settings[key] = req.body[key];
        }
      }
    });

    const changes = auditChanges(previous, settings, settingLabels);
    if (req.body.smtp && JSON.stringify(previous.smtp) !== JSON.stringify(settings.smtp?.toObject?.() || settings.smtp)) {
      changes.push({ field: 'smtp', fieldLabel: 'Configuración SMTP', oldValue: 'Protegida', newValue: 'Modificada' });
    }
    if (req.body.weatherApiKey && previous.weatherApiKey !== settings.weatherApiKey) changes.push({ field: 'weatherApiKey', fieldLabel: 'Clave de clima', oldValue: 'Protegida', newValue: 'Modificada' });
    if (changes.some(change => !req.effectiveSections?.includes(settingSection[change.field] || 'configuracion/sistema'))) {
      return res.status(403).json({ message: 'No tienes acceso para cambiar esta parte de la configuración' });
    }
    settings.updatedAt = Date.now();
    await settings.save();
    await logSettings(req, settings, 'Se modificó la configuración del sistema', changes);

    res.json(settingsResponse(settings));
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({ message: 'Error al actualizar configuración', error: error.message });
  }
};

// @desc    Actualizar configuración SMTP
// @route   PUT /api/settings/smtp
// @access  Private/Admin
export const updateSmtpSettings = async (req, res) => {
  try {
    const { host, port, secure, user, password, fromName, fromEmail, enabled } = req.body;
    
    let settings = await Settings.findOne().select('+weatherApiKey');
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Configuración no encontrada. Inicialice el sistema primero.'
      });
    }
    const previousSmtp = settings.smtp?.toObject?.() || settings.smtp || {};
    
    // Asegurar que smtp existe
    if (!settings.smtp) {
      settings.smtp = {};
    }
    
    // Actualizar solo campos SMTP proporcionados
    if (enabled !== undefined) settings.smtp.enabled = enabled;
    if (host !== undefined) settings.smtp.host = host;
    if (port !== undefined) settings.smtp.port = port;
    if (secure !== undefined) settings.smtp.secure = secure;
    if (user !== undefined) settings.smtp.user = user;
    if (password !== undefined && password !== '') settings.smtp.password = password;
    if (fromName !== undefined) settings.smtp.fromName = fromName;
    if (fromEmail !== undefined) settings.smtp.fromEmail = fromEmail;
    
    settings.updatedAt = Date.now();
    await settings.save();
    const smtpLabels = { enabled: 'SMTP habilitado', host: 'Servidor SMTP', port: 'Puerto SMTP', secure: 'Conexión segura', user: 'Usuario SMTP', fromName: 'Nombre remitente', fromEmail: 'Email remitente' };
    const changes = auditChanges(previousSmtp, settings.smtp, smtpLabels);
    if (password) changes.push({ field: 'smtpPassword', fieldLabel: 'Contraseña SMTP', oldValue: 'Protegida', newValue: 'Modificada' });
    await logSettings(req, settings, 'Se modificó la configuración SMTP', changes);
    
    const settingsResult = settingsResponse(settings);

    res.json({
      success: true,
      message: 'Configuración SMTP actualizada correctamente',
      data: settingsResult
    });
    
  } catch (error) {
    console.error('Error al actualizar SMTP:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar configuración SMTP',
      error: error.message
    });
  }
};

// @desc    Probar conexión SMTP
// @route   POST /api/settings/smtp/test
// @access  Private/Admin
export const testSmtpConnection = async (req, res) => {
  try {
    const result = await verifySmtpConfig();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
  } catch (error) {
    console.error('Error al probar SMTP:', error);
    res.status(500).json({
      success: false,
      message: 'Error al probar conexión SMTP',
      error: error.message
    });
  }
};

// @desc    Obtener información de la empresa
// @route   GET /api/settings/company
// @access  Public
export const getCompanyInfo = async (req, res) => {
  try {
    const settings = await Settings.getInstance();
    
    const companyInfo = {
      name: settings.businessName,
      address: settings.businessAddress,
      phone: settings.businessPhone,
      email: settings.businessEmail,
      logoUrl: settings.businessLogoUrl,
      taxRate: settings.taxRate,
      currency: settings.currency
    };
    
    res.json(companyInfo);
  } catch (error) {
    console.error('Error al obtener información de la empresa:', error);
    res.status(500).json({ message: 'Error al obtener información de la empresa', error: error.message });
  }
};

// @desc    Actualizar información de la empresa
// @route   PUT /api/settings/company
// @access  Private/Admin
export const updateCompanyInfo = async (req, res) => {
  try {
    const { name, address, phone, email, logoUrl, taxRate, currency } = req.body;
    
    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'El nombre de la empresa es requerido' });
    }
    
    if (email && !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    
    if (taxRate !== undefined && (taxRate < 0 || taxRate > 100)) {
      return res.status(400).json({ message: 'La tasa de impuesto debe estar entre 0 y 100' });
    }
    
    let settings = await Settings.getInstance();
    const previous = settings.toObject();
    
    if (name !== undefined) settings.businessName = name;
    if (address !== undefined) settings.businessAddress = address;
    if (phone !== undefined) settings.businessPhone = phone;
    if (email !== undefined) settings.businessEmail = email;
    if (logoUrl !== undefined) settings.businessLogoUrl = logoUrl;
    if (taxRate !== undefined) settings.taxRate = taxRate;
    if (currency !== undefined) settings.currency = currency;
    
    settings.updatedAt = Date.now();
    await settings.save();
    await logSettings(req, settings, 'Se modificaron los datos del negocio', auditChanges(previous, settings, settingLabels));
    
    res.json({
      success: true,
      message: 'Información de la empresa actualizada correctamente',
      data: {
        name: settings.businessName,
        address: settings.businessAddress,
        phone: settings.businessPhone,
        email: settings.businessEmail,
        logoUrl: settings.businessLogoUrl,
        taxRate: settings.taxRate,
        currency: settings.currency
      }
    });
  } catch (error) {
    console.error('Error al actualizar información de la empresa:', error);
    res.status(500).json({ message: 'Error al actualizar información de la empresa', error: error.message });
  }
};

// @desc    Obtener preferencias de notificaciones del usuario
// @route   GET /api/settings/notifications
// @access  Private
export const getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    // Si no tiene preferencias, crear con valores por defecto
    if (!user.notificationPreferences) {
      user.notificationPreferences = {
        lowStockAlerts: true,
        expirationAlerts: true,
        salesAlerts: true,
        paymentReminders: true
      };
      await user.save();
    }
    
    res.json({
      success: true,
      data: user.notificationPreferences
    });
  } catch (error) {
    console.error('Error al obtener preferencias de notificaciones:', error);
    res.status(500).json({ message: 'Error al obtener preferencias de notificaciones', error: error.message });
  }
};

// @desc    Actualizar preferencias de notificaciones del usuario
// @route   PUT /api/settings/notifications
// @access  Private
export const updateNotificationPreferences = async (req, res) => {
  try {
    const { lowStockAlerts, expirationAlerts, salesAlerts, paymentReminders } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const previous = user.notificationPreferences?.toObject?.() || {};
    
    // Inicializar si no existe
    if (!user.notificationPreferences) {
      user.notificationPreferences = {};
    }
    
    // Actualizar solo los campos proporcionados
    if (lowStockAlerts !== undefined) user.notificationPreferences.lowStockAlerts = lowStockAlerts;
    if (expirationAlerts !== undefined) user.notificationPreferences.expirationAlerts = expirationAlerts;
    if (salesAlerts !== undefined) user.notificationPreferences.salesAlerts = salesAlerts;
    if (paymentReminders !== undefined) user.notificationPreferences.paymentReminders = paymentReminders;
    
    await user.save();
    const changes = auditChanges(previous, user.notificationPreferences, { lowStockAlerts: 'Alertas de stock', expirationAlerts: 'Alertas de vencimiento', salesAlerts: 'Alertas de ventas', paymentReminders: 'Recordatorios de pagos' });
    if (changes.length) await AuditLogService.log({ user: req.user, module: 'configuracion', action: 'Modificación de Configuración',
      entity: { type: 'Configuración', id: user._id, name: `Notificaciones de ${user.name}` },
      description: `Se cambiaron las preferencias de notificaciones de ${user.name}`, changes, req });
    
    res.json({
      success: true,
      message: 'Preferencias de notificaciones actualizadas correctamente',
      data: user.notificationPreferences
    });
  } catch (error) {
    console.error('Error al actualizar preferencias de notificaciones:', error);
    res.status(500).json({ message: 'Error al actualizar preferencias de notificaciones', error: error.message });
  }
};

// @desc    Exportar todos los datos del sistema
// @route   GET /api/settings/export
// @access  Private/Admin
export const exportData = async (req, res) => {
  try {
    console.log('Iniciando exportación de datos...');
    
    // Obtener todos los datos del sistema (excluyendo contraseñas)
    const [products, sales, customers, suppliers, purchaseOrders, returns, cashWithdrawals, users, settings] = await Promise.all([
      Product.find().lean(),
      Sale.find().populate('customer', 'name email').populate('user', 'name email').lean(),
      Customer.find().lean(),
      Supplier.find().lean(),
      PurchaseOrder.find().populate('supplier', 'name').lean(),
      Return.find().populate('sale').populate('customer', 'name').lean(),
      CashWithdrawal.find().populate('user', 'name email').lean(),
      User.find().select('-password').lean(), // Excluir contraseñas
      Settings.findOne().lean()
    ]);
    
    // Crear objeto con todos los datos
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        systemName: settings?.businessName || 'MECANET',
        totalRecords: {
          products: products.length,
          sales: sales.length,
          customers: customers.length,
          suppliers: suppliers.length,
          purchaseOrders: purchaseOrders.length,
          returns: returns.length,
          cashWithdrawals: cashWithdrawals.length,
          users: users.length
        }
      },
      data: {
        products,
        sales,
        customers,
        suppliers,
        purchaseOrders,
        returns,
        cashWithdrawals,
        users,
        settings
      }
    };
    
    console.log(`Exportación completada: ${exportData.metadata.totalRecords.products} productos, ${exportData.metadata.totalRecords.sales} ventas`);
    
    // Configurar headers para descarga
    const filename = `sgtm-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json(exportData);
  } catch (error) {
    console.error('Error al exportar datos:', error);
    res.status(500).json({ message: 'Error al exportar datos', error: error.message });
  }
};

// @desc    Importar datos al sistema
// @route   POST /api/settings/import
// @access  Private/Admin
export const importData = async (req, res) => {
  try {
    const { data, mode = 'merge' } = req.body; // mode: 'merge' o 'replace'
    
    console.log(`Iniciando importación de datos en modo: ${mode}`);
    
    // Validar estructura del archivo
    if (!data || !data.metadata || !data.data) {
      return res.status(400).json({ message: 'Estructura de datos inválida. Falta metadata o data.' });
    }
    
    // Validar versión (opcional, para compatibilidad futura)
    if (data.metadata.version !== '1.0.0') {
      console.warn(`Advertencia: Versión de exportación ${data.metadata.version} puede no ser compatible`);
    }
    
    const importedData = data.data;
    const results = {
      success: true,
      imported: {},
      errors: []
    };
    
    // Si es modo 'replace', eliminar datos existentes (excepto usuarios y settings)
    if (mode === 'replace') {
      console.log('Modo REPLACE: Eliminando datos existentes...');
      await Promise.all([
        Product.deleteMany({}),
        // NO eliminar ventas históricas, solo nuevas
        Customer.deleteMany({}),
        Supplier.deleteMany({}),
        PurchaseOrder.deleteMany({}),
        Return.deleteMany({}),
        CashWithdrawal.deleteMany({})
      ]);
    }
    
    // Importar productos
    if (importedData.products && Array.isArray(importedData.products)) {
      try {
        for (const product of importedData.products) {
          delete product._id; // Eliminar _id para evitar conflictos
          await Product.findOneAndUpdate(
            { sku: product.sku }, // Buscar por SKU único
            product,
            { upsert: true, new: true }
          );
        }
        results.imported.products = importedData.products.length;
        console.log(`Importados ${results.imported.products} productos`);
      } catch (error) {
        results.errors.push({ model: 'products', error: error.message });
        console.error('Error importando productos:', error);
      }
    }
    
    // Importar clientes
    if (importedData.customers && Array.isArray(importedData.customers)) {
      try {
        for (const customer of importedData.customers) {
          delete customer._id;
          await Customer.findOneAndUpdate(
            { email: customer.email },
            customer,
            { upsert: true, new: true }
          );
        }
        results.imported.customers = importedData.customers.length;
        console.log(`Importados ${results.imported.customers} clientes`);
      } catch (error) {
        results.errors.push({ model: 'customers', error: error.message });
        console.error('Error importando clientes:', error);
      }
    }
    
    // Importar proveedores
    if (importedData.suppliers && Array.isArray(importedData.suppliers)) {
      try {
        for (const supplier of importedData.suppliers) {
          delete supplier._id;
          await Supplier.findOneAndUpdate(
            { email: supplier.email },
            supplier,
            { upsert: true, new: true }
          );
        }
        results.imported.suppliers = importedData.suppliers.length;
        console.log(`Importados ${results.imported.suppliers} proveedores`);
      } catch (error) {
        results.errors.push({ model: 'suppliers', error: error.message });
        console.error('Error importando proveedores:', error);
      }
    }
    
    // Importar órdenes de compra
    if (importedData.purchaseOrders && Array.isArray(importedData.purchaseOrders)) {
      try {
        for (const order of importedData.purchaseOrders) {
          delete order._id;
          // Recrear orden (sin buscar duplicados por simplicidad)
          if (mode === 'replace') {
            await PurchaseOrder.create(order);
          }
        }
        results.imported.purchaseOrders = importedData.purchaseOrders.length;
        console.log(`Importadas ${results.imported.purchaseOrders} órdenes de compra`);
      } catch (error) {
        results.errors.push({ model: 'purchaseOrders', error: error.message });
        console.error('Error importando órdenes:', error);
      }
    }
    
    // NO importar ventas (muy sensible, puede causar inconsistencias)
    results.imported.sales = 0; // Las ventas NO se importan por seguridad
    
    // Importar configuración (solo ciertos campos)
    if (importedData.settings) {
      try {
        const settings = await Settings.getInstance();
        // Solo importar campos seguros
        if (importedData.settings.businessName) settings.businessName = importedData.settings.businessName;
        if (importedData.settings.businessAddress) settings.businessAddress = importedData.settings.businessAddress;
        if (importedData.settings.businessPhone) settings.businessPhone = importedData.settings.businessPhone;
        if (importedData.settings.businessEmail) settings.businessEmail = importedData.settings.businessEmail;
        if (importedData.settings.taxRate !== undefined) settings.taxRate = importedData.settings.taxRate;
        if (importedData.settings.currency) settings.currency = importedData.settings.currency;
        await settings.save();
        results.imported.settings = 1;
        console.log('Configuración importada');
      } catch (error) {
        results.errors.push({ model: 'settings', error: error.message });
        console.error('Error importando configuración:', error);
      }
    }
    
    // Mensaje final
    const totalImported = Object.values(results.imported).reduce((sum, count) => sum + count, 0);
    
    if (results.errors.length > 0) {
      results.success = false;
      results.message = `Importación completada con ${results.errors.length} errores. ${totalImported} registros importados.`;
    } else {
      results.message = `Importación exitosa. ${totalImported} registros importados.`;
    }
    
    console.log(results.message);
    res.json(results);
    
  } catch (error) {
    console.error('Error al importar datos:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error crítico al importar datos', 
      error: error.message 
    });
  }
};

// @desc    Limpiar datos de prueba del sistema
// @route   DELETE /api/settings/clean-test-data
// @access  Private/Admin
export const cleanTestData = async (req, res) => {
  try {
    const { confirmation } = req.body;
    
    // Doble confirmación requerida
    if (confirmation !== 'ELIMINAR DATOS DE PRUEBA') {
      return res.status(400).json({ 
        message: 'Confirmación incorrecta. Debe escribir exactamente: ELIMINAR DATOS DE PRUEBA' 
      });
    }
    
    console.log('⚠️ Iniciando limpieza de datos de prueba...');
    
    const results = {
      success: true,
      deleted: {}
    };
    
    // Identificar y eliminar productos de prueba
    // Criterio: nombre contiene "test", "prueba", o stock = 0 y precio < 10
    const testProducts = await Product.deleteMany({
      $or: [
        { name: { $regex: /test|prueba|demo/i } },
        { sku: { $regex: /test|demo/i } },
        { $and: [{ stock: 0 }, { price: { $lt: 10 } }] }
      ]
    });
    results.deleted.products = testProducts.deletedCount;
    
    // Eliminar clientes de prueba
    const testCustomers = await Customer.deleteMany({
      $or: [
        { name: { $regex: /test|prueba|demo/i } },
        { email: { $regex: /test|demo|example/i } }
      ]
    });
    results.deleted.customers = testCustomers.deletedCount;
    
    // Eliminar proveedores de prueba
    const testSuppliers = await Supplier.deleteMany({
      $or: [
        { name: { $regex: /test|prueba|demo/i } },
        { email: { $regex: /test|demo|example/i } }
      ]
    });
    results.deleted.suppliers = testSuppliers.deletedCount;
    
    // Eliminar órdenes de compra pendientes antiguas (más de 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const oldOrders = await PurchaseOrder.deleteMany({
      status: 'pendiente',
      createdAt: { $lt: sixMonthsAgo }
    });
    results.deleted.oldPurchaseOrders = oldOrders.deletedCount;
    
    // Eliminar retiros de caja rechazados antiguos
    const oldRejectedWithdrawals = await CashWithdrawal.deleteMany({
      status: 'rechazado',
      createdAt: { $lt: sixMonthsAgo }
    });
    results.deleted.oldRejectedWithdrawals = oldRejectedWithdrawals.deletedCount;
    
    // NO eliminar ventas (son datos históricos importantes)
    // NO eliminar usuarios (son datos críticos del sistema)
    // NO eliminar configuración
    
    const totalDeleted = Object.values(results.deleted).reduce((sum, count) => sum + count, 0);
    results.message = `Limpieza completada. ${totalDeleted} registros eliminados.`;
    
    console.log(`✅ ${results.message}`);
    console.log('Detalle:', results.deleted);
    
    res.json(results);
    
  } catch (error) {
    console.error('Error al limpiar datos de prueba:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al limpiar datos de prueba', 
      error: error.message 
    });
  }
};
