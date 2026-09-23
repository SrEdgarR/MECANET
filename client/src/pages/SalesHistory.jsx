import { writePrintDocument, escapeHtml } from '../utils/safeDocuments';
/**
 * @file SalesHistory.jsx
 * @description Historial completo de ventas con filtros y detalles
 * 
 * Responsabilidades:
 * - Listar todas las ventas con filtros
 * - Ver detalle de venta (modal con items)
 * - Cancelar venta (solo admin)
 * - Reimprimir recibo
 * - Exportar ventas (CSV/Excel)
 * - Copiar ID de factura al portapapeles
 * 
 * Estados:
 * - sales: Array de ventas desde backend
 * - filters: { search, status, paymentMethod, startDate, endDate }
 * - showDetailModal: Boolean para modal detalle
 * - selectedSale: Venta seleccionada para detalle
 * - showCancelModal: Boolean para confirmación de cancelación
 * - saleToCancel: Venta a cancelar
 * - copiedId: ID de factura copiada (para feedback visual)
 * 
 * APIs:
 * - GET /api/sales (con filtros: startDate, endDate, status, paymentMethod)
 * - GET /api/sales/:id (detalle)
 * - PUT /api/sales/:id/cancel (cancelar, solo admin)
 * 
 * Filtros:
 * - search: Búsqueda por invoiceNumber o customer.fullName
 * - status: 'Completada', 'Cancelada'
 * - paymentMethod: 'Efectivo', 'Tarjeta', 'Transferencia'
 * - startDate, endDate: Rango de fechas
 * 
 * Detalle de Venta:
 * - invoiceNumber, fecha, cajero
 * - Cliente (nombre, identificación)
 * - Items: producto, cantidad, precio, subtotal
 * - Subtotal, descuentos, total
 * - Método de pago
 * - Status
 * 
 * Cancelación (solo admin):
 * - Cambia status a 'Cancelada'
 * - Devuelve stock de productos
 * - Irreversible (requiere confirmación)
 * 
 * UI Features:
 * - Tabla con skeleton loader
 * - Badge de status y método de pago
 * - Botón copiar invoiceNumber con feedback visual
 * - Modal de detalle con impresión
 * - Confirmación antes de cancelar
 * - Exportación de datos
 */

import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Calendar,
  DollarSign,
  FileText,
  Eye,
  Printer,
  Download,
  X,
  User,
  CreditCard,
  Package,
  TrendingUp,
  ShoppingCart,
  Copy,
  Check,
  XCircle
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { toast } from 'react-hot-toast';
import { getSales, cancelSale } from '../services/api';
import { useSettingsStore } from '../store/settingsStore';
import { TableSkeleton } from '../components/SkeletonLoader';
import { createPortal } from 'react-dom';

const SalesHistory = () => {
  const { settings } = useSettingsStore();
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    paymentMethod: '',
    startDate: '',
    endDate: '',
  });

  // Paginación
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    totalAmount: 0,
    completed: 0,
    cancelled: 0,
  });

  useEffect(() => {
    fetchSales();
  }, [filters, pagination.page]);

  const fetchSales = async () => {
    try {
      setIsLoading(true);
      const response = await getSales({ ...filters, page: pagination.page, limit: pagination.limit });

      // El backend ahora devuelve { sales, pagination, stats }
      const salesData = response?.data?.sales || response?.sales || [];
      const paginationData = response?.data?.pagination || response?.pagination || {};
      const statsData = response?.data?.stats || response?.stats || null;

      setSales(salesData);
      setPagination(prev => ({
        ...prev,
        ...paginationData
      }));

      // Usar stats del backend si están disponibles, sino calcular localmente
      if (statsData) {
        setStats(statsData);
      } else {
        calculateStats(salesData);
      }
    } catch (error) {
      console.error('Error al cargar ventas:', error);
      toast.error('Error al cargar historial de ventas');
      setSales([]);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = (salesData) => {
    const completed = salesData.filter(s => s.status === 'Completada').length;
    const cancelled = salesData.filter(s => s.status === 'Cancelada').length;
    const totalAmount = salesData
      .filter(s => s.status === 'Completada')
      .reduce((sum, s) => sum + s.total, 0);

    setStats({
      total: salesData.length,
      totalAmount,
      completed,
      cancelled,
    });
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(value);
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const getStatusBadge = (status) => {
    const badges = {
      Completada: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Cancelada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      Devuelta: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    };
    return badges[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const getPaymentMethodBadge = (method) => {
    const badges = {
      Efectivo: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Tarjeta: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      Transferencia: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    };
    return badges[method] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const handleCopyInvoiceNumber = async (invoiceNumber, saleId) => {
    try {
      await navigator.clipboard.writeText(invoiceNumber);
      setCopiedId(saleId);
      toast.success('Número de factura copiado');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error('Error al copiar');
    }
  };

  const handleCancelSale = (sale) => {
    if (sale.status === 'Cancelada') {
      toast.error('Esta factura ya está cancelada');
      return;
    }
    setSaleToCancel(sale);
    setShowCancelModal(true);
  };

  const confirmCancelSale = async () => {
    if (!saleToCancel) return;

    try {
      setIsLoading(true);
      await cancelSale(saleToCancel._id);
      toast.success('Factura cancelada exitosamente');
      setShowCancelModal(false);
      setSaleToCancel(null);
      fetchSales(); // Recargar lista
    } catch (error) {
      console.error('Error al cancelar factura:', error);
      toast.error(error.response?.data?.message || 'Error al cancelar factura');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintInvoice = (sale) => {
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
    writePrintDocument(printWindow, `
      <html>
        <head>
          <title>Factura ${escapeHtml(sale.invoiceNumber)}</title>
          <style>
            @media print {
              @page { size: 80mm auto; margin: 0; }
              body { margin: 10mm; }
            }
            body { 
              font-family: 'Courier New', monospace; 
              width: 80mm;
              margin: 0 auto;
              padding: 5mm;
              font-size: 11px;
            }
            h1 { 
              text-align: center; 
              font-size: 16px; 
              margin: 5px 0;
              font-weight: bold;
            }
            .line { 
              border-top: 1px dashed #000; 
              margin: 8px 0; 
            }
            table { 
              width: 100%; 
              border-collapse: collapse;
            }
            td { 
              padding: 2px 0; 
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
              font-size: 9px; 
            }
            .info-section {
              margin: 8px 0;
              font-size: 12px;
              font-weight: bold;
            }
            .item-row {
              margin-bottom: 4px;
            }
            .total-row {
              font-size: 13px;
              font-weight: bold;
              padding-top: 4px;
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(settings.businessName || 'MECANET')}</h1>
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
            ${sale.customer ? `<div><strong>Cliente:</strong> ${escapeHtml(sale.customer.fullName || sale.customer.name || 'Cliente General')}</div>` : '<div><strong>Cliente:</strong> Cliente General</div>'}
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
                    ${escapeHtml(item.product?.name || 'Producto')}
                    ${item.product?.warranty ? `<div style="font-size: 10px; font-style: italic; margin-top: 2px;">Garantía: ${escapeHtml(item.product.warranty)}</div>` : ''}
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
          </table>
          
          <div class="line"></div>
          
          ${sale.notes ? `
            <div style="margin: 5px 0;">
              <strong>Notas:</strong>
              <p style="margin-top: 2px; white-space: pre-wrap;">${escapeHtml(sale.notes)}</p>
            </div>
            <div class="line"></div>
          ` : ''}
          
          <div class="line"></div>
          
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
          <p class="center small">Este documento no tiene validez fiscal</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    // Esperar a que la imagen se cargue antes de imprimir
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const generateInvoiceHTML = (sale) => {
    // Esta función ya no se usa - ahora usamos el formato de 80mm directamente en handlePrintInvoice
    return '';
  };

  if (isLoading && sales.length === 0) {
    return <TableSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Historial de Facturas
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Consulta y gestiona el historial completo de ventas
        </p>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-glass p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Total Ventas
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.total}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="card-glass p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Monto Total
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {formatCurrency(stats.totalAmount)}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="card-glass p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Completadas
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                {stats.completed}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="card-glass p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Canceladas
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {stats.cancelled}
              </p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <X className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card-glass p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Buscar factura
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Número de factura..."
                className="input pl-10"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Estado
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input"
            >
              <option value="">Todos</option>
              <option value="Completada">Completada</option>
              <option value="Cancelada">Cancelada</option>
              <option value="Devuelta">Devuelta</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Método de Pago
            </label>
            <select
              value={filters.paymentMethod}
              onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              className="input"
            >
              <option value="">Todos</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fecha inicio
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fecha fin
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Tabla de Ventas */}
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Factura
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Método
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {Array.isArray(sales) && sales.map((sale) => (
                <tr
                  key={sale._id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {sale.invoiceNumber}
                      </span>
                      {sale.hasReturns && (
                        <span
                          className="px-2 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full flex items-center gap-1"
                          title={`${sale.returnsCount} devolución${sale.returnsCount > 1 ? 'es' : ''} • Total: ${formatCurrency(sale.totalReturned || 0)}`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          {sale.returnsCount}
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyInvoiceNumber(sale.invoiceNumber, sale._id)}
                        className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                        title="Copiar número de factura"
                      >
                        {copiedId === sale._id ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(sale.createdAt)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {sale.customer?.fullName || 'Cliente General'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {sale.items?.length || 0}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPaymentMethodBadge(sale.paymentMethod)}`}>
                      {sale.paymentMethod}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(sale.total)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(sale.status)}`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedSale(sale);
                          setShowDetailModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handlePrintInvoice(sale)}
                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                        title="Imprimir"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {sale.status !== 'Cancelada' && (
                        <button
                          onClick={() => handleCancelSale(sale)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Cancelar factura"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sales.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              No se encontraron facturas
            </p>
          </div>
        )}

        {/* Paginación */}
        {!isLoading && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Mostrando {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} facturas
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={!pagination.hasPrevPage}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pagination.hasPrevPage
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                  }`}
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                Página {pagination.page} de {pagination.pages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={!pagination.hasNextPage}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pagination.hasNextPage
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                  }`}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalle */}
      {showDetailModal && selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedSale(null);
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          getStatusBadge={getStatusBadge}
          getPaymentMethodBadge={getPaymentMethodBadge}
          onPrint={handlePrintInvoice}
          onCancel={handleCancelSale}
        />
      )}

      {/* Modal de Confirmación de Cancelación */}
      {showCancelModal && saleToCancel && (
        <CancelSaleModal
          sale={saleToCancel}
          onConfirm={confirmCancelSale}
          onClose={() => {
            setShowCancelModal(false);
            setSaleToCancel(null);
          }}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

// Modal de Confirmación de Cancelación
const CancelSaleModal = ({ sale, onConfirm, onClose, isLoading }) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, isLoading]);

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              Cancelar Factura
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Esta acción no se puede deshacer
            </p>
          </div>
        </div>

        {/* Información de la Factura */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Factura:</span>
              <span className="text-base font-bold text-gray-900 dark:text-white">
                #{sale.invoiceNumber}
              </span>
            </div>
            {sale.customer && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Cliente:</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {sale.customer.fullName}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total:</span>
              <span className="text-lg font-bold text-red-600 dark:text-red-400">
                ${sale.total.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Items:</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {sale.items.length} producto{sale.items.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Advertencia */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                ¡Importante!
              </h4>
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                Al cancelar esta factura:
              </p>
              <ul className="text-xs text-yellow-700 dark:text-yellow-400 mt-2 space-y-1 list-disc list-inside">
                <li>Se restaurará el stock de todos los productos</li>
                <li>La venta quedará marcada como "Cancelada"</li>
                <li>Esta acción quedará registrada en el sistema</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 btn-secondary flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            No, Mantener
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Cancelando...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                Sí, Cancelar Factura
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Modal de Detalle de Venta
const SaleDetailModal = ({ sale, onClose, formatCurrency, formatDate, getStatusBadge, getPaymentMethodBadge, onPrint, onCancel }) => {
  const [copied, setCopied] = useState(false);

  // Cerrar modal con tecla ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sale.invoiceNumber);
      setCopied(true);
      toast.success('Número de factura copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Error al copiar');
    }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Detalle de Factura
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-600 dark:text-gray-400">{sale.invoiceNumber}</p>
                <button
                  onClick={handleCopy}
                  className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                  title="Copiar número de factura"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPrint(sale)}
                className="btn-primary flex items-center gap-2"
              >
                <Printer className="w-5 h-5" />
                Imprimir
              </button>
              {sale.status !== 'Cancelada' && onCancel && (
                <button
                  onClick={() => {
                    onClose();
                    onCancel(sale);
                  }}
                  className="btn-secondary text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Cancelar
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Info General */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card-glass p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Fecha</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatDate(sale.createdAt)}
              </p>
            </div>
            <div className="card-glass p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Cliente</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {sale.customer?.fullName || 'Cliente General'}
              </p>
            </div>
            <div className="card-glass p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estado</p>
              <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(sale.status)}`}>
                {sale.status}
              </span>
            </div>
            <div className="card-glass p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Método de Pago</p>
              <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getPaymentMethodBadge(sale.paymentMethod)}`}>
                {sale.paymentMethod}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Productos
            </h3>
            <div className="space-y-2">
              {sale.items?.map((item, index) => (
                <div key={index} className="card-glass p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.product?.name || 'Producto'}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        SKU: {item.product?.sku || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {item.quantity} × {formatCurrency(item.priceAtSale)}
                      </p>
                      {item.discountApplied > 0 && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Desc: -{formatCurrency(item.discountApplied)}
                        </p>
                      )}
                      <p className="font-bold text-gray-900 dark:text-white">
                        {formatCurrency(item.subtotal)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="space-y-3">
              <div className="flex justify-between text-gray-700 dark:text-gray-300">
                <span>Subtotal:</span>
                <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
              </div>
              {sale.totalDiscount > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Descuento:</span>
                  <span className="font-medium">-{formatCurrency(sale.totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-bold text-primary-600 dark:text-primary-400 pt-3 border-t border-gray-200 dark:border-gray-700">
                <span>Total:</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {sale.notes && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notas:
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {sale.notes}
              </p>
            </div>
          )}

          {/* Historial de Devoluciones */}
          {sale.hasReturns && sale.returns && sale.returns.length > 0 && (
            <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                  Historial de Devoluciones ({sale.returnsCount})
                </p>
              </div>
              <div className="space-y-2">
                {sale.returns.map((returnItem, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800/50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {returnItem.returnNumber}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {formatDate(returnItem.createdAt)} • {returnItem.items?.length || 0} producto(s) devuelto(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                        Reembolso: -{formatCurrency(returnItem.totalAmount || 0)}
                      </p>
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${returnItem.status === 'Aprobada' || returnItem.status === 'Completada'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : returnItem.status === 'Rechazada'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                        }`}>
                        {returnItem.status === 'Completada' ? 'Aprobada' : returnItem.status || 'Pendiente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {(sale.totalReturned || 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800 flex justify-between items-center">
                  <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                    Total Devuelto:
                  </span>
                  <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrency(sale.totalReturned || 0)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Vendedor */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Vendido por: <span className="font-medium">{sale.user?.name || 'N/A'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SalesHistory;
