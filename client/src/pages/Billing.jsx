import { writePrintDocument, escapeHtml } from '../utils/safeDocuments';
﻿/**
 * @file Billing.jsx
 * @description Punto de Venta (POS) - Página de facturación
 * 
 * Responsabilidades:
 * - Búsqueda de productos (por nombre, SKU, código de barras)
 * - Agregar productos al carrito (cartStore)
 * - Ajustar cantidades y descuentos por producto
 * - Seleccionar cliente para la venta
 * - Procesar pago (Efectivo, Tarjeta, Transferencia)
 * - Generar e imprimir recibo
 * - Limpiar carrito después de venta exitosa
 * 
 * Estados:
 * - products: Array de productos cargados desde backend
 * - searchTerm: String para búsqueda
 * - categories: Array de categorías únicas extraídas de products
 * - selectedCategory: Filtro de categoría
 * - viewMode: 'list' o 'grid' para vista de productos
 * - paymentMethod: 'Efectivo', 'Tarjeta', 'Transferencia'
 * - globalDiscount: Descuento global en porcentaje
 * - globalDiscountAmount: Descuento global en monto fijo
 * - showPaymentModal: Boolean para modal de confirmación de pago
 * - showCustomerModal: Boolean para modal de selección/creación de cliente
 * - showPrintModal: Boolean para modal de impresión de recibo
 * - completedSale: Objeto con datos de la venta completada
 * 
 * Carrito (cartStore):
 * - items: Array de productos con quantity, customDiscount
 * - selectedCustomer: Cliente asociado a la venta
 * - addItem, removeItem, updateQuantity, updateDiscount
 * - getSubtotal, getTotalDiscount, getTotal
 * - clearCart
 * 
 * Flujo de Venta:
 * 1. Buscar y agregar productos al carrito
 * 2. Ajustar cantidades/descuentos si es necesario
 * 3. Seleccionar cliente (opcional)
 * 4. Click en "Procesar Pago" -> abre modal de confirmación
 * 5. Confirmar método de pago -> POST /api/sales
 * 6. Backend crea venta + actualiza stock
 * 7. Frontend muestra modal de impresión con recibo
 * 8. Imprimir (window.print) y limpiar carrito
 * 
 * Atajos de Teclado:
 * - ESC: Cerrar modales
 * - Auto-focus en campo de búsqueda al montar
 * 
 * Validaciones:
 * - No permitir venta si carrito vacío
 * - Validar stock disponible al agregar productos
 * - Confirmar antes de procesar pago
 * 
 * UI Features:
 * - Búsqueda con debounce (filtrado en tiempo real)
 * - Vista de lista/grid toggle
 * - Filtro por categoría
 * - Skeleton loader durante carga inicial
 * - Tooltips informativos
 * - Badge de bajo stock en productos
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore';
import {
  getProducts,
  getProductBySku,
  getCategories,
  createSale,
  getCustomers,
  createCustomer as createCustomerAPI,
} from '../services/api';
import toast from 'react-hot-toast';
import { BillingSkeleton } from '../components/SkeletonLoader';
import {
  Search,
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  User,
  X,
  Check,
  Printer,
  Barcode,
  Filter,
  Info,
  LayoutGrid,
  List,
  TrendingUp,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { showGroupedToast } from '../utils/toastUtils';

const Billing = () => {
  const { invalidateCache } = useProductStore();
  const [showTooltip, setShowTooltip] = useState(null);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [amountReceived, setAmountReceived] = useState('');
  const [change, setChange] = useState(0);
  const [notes, setNotes] = useState(''); // Estado para notas
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' o 'grid'
  const [highlightedItems, setHighlightedItems] = useState(new Set());
  const searchInputRef = useRef(null);
  const productsRequestRef = useRef(0);

  // Paginación
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    pages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  const {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateDiscount,
    clearCart,
    getSubtotal,
    getTotalDiscount,
    getTotal,
    selectedCustomer,
    setCustomer,
  } = useCartStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    // Auto-focus en el campo de busqueda
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await getCategories();
        const categoriesData = response?.data || [];
        setCategories(Array.isArray(categoriesData) ? categoriesData.filter(Boolean) : []);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };

    fetchCategories();
  }, []);

  const fetchProducts = async () => {
    const requestId = ++productsRequestRef.current;

    try {
      setIsLoading(true);
      const response = await getProducts({
        page: pagination.page,
        limit: pagination.limit,
        category: selectedCategory || undefined,
        search: debouncedSearchTerm || undefined,
        sortBy: 'name',
        sortOrder: 'asc'
      });

      if (requestId !== productsRequestRef.current) return;

      const productsData = response?.data?.products || response?.data || [];
      const paginationData = response?.data?.pagination || {};

      setProducts(Array.isArray(productsData) ? productsData : []);
      setPagination(prev => ({
        ...prev,
        ...paginationData
      }));
    } catch (error) {
      if (requestId !== productsRequestRef.current) return;
      console.error('Error fetching products:', error);
      toast.error('Error al cargar productos');
    } finally {
      if (requestId === productsRequestRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [pagination.page, pagination.limit, selectedCategory, debouncedSearchTerm]);
  // El backend ya filtra por busqueda/categoria; aqui solo ordenamos lo recibido
  const filteredProducts = useMemo(() => {
    const filtered = [...products];

    // Ordenar por mas vendidos primero (usando soldCount si existe)
    filtered.sort((a, b) => {
      const aSold = a.soldCount || 0;
      const bSold = b.soldCount || 0;
      return bSold - aSold;
    });

    return filtered;
  }, [products]);
  // Manejar búsqueda por código de barras (Enter después de escribir)
  const handleSearchKeyPress = async (e) => {
    if (e.key === 'Enter' && searchTerm) {
      try {
        // Intentar buscar por SKU exacto
        const response = await getProductBySku(searchTerm);
        if (response.data) {
          handleAddToCart(response.data);
          setSearchTerm('');
          showGroupedToast(`${response.data.name} añadido al carrito`);
        }
      } catch (error) {
        // Si no encuentra por SKU, mostrar resultados filtrados
        if (filteredProducts.length === 1) {
          handleAddToCart(filteredProducts[0]);
          setSearchTerm('');
        }
      }
    }
  };

  const handleAddToCart = (product) => {
    if (product.stock <= 0) {
      toast.error('Producto sin stock disponible');
      return;
    }

    // Verificar si ya está en el carrito
    const existingItem = items.find((item) => item.product._id === product._id);
    if (existingItem && existingItem.quantity >= product.stock) {
      toast.error('Stock insuficiente');
      return;
    }

    addItem(product);

    // Agregar animación al item
    setHighlightedItems(prev => new Set(prev).add(product._id));

    // Scroll al item agregado después de un pequeño delay
    setTimeout(() => {
      const itemElement = document.getElementById(`cart-item-${product._id}`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);

    // Remover la animación después de 2 segundos
    setTimeout(() => {
      setHighlightedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(product._id);
        return newSet;
      });
    }, 2000);

    showGroupedToast(`${product.name} añadido`);
  };

  const handleQuantityChange = (productId, newQuantity) => {
    const product = items.find((item) => item.product._id === productId)?.product;

    // Permitir valores vacíos temporalmente
    if (newQuantity === '' || newQuantity === null || newQuantity === undefined) {
      updateQuantity(productId, '');
      return;
    }

    const qty = parseInt(newQuantity);
    if (isNaN(qty) || qty < 1) {
      return;
    }

    if (qty > product.stock) {
      toast.error('Stock insuficiente');
      return;
    }

    updateQuantity(productId, qty);
  };

  const handleRemoveItem = (productId) => {
    removeItem(productId);
    toast.success('Producto eliminado del carrito');
  };

  const handleDiscountChange = (productId, discount) => {
    // Permitir valores vacíos temporalmente
    if (discount === '' || discount === null || discount === undefined) {
      updateDiscount(productId, 0);
      return;
    }

    const disc = parseFloat(discount);
    if (isNaN(disc) || disc < 0 || disc > 100) {
      toast.error('El descuento debe estar entre 0 y 100');
      return;
    }
    updateDiscount(productId, disc);
  };

  const handleProceedToPayment = () => {
    if (items.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }
    setShowPaymentModal(true);
  };

  const handleCompleteSale = async () => {
    try {
      // Calcular el total final con descuento global aplicado (igual que en el modal)
      const discountAmount = globalDiscountAmount || ((globalDiscount / 100) * (getSubtotal() - getTotalDiscount()));
      const finalTotal = getTotal() - discountAmount;

      // Validar monto recibido para efectivo
      if (paymentMethod === 'Efectivo') {
        const received = parseFloat(amountReceived) || 0;
        if (received < finalTotal) {
          toast.error('El monto recibido debe ser mayor o igual al total');
          return;
        }
      }

      setIsLoading(true);

      const saleData = {
        items: items.map((item) => ({
          product: item.product._id,
          quantity: item.quantity,
          discountApplied: item.customDiscount,
        })),
        paymentMethod,
        customer: selectedCustomer?._id,
        subtotal: getSubtotal(),
        totalDiscount: getTotalDiscount() + discountAmount, // Descuento total (items + global)
        total: finalTotal, // Usar el total final con descuento global
        amountReceived: paymentMethod === 'Efectivo' ? parseFloat(amountReceived) : finalTotal,
        change: paymentMethod === 'Efectivo' ? change : 0,
        notes: notes // Incluir notas en la venta
      };

      const response = await createSale(saleData);

      // Invalidar caché de productos para que el inventario se actualice
      invalidateCache();

      // Recargar productos locales para actualizar stock en pantalla de ventas
      fetchProducts();

      toast.success('¡Venta completada exitosamente!');

      // Guardar la venta para el modal de impresión
      setCompletedSale(response.data);
      setShowPaymentModal(false);
      setShowPrintModal(true);

      // Limpiar carrito y estados de pago
      clearCart();
      setGlobalDiscount(0);
      setGlobalDiscountAmount(0);
      setAmountReceived('');
      setChange(0);
      setNotes(''); // Limpiar notas

      // Recargar productos para actualizar stock
      fetchProducts();
    } catch (error) {
      console.error('Error completing sale:', error);
      toast.error(error.response?.data?.message || 'Error al completar la venta');
    } finally {
      setIsLoading(false);
    }
  };

  const printInvoice = (sale) => {
    // Generar código de barras
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, sale.invoiceNumber, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        margin: 0,
        height: 40,
        width: 1.5
      });
    } catch (error) {
      console.error("Error generating barcode:", error);
    }
    const barcodeDataUrl = canvas.toDataURL("image/png");

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Error: No se pudo abrir la ventana de impresión. Verifica que los pop-ups estén permitidos.');
      return;
    }

    writePrintDocument(printWindow, `
      <html>
        <head>
          <title>Factura ${escapeHtml(sale.invoiceNumber)}</title>
          <meta charset="UTF-8">
          <style>
            * { 
              margin: 0; 
              padding: 0; 
              box-sizing: border-box; 
            }
            @media print {
              @page { 
                size: 80mm auto; 
                margin: 0mm; 
              }
              body { 
                margin: 0mm;
                padding: 2mm 3mm 3mm 3mm;
              }
              html, body {
                height: auto !important;
                overflow: visible !important;
              }
            }
            html, body {
              height: auto;
              overflow-y: visible;
            }
            body { 
              font-family: 'Courier New', 'Courier', monospace; 
              width: 80mm;
              max-width: 80mm;
              margin: 0;
              padding: 3mm;
              font-size: 10px;
              line-height: 1.3;
            }
            h1 { 
              text-align: center; 
              font-size: 14px; 
              margin: 2px 0;
              font-weight: bold;
              text-transform: uppercase;
            }
            .line { 
              border-top: 1px dashed #000; 
              margin: 3px 0; 
              height: 0;
            }
            table { 
              width: 100%; 
              border-collapse: collapse;
              table-layout: fixed;
            }
            td { 
              padding: 1px 0; 
              vertical-align: top;
              word-wrap: break-word;
            }
            .right { 
              text-align: right; 
            }
            .bold { 
              font-weight: bold; 
            }
            .center { 
              text-align: center; 
            }
            .small { 
              font-size: 8px; 
            }
            .info-section {
              margin: 3px 0;
              font-size: 10px;
              line-height: 1.3;
            }
            .info-section div {
              margin: 1px 0;
            }
            .item-row {
              margin-bottom: 2px;
            }
            .total-row {
              font-size: 12px;
              font-weight: bold;
              padding-top: 3px;
              border-top: 1px solid #000;
            }
            thead {
              border-bottom: 1px solid #000;
            }
          </style>
        </head>
        <body>
          <h1>MECANET</h1>
          <div class="line"></div>
          
          <div class="info-section">
            <div><strong>Factura:</strong> ${escapeHtml(sale.invoiceNumber)}</div>
            <div><strong>Fecha:</strong> ${new Date(sale.createdAt).toLocaleString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}</div>
            ${sale.customer ? `<div><strong>Cliente:</strong> ${escapeHtml(sale.customer.fullName || sale.customer.name || 'N/A')}</div>` : ''}
            ${sale.customer?.cedula ? `<div><strong>Cédula:</strong> ${escapeHtml(sale.customer.cedula)}</div>` : ''}
            ${sale.customer?.phone ? `<div><strong>Teléfono:</strong> ${escapeHtml(sale.customer.phone)}</div>` : ''}
            ${sale.user ? `<div><strong>Vendedor:</strong> ${escapeHtml(sale.user.name || sale.user.username || 'N/A')}</div>` : ''}
          </div>
          
          <div class="line"></div>
          
          <table>
            <thead>
              <tr class="bold small">
                <td style="width: 10%;">#</td>
                <td style="width: 50%;">PRODUCTO</td>
                <td style="width: 20%;" class="center">CANT</td>
                <td style="width: 20%;" class="right">TOTAL</td>
              </tr>
            </thead>
            <tbody>
              ${sale.items.map((item, index) => `
                <tr class="item-row">
                  <td>${index + 1}</td>
                  <td>
                    ${escapeHtml(item.product.name)}
                    ${item.product.warranty ? `<div style="font-size: 10px; font-style: italic; margin-top: 2px;">Garantía: ${escapeHtml(item.product.warranty)}</div>` : ''}
                  </td>
                  <td class="center">${item.quantity}</td>
                  <td class="right">${formatCurrency(item.subtotal)}</td>
                </tr>
                <tr class="small">
                  <td></td>
                  <td colspan="3">${formatCurrency(item.priceAtSale)} c/u${item.discountApplied > 0 ? ` (-${item.discountApplied}%)` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="line"></div>
          
          <table>
            <tr>
              <td>Subtotal:</td>
              <td class="right">${formatCurrency(sale.subtotal)}</td>
            </tr>
            ${sale.totalDiscount > 0 ? `
              <tr>
                <td>Descuento:</td>
                <td class="right">-${formatCurrency(sale.totalDiscount)}</td>
              </tr>
            ` : ''}
            <tr class="total-row">
              <td>TOTAL:</td>
              <td class="right">${formatCurrency(sale.total)}</td>
            </tr>
            <tr>
              <td colspan="2" class="center small" style="padding-top: 4px;">
                Pago: ${escapeHtml(sale.paymentMethod)}
              </td>
            </tr>
            ${sale.paymentMethod === 'Efectivo' && amountReceived ? `
              <tr>
                <td>Recibido:</td>
                <td class="right">${formatCurrency(parseFloat(amountReceived))}</td>
              </tr>
              <tr style="background: #f0f0f0; font-weight: bold;">
                <td>CAMBIO:</td>
                <td class="right">${formatCurrency(change >= 0 ? change : 0)}</td>
              </tr>
            ` : ''}
          </table>
          
          <div class="line"></div>
          
          ${sale.notes ? `
            <div style="margin: 5px 0;">
              <strong>Notas:</strong>
              <p style="margin-top: 2px; white-space: pre-wrap;">${escapeHtml(sale.notes)}</p>
            </div>
            <div class="line"></div>
          ` : ''}

          <div style="margin-top: 40px; text-align: center;">
            <div style="border-top: 1px solid #000; width: 80%; margin: 0 auto; padding-top: 5px;">
              Firma del Vendedor
            </div>
            <div style="font-size: 10px; margin-top: 2px;">
              ${escapeHtml(sale.user ? (sale.user.name || sale.user.username || '') : '')}
            </div>
          </div>

          <div style="text-align: center; margin-top: 15px;">
            <img src="${barcodeDataUrl}" style="width: 100%; max-width: 200px;" />
          </div>

          <p class="center bold" style="margin: 10px 0 3px 0;">¡Gracias por su compra!</p>
          <p class="center small" style="margin: 2px 0 3px 0;">Este documento no tiene validez fiscal</p>
        </body>
      </html>
    `);
    printWindow.document.close();

    // Esperar a que se cargue el contenido antes de imprimir
    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();

        // Cerrar la ventana después de imprimir (opcional)
        setTimeout(() => {
          printWindow.close();
        }, 500);
      } catch (error) {
        console.error('Error al imprimir:', error);
        toast.error('Error al enviar a la impresora. Verifica que esté conectada y configurada correctamente.');
      }
    }, 250);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  const calculateItemTotal = (item) => {
    const productDiscount = item.product.discountPercentage || 0;
    const customDiscount = item.customDiscount || 0;
    const totalDiscount = productDiscount + customDiscount;
    const priceAfterDiscount = item.product.sellingPrice * (1 - totalDiscount / 100);
    return priceAfterDiscount * item.quantity;
  };

  // Mostrar skeleton mientras carga
  if (isLoading && products.length === 0) {
    return <BillingSkeleton />;
  }

  return (
    <div className="h-full flex gap-3 xl:gap-6 animate-fade-in">
      {/* Left Side - Product Catalog */}
      <div className="flex-1 flex flex-col gap-3 xl:gap-4">
        {/* Search and Filters */}
        <div className="card-glass p-3 xl:p-4">
          <div className="flex gap-2 xl:gap-3">
            {/* Search Input */}
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar producto..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPagination((prev) => ({ ...prev, page: 1 })); }}
                onKeyPress={handleSearchKeyPress}
                className="input pl-10 pr-4"
                autoFocus
              />
            </div>

            {/* Category Filter - Hidden on small screens */}
            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setPagination((prev) => ({ ...prev, page: 1 })); }}
              className="input w-32 flex-shrink-0 hidden 2xl:block"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('');
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="btn-secondary px-3 flex-shrink-0"
              title="Limpiar filtros"
            >
              <Filter className="w-5 h-5" />
            </button>

            {/* Toggle Vista */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex-shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                title="Vista de lista"
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                title="Vista de tarjetas"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Indicador de ordenamiento */}
          <div className="flex items-center gap-2 text-[10px] xl:text-xs text-gray-600 dark:text-gray-400 mt-2">
            <TrendingUp className="w-3 h-3 xl:w-4 xl:h-4" />
            <span>Ordenado por más vendidos</span>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 card-glass p-3 xl:p-4 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <ShoppingCart className="w-16 h-16 mb-4 opacity-50" />
              <p>No se encontraron productos</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  onAdd={handleAddToCart}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProducts.map((product) => (
                <ProductListItem
                  key={product._id}
                  product={product}
                  onAdd={handleAddToCart}
                />
              ))}
            </div>
          )}

          {/* Paginación */}
          {!isLoading && pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Página {pagination.page} de {pagination.pages} ({pagination.total} productos)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={!pagination.hasPrevPage}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${pagination.hasPrevPage
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                    }`}
                >
                  Ant
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={!pagination.hasNextPage}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${pagination.hasNextPage
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                    }`}
                >
                  Sig
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Cart */}
      <div className="w-[450px] xl:w-[550px] flex flex-col gap-3 xl:gap-4">
        {/* Cart Header */}
        <div className="card-glass p-3 xl:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base xl:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 xl:w-5 xl:h-5" />
              Carrito ({items.length})
            </h3>
            {items.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('¿Limpiar todo el carrito?')) {
                    clearCart();
                    toast.success('Carrito limpiado');
                  }
                }}
                className="text-red-600 hover:text-red-700 text-xs xl:text-sm"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Customer Selection */}
          <button
            onClick={() => setShowCustomerModal(true)}
            className="w-full flex items-center gap-2 p-2.5 xl:p-3 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <User className="w-4 h-4 xl:w-5 xl:h-5" />
            <div className="flex-1 text-left">
              {selectedCustomer ? (
                <>
                  <p className="text-xs xl:text-sm font-medium text-gray-900 dark:text-white">
                    {selectedCustomer.fullName}
                  </p>
                  <p className="text-[10px] xl:text-xs text-gray-500 dark:text-gray-400">
                    {selectedCustomer.phone || selectedCustomer.email}
                  </p>
                </>
              ) : (
                <p className="text-xs xl:text-sm text-gray-600 dark:text-gray-300">
                  Seleccionar cliente (opcional)
                </p>
              )}
            </div>
            {selectedCustomer && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCustomer(null);
                }}
                className="p-1 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
              >
                <X className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
              </button>
            )}
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 card-glass p-3 xl:p-4 overflow-y-auto custom-scrollbar">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <ShoppingCart className="w-12 h-12 xl:w-16 xl:h-16 mb-4 opacity-50" />
              <p className="text-center text-sm">El carrito está vacío</p>
            </div>
          ) : (
            <div className="space-y-2 xl:space-y-3">
              {items.map((item) => (
                <CartItem
                  key={item.product._id}
                  item={item}
                  onQuantityChange={handleQuantityChange}
                  onDiscountChange={handleDiscountChange}
                  onRemove={handleRemoveItem}
                  calculateItemTotal={calculateItemTotal}
                  isHighlighted={highlightedItems.has(item.product._id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Cart Summary */}
        {items.length > 0 && (
          <div className="glass-strong p-3 xl:p-4 rounded-xl">
            <div className="space-y-1.5 xl:space-y-2 mb-3 xl:mb-4">
              <div className="flex justify-between text-xs xl:text-sm text-gray-600 dark:text-gray-400">
                <span>Subtotal:</span>
                <span>{formatCurrency(getSubtotal())}</span>
              </div>
              <div className="flex justify-between text-xs xl:text-sm text-green-600 dark:text-green-400">
                <span>Descuento:</span>
                <span>-{formatCurrency(getTotalDiscount())}</span>
              </div>
              <div className="border-t border-gray-300 dark:border-gray-600 pt-2">
                <div className="flex justify-between text-lg xl:text-xl font-bold text-gray-900 dark:text-white">
                  <span>Total:</span>
                  <span>{formatCurrency(getTotal())}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleProceedToPayment}
              className="btn-primary w-full text-sm xl:text-base flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 xl:w-5 xl:h-5" />
              Proceder al Pago
            </button>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          subtotal={getSubtotal()}
          itemsDiscount={getTotalDiscount()}
          globalDiscount={globalDiscount}
          setGlobalDiscount={setGlobalDiscount}
          globalDiscountAmount={globalDiscountAmount}
          setGlobalDiscountAmount={setGlobalDiscountAmount}
          total={getTotal()}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          amountReceived={amountReceived}
          setAmountReceived={setAmountReceived}
          change={change}
          notes={notes}
          setNotes={setNotes}
          onConfirm={handleCompleteSale}
          onClose={() => setShowPaymentModal(false)}
          isLoading={isLoading}
        />
      )}

      {/* Print Confirmation Modal */}
      {showPrintModal && completedSale && (
        <PrintConfirmationModal
          sale={completedSale}
          onPrint={() => {
            printInvoice(completedSale);
            setShowPrintModal(false);
            setCompletedSale(null);
          }}
          onClose={() => {
            setShowPrintModal(false);
            setCompletedSale(null);
          }}
        />
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <CustomerModal
          onSelect={(customer) => {
            setCustomer(customer);
            setShowCustomerModal(false);
          }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}
    </div>
  );
};

// Product Card Component
const ProductCard = ({ product, onAdd }) => {
  const isLowStock = product.stock <= product.lowStockThreshold;
  const hasDiscount = product.discountPercentage > 0;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  return (
    <div
      className="card-glass p-3 hover-lift cursor-pointer"
      onClick={() => onAdd(product)}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {product.sku}
        </span>
        {hasDiscount && (
          <span className="text-xs bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-2 py-1 rounded">
            -{product.discountPercentage}%
          </span>
        )}
      </div>

      <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-1 line-clamp-2">
        {product.name}
      </h4>

      {/* Marca y Proveedor */}
      <div className="mb-2 space-y-0.5">
        {product.brand && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {product.brand}
          </p>
        )}
        {product.supplier?.name && (
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {product.supplier.name}
          </p>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          {hasDiscount ? (
            <>
              <p className="text-xs text-gray-500 line-through">
                {formatCurrency(product.sellingPrice)}
              </p>
              <p className="text-lg font-bold text-primary-600">
                {formatCurrency(
                  product.sellingPrice * (1 - product.discountPercentage / 100)
                )}
              </p>
            </>
          ) : (
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(product.sellingPrice)}
            </p>
          )}
        </div>

        <div className="text-right">
          <p
            className={`text-xs font-semibold ${isLowStock ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'
              }`}
          >
            Stock: {product.stock}
          </p>
        </div>
      </div>
    </div>
  );
};

// Product List Item Component (Vista de Lista)
const ProductListItem = ({ product, onAdd }) => {
  const hasDiscount = product.discountPercentage > 0;
  const isOutOfStock = (product.stock ?? 0) <= 0;
  const lowStockThreshold = product.lowStockThreshold ?? 5;
  const isLowStock = !isOutOfStock && product.stock <= lowStockThreshold;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  return (
    <div
      className={`card-glass p-4 ${isOutOfStock ? 'opacity-80 cursor-not-allowed' : 'hover-lift cursor-pointer'} flex items-center justify-between gap-4 transition-all`}
      onClick={() => {
        if (isOutOfStock) return;
        onAdd(product);
      }}
      aria-disabled={isOutOfStock}
    >
      {/* Información del producto */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* SKU y Badge de Vendidos */}
        <div className="flex flex-col items-center gap-1 w-24">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 font-semibold">
            {product.sku}
          </span>
          {product.soldCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400">
              <TrendingUp className="w-3 h-3" />
              <span className="font-semibold">{product.soldCount}</span>
            </div>
          )}
        </div>

        {/* Nombre, Marca y Proveedor */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-base text-gray-900 dark:text-white truncate">
            {product.name}
          </h4>
          <div className="flex items-center gap-2 flex-wrap">
            {product.brand && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {product.brand}
              </p>
            )}
            {product.brand && product.supplier?.name && (
              <span className="text-gray-400 dark:text-gray-500">⬢</span>
            )}
            {product.supplier?.name && (
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                {product.supplier.name}
              </p>
            )}
          </div>
        </div>

        {/* Precio */}
        <div className="flex items-center gap-3">
          {hasDiscount && (
            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-2 py-1 rounded font-semibold">
              -{product.discountPercentage}%
            </span>
          )}
          <div className="text-right">
            {hasDiscount ? (
              <>
                <p className="text-sm text-gray-500 line-through">
                  {formatCurrency(product.sellingPrice)}
                </p>
                <p className="text-xl font-bold text-primary-600">
                  {formatCurrency(
                    product.sellingPrice * (1 - product.discountPercentage / 100)
                  )}
                </p>
              </>
            ) : (
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(product.sellingPrice)}
              </p>
            )}
          </div>
        </div>

        {/* Stock */}
        <div className="w-20 text-right">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Stock
          </p>
          <p
            className={`text-base font-bold ${isOutOfStock
              ? 'text-red-600 dark:text-red-400'
              : isLowStock
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-white'
              }`}
          >
            {product.stock}
          </p>
        </div>
      </div>

      {/* Botón de agregar */}
      <button
        className={`btn-primary px-4 py-2 flex items-center gap-2 shrink-0 ${isOutOfStock ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        disabled={isOutOfStock}
        onClick={(e) => {
          e.stopPropagation();
          if (isOutOfStock) return;
          onAdd(product);
        }}
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Agregar</span>
      </button>
    </div>
  );
};

// Cart Item Component
const CartItem = ({
  item,
  onQuantityChange,
  onDiscountChange,
  onRemove,
  calculateItemTotal,
  isHighlighted,
}) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  return (
    <div
      id={`cart-item-${item.product._id}`}
      className={`p-2 rounded-lg bg-gray-50 dark:bg-gray-800 transition-all duration-500 ${isHighlighted
        ? 'ring-4 ring-green-400 dark:ring-green-500 shadow-lg shadow-green-200 dark:shadow-green-900/50 scale-[1.02] animate-pulse-gentle'
        : ''
        }`}>
      <div className="flex justify-between items-start mb-1.5">
        <div className="flex-1">
          <h4 className="font-semibold text-base text-gray-900 dark:text-white leading-tight">
            {item.product.name}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {item.product.sku} ⬢ {formatCurrency(item.product.sellingPrice)}
          </p>
        </div>
        <button
          onClick={() => onRemove(item.product._id)}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Quantity Controls and Custom Discount in same row */}
      <div className="grid grid-cols-2 gap-2 mb-1.5">
        {/* Cantidad */}
        <div>
          <label className="text-xs text-gray-600 dark:text-gray-400 mb-0.5 block">
            Cantidad:
          </label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onQuantityChange(item.product._id, item.quantity - 1)}
              className="p-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              <Minus className="w-3 h-3" />
            </button>
            <input
              type="number"
              value={item.quantity === '' ? '' : item.quantity}
              onChange={(e) =>
                onQuantityChange(item.product._id, e.target.value)
              }
              onBlur={(e) => {
                // Si está vacío al perder foco, establecer a 1
                if (e.target.value === '' || parseInt(e.target.value) < 1) {
                  onQuantityChange(item.product._id, 1);
                }
              }}
              className="w-16 text-center input py-0.5 text-sm"
              min="1"
              max={item.product.stock}
            />
            <button
              onClick={() => onQuantityChange(item.product._id, item.quantity + 1)}
              className="p-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
              disabled={item.quantity >= item.product.stock}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Descuento */}
        <div>
          <label className="text-xs text-gray-600 dark:text-gray-400 mb-0.5 block">
            Descuento:
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={item.customDiscount || 0}
              onChange={(e) =>
                onDiscountChange(item.product._id, e.target.value)
              }
              className="w-16 text-center input py-0.5 text-sm"
              min="0"
              max="100"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">%</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center pt-1.5 border-t border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Total:
        </span>
        <span className="font-bold text-gray-900 dark:text-white">
          {formatCurrency(calculateItemTotal(item))}
        </span>
      </div>
    </div>
  );
};

// Payment Modal Component
const PaymentModal = ({
  subtotal,
  itemsDiscount,
  globalDiscount,
  setGlobalDiscount,
  globalDiscountAmount,
  setGlobalDiscountAmount,
  total,
  paymentMethod,
  setPaymentMethod,
  amountReceived,
  setAmountReceived,
  change,
  onConfirm,
  onClose,
  isLoading,
  notes,
  setNotes
}) => {
  const [discountType, setDiscountType] = React.useState('percentage'); // 'percentage' or 'finalPrice'
  const [finalPriceInput, setFinalPriceInput] = React.useState('');

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  const calculateFinalTotal = () => {
    if (discountType === 'finalPrice' && finalPriceInput) {
      return parseFloat(finalPriceInput) || 0;
    }
    const discountAmount = (globalDiscount / 100) * (subtotal - itemsDiscount);
    return total - discountAmount;
  };

  // Calcular cambio basado en el total final
  const calculatedChange = React.useMemo(() => {
    if (paymentMethod !== 'Efectivo' || !amountReceived) return 0;
    const received = parseFloat(amountReceived) || 0;
    const finalTotal = calculateFinalTotal();
    return received - finalTotal;
  }, [amountReceived, paymentMethod, finalPriceInput, discountType, globalDiscount, subtotal, itemsDiscount, total]);

  const handleFinalPriceChange = (value) => {
    setFinalPriceInput(value);
    const targetPrice = parseFloat(value) || 0;
    const currentTotal = subtotal - itemsDiscount;
    if (targetPrice < currentTotal && targetPrice >= 0) {
      const discountAmount = currentTotal - targetPrice;
      const discountPercentage = (discountAmount / currentTotal) * 100;
      // Guardar el monto exacto del descuento para evitar errores de redondeo
      setGlobalDiscountAmount(discountAmount);
      setGlobalDiscount(discountPercentage);
    } else {
      setGlobalDiscount(0);
      setGlobalDiscountAmount(0);
    }
  };

  const handlePercentageChange = (value) => {
    setGlobalDiscount(value);
    setFinalPriceInput('');
    // En modo porcentaje, calcular el monto
    const currentTotal = subtotal - itemsDiscount;
    setGlobalDiscountAmount((value / 100) * currentTotal);
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-4xl animate-scale-in flex flex-col md:flex-row gap-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Completar Venta
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="mb-6 space-y-3">
            {/* Resumen de totales */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(subtotal)}</span>
              </div>
              {itemsDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Descuentos por ítem:</span>
                  <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(itemsDiscount)}</span>
                </div>
              )}
            </div>

            {/* Campo de descuento global */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descuento Adicional
              </label>

              {/* Tabs para seleccionar tipo de descuento */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setDiscountType('percentage')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${discountType === 'percentage'
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                >
                  Porcentaje
                </button>
                <button
                  onClick={() => setDiscountType('finalPrice')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${discountType === 'finalPrice'
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                >
                  Precio Final
                </button>
              </div>

              {/* Input según tipo seleccionado */}
              {discountType === 'percentage' ? (
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={globalDiscount === 0 ? '' : globalDiscount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val === null) {
                        handlePercentageChange(0);
                        return;
                      }
                      const value = Math.min(100, Math.max(0, parseFloat(val) || 0));
                      handlePercentageChange(value);
                    }}
                    className="input pr-10"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={finalPriceInput}
                    onChange={(e) => handleFinalPriceChange(e.target.value)}
                    className="input pl-8"
                    placeholder="Ingrese precio final"
                  />
                </div>
              )}

              {globalDiscount > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                  💰 Ahorro: {discountType === 'finalPrice' && finalPriceInput
                    ? formatCurrency((subtotal - itemsDiscount) - parseFloat(finalPriceInput))
                    : formatCurrency((globalDiscount / 100) * (subtotal - itemsDiscount))
                  }
                </p>
              )}
            </div>

            {/* Total final */}
            <div className="text-center p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Total a Pagar
              </p>
              <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                {formatCurrency(calculateFinalTotal())}
              </p>
            </div>
          </div>

        </div>

        <div className="flex-1 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700 pt-6 md:pt-0 md:pl-6 flex flex-col">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Método de Pago
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {['Efectivo', 'Tarjeta', 'Transferencia'].map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`p-3 rounded-lg border-2 transition-all shadow-sm flex items-center justify-center gap-2 ${paymentMethod === method
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 shadow-primary-200 dark:shadow-primary-900/50'
                    : 'border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800/50 hover:border-primary-400 hover:shadow-md'
                    }`}
                >
                  <span className="font-medium text-gray-900 dark:text-white text-sm">
                    {method}
                  </span>
                  {paymentMethod === method && (
                    <Check className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Notas de la venta */}
          <div className="mb-6 flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas de la Venta
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full h-32 resize-none"
              placeholder="Agregar notas o comentarios a la factura..."
            />
          </div>

          {/* Monto Recibido y Cambio (solo para Efectivo) */}
          {paymentMethod === 'Efectivo' && (
            <div className="mb-6 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Monto Recibido *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min={calculateFinalTotal()}
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    className="input pl-8"
                    placeholder={`Mínimo: ${formatCurrency(calculateFinalTotal())}`}
                    required
                  />
                </div>
              </div>

              {amountReceived && (
                <div className={`p-4 rounded-lg border-2 ${calculatedChange >= 0
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-500'
                  }`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-lg font-semibold ${calculatedChange >= 0
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-red-700 dark:text-red-300'
                      }`}>
                      Cambio a Devolver:
                    </span>
                    <span className={`text-3xl font-bold ${calculatedChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                      }`}>
                      {formatCurrency(calculatedChange >= 0 ? calculatedChange : 0)}
                    </span>
                  </div>
                  {calculatedChange < 0 && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      El monto recibido es menor al total
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-auto">
            <button onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Procesando...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Confirmar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Customer Modal Component
const CustomerModal = ({ onSelect, onClose }) => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    fullName: '',
    cedula: '',
    phone: '',
    email: '',
    address: '',
  });
  const [customerErrors, setCustomerErrors] = useState({});

  const formatPhone = (value) => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.substring(0, 10);
    if (limited.length <= 3) return limited;
    else if (limited.length <= 6) return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    else return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
  };

  const formatCedula = (value) => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.substring(0, 11);
    if (limited.length <= 3) return limited;
    else if (limited.length <= 10) return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    else return `${limited.slice(0, 3)}-${limited.slice(3, 10)}-${limited.slice(10)}`;
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Buscar clientes cuando cambia el término de búsqueda (con debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== '') {
        fetchCustomers();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await getCustomers({ search: searchTerm, limit: 100 });
      const customersData = response?.data?.customers || response?.data || [];
      setCustomers(Array.isArray(customersData) ? customersData : []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Error al cargar clientes');
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    const errors = {};

    // Validar nombre (obligatorio)
    if (!newCustomer.fullName.trim()) {
      errors.fullName = 'El nombre es requerido';
    }

    // Validar cédula (obligatorio y debe tener 11 dígitos)
    const cedulaDigits = newCustomer.cedula.replace(/\D/g, '');
    if (!newCustomer.cedula.trim()) {
      errors.cedula = 'La cédula es requerida';
    } else if (cedulaDigits.length !== 11) {
      errors.cedula = 'La cédula debe tener 11 dígitos';
    }

    // Validar teléfono (opcional, pero si se proporciona debe tener formato válido)
    const phoneDigits = newCustomer.phone.replace(/\D/g, '');
    if (newCustomer.phone.trim() && phoneDigits.length > 0 && phoneDigits.length !== 10) {
      errors.phone = 'El teléfono debe tener 10 dígitos o dejarlo vacío';
    }

    // Validar email (opcional, pero si se proporciona debe ser válido)
    if (newCustomer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) {
      errors.email = 'Email inválido';
    }

    // Si hay errores, mostrarlos
    if (Object.keys(errors).length > 0) {
      setCustomerErrors(errors);
      toast.error('Por favor corrige los errores en el formulario');
      return;
    }

    try {
      setIsLoading(true);
      setCustomerErrors({});
      const response = await createCustomerAPI(newCustomer);
      toast.success('Cliente creado exitosamente');
      setShowNewCustomer(false);
      setNewCustomer({
        fullName: '',
        cedula: '',
        phone: '',
        email: '',
        address: '',
      });
      onSelect(response.data);
    } catch (error) {
      console.error('Error creating customer:', error);
      console.error('Error response:', error.response?.data);
      toast.error(error.response?.data?.message || 'Error al crear cliente');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchCustomers();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 shadow-xl rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {showNewCustomer ? 'Nuevo Cliente' : 'Seleccionar Cliente'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {!showNewCustomer ? (
          <>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Buscar cliente por nombre, teléfono o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : customers.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No se encontraron clientes
                </div>
              ) : (
                <div className="space-y-2">
                  {customers.map((customer) => (
                    <button
                      key={customer._id}
                      onClick={() => onSelect(customer)}
                      className="w-full p-4 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        {customer.fullName}
                        {customer.cedula && (
                          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                            Céd: {customer.cedula}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {customer.phone} {customer.email && `⬢ ${customer.email}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowNewCustomer(true)}
              className="btn-primary w-full"
            >
              <Plus className="w-5 h-5" />
              Crear Nuevo Cliente
            </button>
          </>
        ) : (
          <>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={newCustomer.fullName}
                  onChange={(e) => {
                    setNewCustomer({ ...newCustomer, fullName: e.target.value });
                    if (customerErrors.fullName) {
                      setCustomerErrors({ ...customerErrors, fullName: '' });
                    }
                  }}
                  className={`input ${customerErrors.fullName ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="Juan Pérez"
                  autoFocus
                />
                {customerErrors.fullName && (
                  <p className="text-xs text-red-600 mt-1">{customerErrors.fullName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cédula * (obligatoria)
                </label>
                <input
                  type="text"
                  value={newCustomer.cedula}
                  onChange={(e) => {
                    setNewCustomer({ ...newCustomer, cedula: formatCedula(e.target.value) });
                    if (customerErrors.cedula) {
                      setCustomerErrors({ ...customerErrors, cedula: '' });
                    }
                  }}
                  className={`input font-mono ${customerErrors.cedula ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="Ingresa la cédula (no puede estar vacía)"
                />
                {customerErrors.cedula && (
                  <p className="text-xs text-red-600 mt-1">{customerErrors.cedula}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => {
                    setNewCustomer({ ...newCustomer, phone: formatPhone(e.target.value) });
                    if (customerErrors.phone) {
                      setCustomerErrors({ ...customerErrors, phone: '' });
                    }
                  }}
                  className={`input font-mono ${customerErrors.phone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="809-555-1234 (opcional)"
                />
                {customerErrors.phone && (
                  <p className="text-xs text-red-600 mt-1">{customerErrors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => {
                    setNewCustomer({ ...newCustomer, email: e.target.value });
                    if (customerErrors.email) {
                      setCustomerErrors({ ...customerErrors, email: '' });
                    }
                  }}
                  className={`input ${customerErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="cliente@ejemplo.com (opcional)"
                />
                {customerErrors.email && (
                  <p className="text-xs text-red-600 mt-1">{customerErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Dirección
                </label>
                <textarea
                  value={newCustomer.address}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, address: e.target.value })
                  }
                  rows="3"
                  className="input"
                  placeholder="Calle, número, sector, ciudad..."
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNewCustomer(false)}
                className="btn-secondary flex-1"
              >
                Volver
              </button>
              <button
                onClick={handleCreateCustomer}
                disabled={isLoading}
                className="btn-primary flex-1"
              >
                {isLoading ? 'Creando...' : 'Crear Cliente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

// Print Confirmation Modal Component
const PrintConfirmationModal = ({ sale, onPrint, onClose }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            ¡Venta Completada!
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Factura: <span className="font-semibold">{sale.invoiceNumber}</span>
          </p>
          <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 mt-3">
            {formatCurrency(sale.total)}
          </p>
        </div>

        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-3">
            ¿Desea imprimir la factura?
          </p>
          <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center justify-between">
              <span>Método de pago:</span>
              <span className="font-medium text-gray-900 dark:text-white">{sale.paymentMethod}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Productos:</span>
              <span className="font-medium text-gray-900 dark:text-white">{sale.items.length} ítem(s)</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <X className="w-5 h-5" />
            No Imprimir
          </button>
          <button
            onClick={onPrint}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Imprimir
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Billing;







