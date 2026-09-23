import { searchLiteral } from '../services/searchLiteral.js';
﻿/**
 * PRODUCTCONTROLLER.JS - Controlador de Productos
 * 
 * Maneja toda la lógica de negocio relacionada con productos del inventario.
 * 
 * Funciones:
 * - getProducts: Lista productos con filtros (búsqueda, categoría, marca, stock bajo)
 * - getProductById: Obtiene un producto específico por ID
 * - getProductBySku: Busca producto por SKU (usado en facturación rápida)
 * - createProduct: Crea nuevo producto (valida SKU único)
 * - updateProduct: Actualiza producto existente
 * - deleteProduct: Elimina producto del inventario
 * - getCategories: Lista categorías únicas (para filtros)
 * - getBrands: Lista marcas únicas (para filtros)
 */

import Product from '../models/Product.js';
import mongoose from 'mongoose';
import LogService from '../services/logService.js';
import AuditLogService from '../services/auditLogService.js';

/**
 * GETPRODUCTS - Obtener lista de productos
 * 
 * @route   GET /api/products
 * @access  Private
 * @query   search - Buscar por SKU o nombre (case-insensitive)
 * @query   category - Filtrar por categoría
 * @query   brand - Filtrar por marca
 * @query   lowStock - 'true' para mostrar solo productos con stock <= threshold
 * @returns Array de productos ordenados por fecha de creación (más reciente primero)
 */
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      brand,
      supplier,
      lowStock,
      outOfStock,
      includeArchived,
      sortBy,
      sortOrder,
      page = 1,
      limit = 100
    } = req.query;

    let query = {};

    // Excluir productos archivados por defecto (a menos que se solicite incluirlos)
    if (includeArchived !== 'true') {
      query.isArchived = { $ne: true };
    }

    // Busqueda por SKU, nombre o marca
    if (search) {
      query.$or = [
        { sku: { $regex: searchLiteral(search), $options: 'i' } },
        { name: { $regex: searchLiteral(search), $options: 'i' } },
        { brand: { $regex: searchLiteral(search), $options: 'i' } }
      ];
    }

    // Filtro por categoria
    if (category) {
      query.category = category;
    }

    // Filtro por marca exacta
    if (brand) {
      query.brand = brand;
    }

    // Filtro por proveedor
    if (supplier) {
      query.supplier = supplier;
    }

    // Filtros de stock
    if (outOfStock === 'true') {
      query.stock = 0;
    } else if (lowStock === 'true') {
      query.$expr = {
        $and: [
          { $lte: ['$stock', '$lowStockThreshold'] },
          { $gt: ['$stock', 0] }
        ]
      };
    }

    // Paginacion
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 100, 1);
    const skip = (pageNum - 1) * limitNum;

    // Ordenamiento
    const sortFields = {
      name: 'name',
      stock: 'stock',
      price: 'sellingPrice',
      createdAt: 'createdAt'
    };
    const sortField = sortFields[sortBy] || 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortConfig = { [sortField]: sortDirection, _id: -1 };

    // Contar total con filtros aplicados
    const totalDocs = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate('supplier', 'name contact')
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      products,
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
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
};

// @desc    Obtener un producto por ID
// @route   GET /api/products/:id
// @access  Private
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('supplier', 'name contact');

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({ message: 'Error al obtener producto', error: error.message });
  }
};

// @desc    Buscar producto por SKU
// @route   GET /api/products/sku/:sku
// @access  Private
export const getProductBySku = async (req, res) => {
  try {
    const product = await Product.findOne({ sku: req.params.sku.toUpperCase() });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error al buscar producto por SKU:', error);
    res.status(500).json({ message: 'Error al buscar producto', error: error.message });
  }
};

// @desc    Crear nuevo producto
// @route   POST /api/products
// @access  Private/Admin
export const createProduct = async (req, res) => {
  try {
    const { sku, name, description, brand, category, purchasePrice, sellingPrice, stock, lowStockThreshold, discountPercentage, supplier } = req.body;

    // Verificar si el SKU ya existe
    const existingProduct = await Product.findOne({ sku: sku.toUpperCase() });

    if (existingProduct) {
      return res.status(400).json({ message: 'El SKU ya existe' });
    }

    // Preparar datos del producto
    const productData = {
      sku: sku.toUpperCase(),
      name,
      description,
      brand,
      category,
      purchasePrice,
      sellingPrice,
      stock,
      lowStockThreshold,
      discountPercentage
    };

    // Solo agregar supplier si no está vacío
    if (supplier && supplier.trim() !== '') {
      productData.supplier = supplier;
    } else {
      // Si no hay proveedor, asignar "Proveedor Genérico"
      // Importar Supplier model dinámicamente o al inicio si no está
      const Supplier = mongoose.model('Supplier');
      let genericSupplier = await Supplier.findOne({ name: 'Proveedor Genérico' });

      if (!genericSupplier) {
        genericSupplier = await Supplier.create({
          name: 'Proveedor Genérico',
          email: 'generico@sistema.local',
          phone: '000-000-0000',
          address: 'Sistema',
          contact: 'Sistema'
        });
      }
      productData.supplier = genericSupplier._id;
    }

    const product = await Product.create(productData);

    // Log técnico del sistema
    await LogService.logAction({
      action: 'create',
      module: 'products',
      user: req.user,
      req,
      entityId: product._id.toString(),
      entityName: `${product.sku} - ${product.name}`,
      details: {
        sku: product.sku,
        category: product.category,
        stock: product.stock,
        sellingPrice: product.sellingPrice
      },
      success: true
    });

    // Log de auditoría de usuario
    await AuditLogService.logInventory({
      user: req.user,
      action: 'Creación de Producto',
      productId: product._id.toString(),
      productName: product.name,
      description: `Se creó el producto "${product.name}" (SKU: ${product.sku}) con ${product.stock} unidades en stock`,
      metadata: {
        sku: product.sku,
        category: product.category,
        brand: product.brand,
        stock: product.stock,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice
      },
      req
    });

    res.status(201).json(product);
  } catch (error) {
    console.error('Error al crear producto:', error);

    // Log de error
    await LogService.logError({
      module: 'products',
      action: 'create',
      message: `Error al crear producto: ${error.message}`,
      error,
      user: req.user,
      req,
      details: { sku: req.body.sku }
    });

    res.status(500).json({ message: 'Error al crear producto', error: error.message });
  }
};

// @desc    Actualizar producto
// @route   PUT /api/products/:id
// @access  Private/Admin
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Guardar estado anterior para auditoría
    const before = {
      sku: product.sku,
      name: product.name,
      stock: product.stock,
      sellingPrice: product.sellingPrice,
      purchasePrice: product.purchasePrice
    };

    // Si se está actualizando el SKU, verificar que no exista otro producto con ese SKU
    if (req.body.sku && req.body.sku !== product.sku) {
      const existingProduct = await Product.findOne({
        sku: req.body.sku.toUpperCase(),
        _id: { $ne: req.params.id } // Excluir el producto actual de la búsqueda
      });

      if (existingProduct) {
        return res.status(400).json({ message: 'El SKU ya existe' });
      }
    }

    // Preparar datos de actualización
    const updateData = {
      ...req.body,
      sku: req.body.sku ? req.body.sku.toUpperCase() : product.sku
    };

    // Si supplier está vacío, eliminarlo del objeto de actualización
    if (updateData.supplier !== undefined && (!updateData.supplier || updateData.supplier.trim() === '')) {
      delete updateData.supplier;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Log de actualización con cambios
    const after = {
      sku: updatedProduct.sku,
      name: updatedProduct.name,
      stock: updatedProduct.stock,
      sellingPrice: updatedProduct.sellingPrice,
      purchasePrice: updatedProduct.purchasePrice
    };

    // Log técnico del sistema
    await LogService.logAction({
      action: 'update',
      module: 'products',
      user: req.user,
      req,
      entityId: updatedProduct._id.toString(),
      entityName: `${updatedProduct.sku} - ${updatedProduct.name}`,
      changes: { before, after },
      success: true
    });

    // Log de auditoría de usuario
    const changes = [];
    if (before.name !== after.name) {
      changes.push({ field: 'name', fieldLabel: 'Nombre', oldValue: before.name, newValue: after.name });
    }
    if (before.stock !== after.stock) {
      changes.push({ field: 'stock', fieldLabel: 'Stock', oldValue: before.stock, newValue: after.stock });
    }
    if (before.sellingPrice !== after.sellingPrice) {
      changes.push({ field: 'sellingPrice', fieldLabel: 'Precio de Venta', oldValue: `RD$${before.sellingPrice}`, newValue: `RD$${after.sellingPrice}` });
    }
    if (before.purchasePrice !== after.purchasePrice) {
      changes.push({ field: 'purchasePrice', fieldLabel: 'Precio de Compra', oldValue: `RD$${before.purchasePrice}`, newValue: `RD$${after.purchasePrice}` });
    }

    await AuditLogService.logInventory({
      user: req.user,
      action: 'Modificación de Producto',
      productId: updatedProduct._id.toString(),
      productName: updatedProduct.name,
      description: `Se modificó el producto "${updatedProduct.name}" (SKU: ${updatedProduct.sku})`,
      changes,
      metadata: {
        sku: updatedProduct.sku,
        changesCount: changes.length
      },
      req
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error al actualizar producto:', error);

    // Log de error
    await LogService.logError({
      module: 'products',
      action: 'update',
      message: `Error al actualizar producto: ${error.message}`,
      error,
      user: req.user,
      req,
      details: { productId: req.params.id }
    });

    res.status(500).json({ message: 'Error al actualizar producto', error: error.message });
  }
};

// @desc    Eliminar producto
// @route   DELETE /api/products/:id
// @access  Private/Admin
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Verificar si el producto tiene referencias activas
    const Sale = mongoose.model('Sale');
    const PurchaseOrder = mongoose.model('PurchaseOrder');
    const Return = mongoose.model('Return');

    // Contar ventas activas con este producto
    const activeSalesCount = await Sale.countDocuments({
      'items.product': req.params.id,
      status: { $ne: 'Cancelada' }
    });

    // Contar órdenes de compra activas
    const activePurchaseOrdersCount = await PurchaseOrder.countDocuments({
      'items.product': req.params.id,
      status: { $in: ['Pendiente', 'Enviada'] }
    });

    // Contar devoluciones activas
    const activeReturnsCount = await Return.countDocuments({
      'items.product': req.params.id,
      status: { $in: ['Pendiente', 'Aprobada'] }
    });

    // Si hay referencias activas, archivar en lugar de eliminar (soft delete)
    if (activeSalesCount > 0 || activePurchaseOrdersCount > 0 || activeReturnsCount > 0) {
      product.isArchived = true;
      await product.save();

      // Log técnico del sistema
      await LogService.logAction({
        action: 'archive',
        module: 'products',
        user: req.user,
        req,
        entityId: product._id.toString(),
        entityName: `${product.sku} - ${product.name}`,
        details: {
          reason: 'Tiene referencias activas',
          ventas: activeSalesCount,
          ordenesCompra: activePurchaseOrdersCount,
          devoluciones: activeReturnsCount
        },
        success: true
      });

      // Log de auditoría de usuario
      await AuditLogService.logInventory({
        user: req.user,
        action: 'Eliminación de Producto',
        productId: product._id.toString(),
        productName: product.name,
        description: `Se archivó (no eliminó) el producto "${product.name}" (SKU: ${product.sku}) porque tiene referencias activas en ${activeSalesCount + activePurchaseOrdersCount + activeReturnsCount} transacciones`,
        metadata: {
          sku: product.sku,
          archived: true,
          ventas: activeSalesCount,
          ordenesCompra: activePurchaseOrdersCount,
          devoluciones: activeReturnsCount
        },
        req
      });

      return res.json({
        message: 'Producto archivado (no eliminado) porque está siendo usado en transacciones activas',
        archived: true,
        details: {
          ventas: activeSalesCount,
          ordenesCompra: activePurchaseOrdersCount,
          devoluciones: activeReturnsCount
        }
      });
    }

    // Si no hay referencias activas, eliminar permanentemente
    await Product.findByIdAndDelete(req.params.id);

    // Log técnico del sistema
    await LogService.logAction({
      action: 'delete',
      module: 'products',
      user: req.user,
      req,
      entityId: product._id.toString(),
      entityName: `${product.sku} - ${product.name}`,
      details: { reason: 'Sin referencias activas' },
      success: true
    });

    // Log de auditoría de usuario
    await AuditLogService.logInventory({
      user: req.user,
      action: 'Eliminación de Producto',
      productId: product._id.toString(),
      productName: product.name,
      description: `Se eliminó permanentemente el producto "${product.name}" (SKU: ${product.sku})`,
      metadata: {
        sku: product.sku,
        deleted: true,
        lastStock: product.stock
      },
      req
    });

    res.json({ message: 'Producto eliminado permanentemente', deleted: true });
  } catch (error) {
    console.error('Error al eliminar producto:', error);

    // Log de error
    await LogService.logError({
      module: 'products',
      action: 'delete',
      message: `Error al eliminar producto: ${error.message}`,
      error,
      user: req.user,
      req,
      details: { productId: req.params.id }
    });

    res.status(500).json({ message: 'Error al eliminar producto', error: error.message });
  }
};

// @desc    Obtener categorías únicas
// @route   GET /api/products/categories/list
// @access  Private
export const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.json(categories.filter(c => c)); // Filtrar valores vacíos
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// @desc    Obtener marcas únicas
// @route   GET /api/products/brands/list
// @access  Private
export const getBrands = async (req, res) => {
  try {
    const brands = await Product.distinct('brand');
    res.json(brands.filter(b => b)); // Filtrar valores vacíos
  } catch (error) {
    console.error('Error al obtener marcas:', error);
    res.status(500).json({ message: 'Error al obtener marcas', error: error.message });
  }
};

