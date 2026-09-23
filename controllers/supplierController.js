import { searchLiteral } from '../services/searchLiteral.js';
import Supplier from '../models/Supplier.js';

// Obtener todos los proveedores (con paginación)
export const getSuppliers = async (req, res) => {
  try {
    const { includeArchived, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Excluir archivados por defecto
    if (includeArchived !== 'true') {
      query.isArchived = { $ne: true };
    }

    // Búsqueda por nombre o contacto
    if (search) {
      query.$or = [
        { name: { $regex: searchLiteral(search), $options: 'i' } },
        { contact: { $regex: searchLiteral(search), $options: 'i' } }
      ];
    }

    // Paginación
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Contar total
    const totalDocs = await Supplier.countDocuments(query);
    
    const suppliers = await Supplier.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      suppliers,
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
    console.error('Error al obtener proveedores:', error);
    res.status(500).json({ message: 'Error al obtener proveedores' });
  }
};

// Obtener un proveedor por ID
export const getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json(supplier);
  } catch (error) {
    console.error('Error al obtener proveedor:', error);
    res.status(500).json({ message: 'Error al obtener proveedor' });
  }
};

// Crear nuevo proveedor
export const createSupplier = async (req, res) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error al crear proveedor:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'El RNC ya está registrado' });
    }
    res.status(500).json({ message: 'Error al crear proveedor' });
  }
};

// Actualizar proveedor
export const updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }
    res.json(supplier);
  } catch (error) {
    console.error('Error al actualizar proveedor:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'El RNC ya está registrado' });
    }
    res.status(500).json({ message: 'Error al actualizar proveedor' });
  }
};

// Eliminar proveedor con validación de referencias
export const deleteSupplier = async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const Product = mongoose.default.model('Product');
    const PurchaseOrder = mongoose.default.model('PurchaseOrder');
    
    const supplier = await Supplier.findById(req.params.id);
    
    if (!supplier) {
      return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    // Verificar referencias activas en productos
    const productsCount = await Product.countDocuments({ 
      supplier: supplier._id,
      isArchived: { $ne: true }
    });
    
    // Verificar referencias en órdenes de compra activas
    const purchaseOrdersCount = await PurchaseOrder.countDocuments({ 
      supplier: supplier._id,
      status: { $in: ['Pendiente', 'En Proceso'] }
    });
    
    const totalReferences = productsCount + purchaseOrdersCount;

    if (totalReferences > 0) {
      // Soft delete: archivar el proveedor si tiene referencias activas
      supplier.isArchived = true;
      await supplier.save();
      
      console.log(`Proveedor ${supplier._id} archivado (${productsCount} productos, ${purchaseOrdersCount} órdenes activas)`);
      
      return res.json({ 
        message: `Proveedor archivado correctamente. Mantiene ${productsCount} productos y ${purchaseOrdersCount} órdenes de compra asociadas.`,
        archived: true,
        referencesCount: {
          products: productsCount,
          purchaseOrders: purchaseOrdersCount
        }
      });
    }

    // Hard delete: eliminar permanentemente si no tiene referencias activas
    await Supplier.findByIdAndDelete(req.params.id);
    
    console.log(`Proveedor ${supplier._id} eliminado permanentemente (sin referencias activas)`);

    res.json({ 
      message: 'Proveedor eliminado exitosamente',
      archived: false
    });
  } catch (error) {
    console.error('Error al eliminar proveedor:', error);
    res.status(500).json({ message: 'Error al eliminar proveedor' });
  }
};
