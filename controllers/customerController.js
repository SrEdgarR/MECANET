import { searchLiteral } from '../services/searchLiteral.js';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import AuditLogService from '../services/auditLogService.js';
import { auditChanges } from '../services/auditChanges.js';

const customerLabels = { fullName: 'Nombre', cedula: 'Cédula/RNC', phone: 'Teléfono', email: 'Email', address: 'Dirección', isArchived: 'Archivado' };

// @desc    Obtener todos los clientes (con paginación)
// @route   GET /api/customers
// @access  Private
export const getCustomers = async (req, res) => {
  try {
    const { search, includeArchived, page = 1, limit = 50 } = req.query;

    let query = {};

    // Excluir archivados por defecto
    if (includeArchived !== 'true') {
      query.isArchived = { $ne: true };
    }

    // Búsqueda por nombre, cédula, teléfono o email
    if (search) {
      query.$or = [
        { fullName: { $regex: searchLiteral(search), $options: 'i' } },
        { cedula: { $regex: searchLiteral(search), $options: 'i' } },
        { phone: { $regex: searchLiteral(search), $options: 'i' } },
        { email: { $regex: searchLiteral(search), $options: 'i' } }
      ];
    }

    // Paginación
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Contar total
    const totalDocs = await Customer.countDocuments(query);

    // Usar agregación para calcular totalPurchases dinámicamente
    // Esto corrige discrepancias si hubo ventas canceladas que no actualizaron el campo en el modelo
    const customers = await Customer.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: 'sales',
          localField: '_id',
          foreignField: 'customer',
          as: 'salesData'
        }
      },
      {
        $addFields: {
          // Calcular totalPurchases sumando solo ventas NO canceladas
          totalPurchases: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$salesData',
                    as: 'sale',
                    cond: { $ne: ['$$sale.status', 'Cancelada'] }
                  }
                },
                as: 'sale',
                in: '$$sale.total'
              }
            }
          },
          // Actualizar purchaseHistory para excluir ventas canceladas
          purchaseHistory: {
            $map: {
              input: {
                $filter: {
                  input: '$salesData',
                  as: 'sale',
                  cond: { $ne: ['$$sale.status', 'Cancelada'] }
                }
              },
              as: 'sale',
              in: '$$sale._id'
            }
          }
        }
      },
      {
        $project: {
          salesData: 0 // No enviar toda la data de ventas para mantener la respuesta ligera
        }
      }
    ]);

    res.json({
      customers,
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
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ message: 'Error al obtener clientes', error: error.message });
  }
};

// @desc    Obtener un cliente por ID
// @route   GET /api/customers/:id
// @access  Private
export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate({
        path: 'purchaseHistory',
        match: { status: { $ne: 'Cancelada' } }, // Excluir ventas canceladas del historial
        populate: {
          path: 'items.product',
          select: 'name sku'
        }
      });

    if (!customer) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // Recalcular totalPurchases basado en el historial filtrado (opcional, pero asegura consistencia)
    const calculatedTotal = customer.purchaseHistory.reduce((sum, sale) => sum + (sale.total || 0), 0);

    // Convertir a objeto para modificar el campo sin guardar en DB
    const customerObj = customer.toObject();
    customerObj.totalPurchases = calculatedTotal;

    res.json(customerObj);
  } catch (error) {
    console.error('Error al obtener cliente:', error);
    res.status(500).json({ message: 'Error al obtener cliente', error: error.message });
  }
};

// @desc    Crear nuevo cliente
// @route   POST /api/customers
// @access  Private
export const createCustomer = async (req, res) => {
  try {
    console.log('📝 Datos recibidos para crear cliente:', req.body);

    const { fullName, cedula, phone, email, address } = req.body;

    // Validar que fullName y cedula existen
    if (!fullName || fullName.trim() === '') {
      console.error('❌ Error: fullName vacío o no proporcionado');
      return res.status(400).json({ message: 'El nombre completo es requerido' });
    }

    if (!cedula || cedula.trim() === '') {
      console.error('❌ Error: cedula vacía o no proporcionada');
      return res.status(400).json({ message: 'La cédula es requerida' });
    }

    // Limpiar y normalizar campos
    const cleanCedula = cedula.trim();
    const cleanPhone = phone && phone.trim() !== '' ? phone.trim() : undefined;
    const cleanEmail = email && email.trim() !== '' ? email.trim().toLowerCase() : undefined;
    const cleanAddress = address && address.trim() !== '' ? address.trim() : undefined;

    console.log('🧹 Datos limpios:', { fullName: fullName.trim(), cleanCedula, cleanPhone, cleanEmail, cleanAddress });

    // Verificar si ya existe un cliente con esa cédula
    const existingCedula = await Customer.findOne({ cedula: cleanCedula });
    if (existingCedula) {
      return res.status(400).json({ message: 'Ya existe un cliente con esa cédula' });
    }

    // Verificar si ya existe un cliente con ese teléfono
    if (cleanPhone) {
      const existingPhone = await Customer.findOne({ phone: cleanPhone });
      if (existingPhone) {
        return res.status(400).json({ message: 'Ya existe un cliente con ese número de teléfono' });
      }
    }

    // Verificar si ya existe un cliente con ese email
    if (cleanEmail) {
      const existingEmail = await Customer.findOne({ email: cleanEmail });
      if (existingEmail) {
        return res.status(400).json({ message: 'Ya existe un cliente con ese email' });
      }
    }

    // Preparar datos del cliente
    const customerData = {
      fullName: fullName.trim(),
      cedula: cleanCedula
    };

    if (cleanPhone) customerData.phone = cleanPhone;
    if (cleanEmail) customerData.email = cleanEmail;
    if (cleanAddress) customerData.address = cleanAddress;

    console.log('💾 Datos a crear en DB:', customerData);
    const customer = await Customer.create(customerData);
    console.log('✅ Cliente creado exitosamente:', customer._id);
    await AuditLogService.logCustomer({ user: req.user, action: 'Creación de Cliente',
      customerId: customer._id, customerName: customer.fullName,
      description: `Se creó el cliente ${customer.fullName}`,
      changes: auditChanges(null, customer, customerLabels), req });

    res.status(201).json(customer);
  } catch (error) {
    console.error('❌ Error al crear cliente:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.code === 11000) {
      console.error('Error de duplicado en:', error.keyPattern);
      return res.status(400).json({ message: 'Ya existe un cliente con esos datos' });
    }
    res.status(500).json({ message: 'Error al crear cliente', error: error.message });
  }
};

// @desc    Actualizar cliente
// @route   PUT /api/customers/:id
// @access  Private
export const updateCustomer = async (req, res) => {
  try {
    const allowed = ['fullName', 'cedula', 'phone', 'email', 'address'];
    if (Object.entries(req.body).some(([key, value]) => !allowed.includes(key) || typeof value !== 'string')) {
      return res.status(400).json({ message: 'Solo se pueden modificar los datos de contacto del cliente' });
    }
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // Verificar duplicados si se actualiza cédula
    if (req.body.cedula && req.body.cedula !== customer.cedula) {
      const existingCedula = await Customer.findOne({ cedula: req.body.cedula });
      if (existingCedula) {
        return res.status(400).json({ message: 'Ya existe un cliente con esa cédula' });
      }
    }

    // Verificar duplicados si se actualiza teléfono o email
    if (req.body.phone && req.body.phone !== customer.phone) {
      const existingPhone = await Customer.findOne({ phone: req.body.phone });
      if (existingPhone) {
        return res.status(400).json({ message: 'Ya existe un cliente con ese número de teléfono' });
      }
    }

    if (req.body.email && req.body.email !== customer.email) {
      const existingEmail = await Customer.findOne({ email: req.body.email });
      if (existingEmail) {
        return res.status(400).json({ message: 'Ya existe un cliente con ese email' });
      }
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: Object.fromEntries(allowed.filter(key => key in req.body).map(key => [key, req.body[key]])) },
      { new: true, runValidators: true }
    );

    const changes = auditChanges(customer, updatedCustomer, customerLabels);
    if (changes.length) await AuditLogService.logCustomer({ user: req.user, action: 'Modificación de Cliente',
      customerId: updatedCustomer._id, customerName: updatedCustomer.fullName,
      description: `Se modificó el cliente ${updatedCustomer.fullName}`, changes, req });

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ message: 'Error al actualizar cliente', error: error.message });
  }
};

// @desc    Eliminar cliente
// @route   DELETE /api/customers/:id
// @access  Private/Admin
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // Verificar si el cliente tiene ventas asociadas (excluyendo canceladas)
    const activeSalesCount = await Sale.countDocuments({
      customer: customer._id,
      status: { $ne: 'Cancelada' }
    });

    if (activeSalesCount > 0) {
      // Soft delete: archivar el cliente si tiene ventas activas
      customer.isArchived = true;
      await customer.save();
      await AuditLogService.logCustomer({ user: req.user, action: 'Eliminación de Cliente',
        customerId: customer._id, customerName: customer.fullName,
        description: `Se archivó el cliente ${customer.fullName}`,
        changes: [{ field: 'isArchived', fieldLabel: 'Archivado', oldValue: false, newValue: true }], req });

      console.log(`Cliente ${customer._id} archivado (tiene ${activeSalesCount} ventas activas)`);

      return res.json({
        message: `Cliente archivado correctamente. Mantiene ${activeSalesCount} ventas asociadas.`,
        archived: true,
        referencesCount: activeSalesCount
      });
    }

    // Hard delete: eliminar permanentemente si no tiene ventas activas
    await Customer.findByIdAndDelete(req.params.id);
    await AuditLogService.logCustomer({ user: req.user, action: 'Eliminación de Cliente',
      customerId: customer._id, customerName: customer.fullName,
      description: `Se eliminó el cliente ${customer.fullName}`,
      changes: auditChanges(customer, null, customerLabels), req });

    console.log(`Cliente ${customer._id} eliminado permanentemente (sin ventas activas)`);

    res.json({
      message: 'Cliente eliminado exitosamente',
      archived: false
    });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ message: 'Error al eliminar cliente', error: error.message });
  }
};

// @desc    Obtener historial de compras de un cliente
// @route   GET /api/customers/:id/purchases
// @access  Private
export const getCustomerPurchases = async (req, res) => {
  try {
    const sales = await Sale.find({ customer: req.params.id })
      .populate('items.product', 'name sku')
      .populate('user', 'name')
      .sort({ createdAt: -1 });

    res.json(sales);
  } catch (error) {
    console.error('Error al obtener historial de compras:', error);
    res.status(500).json({ message: 'Error al obtener historial', error: error.message });
  }
};
