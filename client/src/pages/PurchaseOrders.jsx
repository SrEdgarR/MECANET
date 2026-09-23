import { writePrintDocument, escapeHtml } from '../utils/safeDocuments';
/**
 * @file PurchaseOrders.jsx
 * @description Gestión de órdenes de compra (manual y automática)
 * 
 * Responsabilidades:
 * - Listar órdenes de compra con filtros (status, supplier, fechas)
 * - Crear orden manual (modal con selección de productos)
 * - Generar órdenes automáticas basadas en stock bajo (solo admin)
 * - Ver detalle de orden (modal)
 * - Cambiar status de orden: Pendiente → Confirmada → Recibida (solo admin)
 * - Editar orden (solo Pendiente, solo admin)
 * - Eliminar orden (solo admin)
 * - Imprimir orden
 * 
 * Estados:
 * - orders: Array de órdenes desde backend
 * - suppliers: Array de proveedores (para dropdown)
 * - products: Array de productos (para crear orden)
 * - filters: { status, supplierId, startDate, endDate, search }
 * - showCreateModal: Boolean para modal crear
 * - showDetailModal: Boolean para modal detalle
 * - editingOrder: Orden en edición o null
 * - orderItems: Array de items { product, quantity, price } en modal
 * 
 * APIs:
 * - GET /api/purchase-orders
 * - POST /api/purchase-orders (crear manual)
 * - POST /api/purchase-orders/generate-auto (crear automático, solo admin)
 * - PUT /api/purchase-orders/:id (editar, solo admin)
 * - PUT /api/purchase-orders/:id/status (cambiar status, solo admin)
 * - DELETE /api/purchase-orders/:id (solo admin)
 * 
 * Status Flow:
 * 1. Pendiente: Orden creada, esperando confirmación
 * 2. Confirmada: Orden confirmada con proveedor, esperando recepción
 * 3. Recibida: Productos recibidos, stock actualizado automáticamente
 * 4. Cancelada: Orden cancelada
 * 
 * Generación Automática:
 * - Analiza productos con stock < minStock
 * - Agrupa por supplier
 * - Crea una orden por supplier con productos bajo stock
 * - Cantidad sugerida: minStock * 2
 * 
 * UI Features:
 * - Tabla con skeleton loader
 * - Badge de status con colores
 * - Filtros expandibles
 * - Modal de creación con búsqueda de productos
 * - Confirmación antes de cambiar status o eliminar
 * - Impresión de orden (window.print)
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  getPurchaseOrders,
  createPurchaseOrder,
  generateAutoPurchaseOrder,
  updatePurchaseOrder,
  updateOrderStatus,
  sendPurchaseOrderEmail,
  deletePurchaseOrder,
  getSuppliers,
  getProducts,
  getSettings,
} from '../services/api';
import toast from 'react-hot-toast';
import { PurchaseOrdersSkeleton } from '../components/SkeletonLoader';
import { useSettingsStore } from '../store/settingsStore';
import { useProductStore } from '../store/productStore';
import {
  ClipboardList,
  Plus,
  Minus,
  Search,
  Filter,
  Eye,
  Check,
  X,
  Truck,
  Package,
  Calendar,
  DollarSign,
  Zap,
  Printer,
  Edit,
  Trash2,
  AlertTriangle,
  Info,
  Send,
  Mail,
} from 'lucide-react';

const PurchaseOrders = () => {
  const location = useLocation();
  const { settings: globalSettings } = useSettingsStore();
  const { invalidateCache } = useProductStore();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [receivingOrder, setReceivingOrder] = useState(null);
  const requireReception = globalSettings.requireOrderReception !== false;
  const emailFeatureEnabled = settings?.smtp?.enabled ?? globalSettings?.smtp?.enabled ?? true;
  
  // Estados para modales de confirmación
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [orderToEmail, setOrderToEmail] = useState(null);

  useEffect(() => {
    fetchData();
    
    // Check if auto=true in URL y si la función está habilitada
    const params = new URLSearchParams(location.search);
    if (params.get('auto') === 'true' && globalSettings.autoCreatePurchaseOrders) {
      setShowAutoModal(true);
    }
  }, [location, globalSettings.autoCreatePurchaseOrders]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  // Cerrar modales con tecla ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (showAutoModal) setShowAutoModal(false);
        if (showCreateModal) setShowCreateModal(false);
        if (showEditModal) {
          setShowEditModal(false);
          setEditingOrder(null);
        }
        if (showReceiveModal) {
          setShowReceiveModal(false);
          setReceivingOrder(null);
        }
        if (showDeleteModal) {
          setShowDeleteModal(false);
          setOrderToDelete(null);
        }
        if (showEmailModal) {
          setShowEmailModal(false);
          setOrderToEmail(null);
        }
        if (selectedOrder) setSelectedOrder(null);
      }
    };
    
    if (showAutoModal || showCreateModal || showEditModal || showReceiveModal || selectedOrder) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [showAutoModal, showCreateModal, showEditModal, showReceiveModal, selectedOrder]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [ordersRes, suppliersRes, productsRes, settingsRes] = await Promise.all([
        getPurchaseOrders(),
        getSuppliers({ limit: 1000 }),
        getProducts({ limit: 1000 }),
        getSettings(),
      ]);
      
      const ordersData = ordersRes?.data || [];
      const suppliersData = suppliersRes?.data?.suppliers || suppliersRes?.data || [];
      const productsData = productsRes?.data?.products || productsRes?.data || [];
      
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setSettings(settingsRes?.data || settingsRes);
      setSuppliers(Array.isArray(suppliersData) ? suppliersData.filter(s => s.isActive) : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar datos');
      setOrders([]);
      setSuppliers([]);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = orders;

    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.genericSupplierName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    setFilteredOrders(filtered);
  };

  const getStatusColor = (status) => {
    const colors = {
      Pendiente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      Enviada: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'Recibida Parcial': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      Recibida: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      Cancelada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleGenerateAuto = async (config) => {
    try {
      const loadingToast = toast.loading('Generando órdenes de compra...');
      const response = await generateAutoPurchaseOrder(config);
      toast.dismiss(loadingToast);
      toast.success(response.data.message || `${response.data.orders?.length || 0} órdenes generadas exitosamente`);
      setShowAutoModal(false);
      fetchData();
    } catch (error) {
      console.error('Error al generar órdenes:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Error al generar órdenes';
      toast.error(errorMessage, { duration: 5000 });
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    // Si es "Recibida", abrir modal de confirmación solo si la recepción está habilitada
    if (newStatus === 'Recibida' && requireReception) {
      const order = orders.find(o => o._id === orderId);
      setReceivingOrder(order);
      setShowReceiveModal(true);
      return;
    }

    // Para otros estados, actualizar directamente
    try {
      await updateOrderStatus(orderId, {
        status: newStatus,
        receivedDate: null,
      });
      
      if (newStatus === 'Recibida') {
        invalidateCache();
      }
      
      toast.success('Estado actualizado correctamente');
      fetchData();
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      toast.error('Error al actualizar estado');
    }
  };

  const handleConfirmReceive = async (orderId, receivedQuantities, receiveNotes) => {
    try {
      // Obtener la orden actual para procesar las cantidades
      const order = orders.find(o => o._id === orderId);
      if (!order) {
        toast.error('Orden no encontrada');
        return;
      }

      // Verificar discrepancias
      const discrepancies = [];
      order.items.forEach(item => {
        const itemId = item._id || item.product?._id;
        const receivedQty = receivedQuantities[itemId] || 0;
        const orderedQty = item.quantity;
        
        if (receivedQty !== orderedQty) {
          discrepancies.push({
            product: item.product?.name || 'Producto',
            ordered: orderedQty,
            received: receivedQty,
            difference: receivedQty - orderedQty,
          });
        }
      });

      // Preparar notas con información de discrepancias
      let finalNotes = receiveNotes || '';
      if (discrepancies.length > 0) {
        finalNotes += '\n\n--- Discrepancias en Recepción ---\n';
        discrepancies.forEach(disc => {
          finalNotes += `${disc.product}: Pedido ${disc.ordered}, Recibido ${disc.received} (${disc.difference > 0 ? '+' : ''}${disc.difference})\n`;
        });
      }

      await updateOrderStatus(orderId, {
        status: 'Recibida',
        receivedDate: new Date(),
        receivedQuantities,
        receiveNotes: finalNotes,
      });
      
      // Invalidar caché de productos para que el inventario se actualice
      invalidateCache();
      
      if (discrepancies.length > 0) {
        toast.success(`Orden recibida con ${discrepancies.length} discrepancia(s) registrada(s)`, {
          duration: 4000,
        });
      } else {
        toast.success('Orden recibida correctamente - Todas las cantidades coinciden');
      }
      
      setShowReceiveModal(false);
      setReceivingOrder(null);
      fetchData();
    } catch (error) {
      console.error('Error al recibir orden:', error);
      toast.error('Error al recibir orden');
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setShowEditModal(true);
  };

  const handleDeleteOrder = (order) => {
    setOrderToDelete(order);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!orderToDelete) return;

    try {
      await deletePurchaseOrder(orderToDelete._id);
      toast.success('Orden eliminada correctamente');
      setShowDeleteModal(false);
      setOrderToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error al eliminar orden:', error);
      toast.error(error.response?.data?.message || 'Error al eliminar orden');
    }
  };

  const handleSendEmail = (order) => {
    if (!emailFeatureEnabled) {
      toast.error('El envío de correos está desactivado desde Configuración > Email.');
      return;
    }
    // Validar que el proveedor tenga email
    if (!order.supplier?.email) {
      toast.error('El proveedor no tiene email configurado. Por favor, actualiza los datos del proveedor.');
      return;
    }

    setOrderToEmail(order);
    setShowEmailModal(true);
  };

  const confirmSendEmail = async () => {
    if (!orderToEmail) return;
    if (!emailFeatureEnabled) {
      toast.error('El envío de correos está desactivado. Actívalo en Configuración > Email.');
      setShowEmailModal(false);
      setOrderToEmail(null);
      return;
    }

    try {
      setShowEmailModal(false);
      toast.loading('Enviando email con PDF adjunto...', { id: 'sending-email' });
      const response = await sendPurchaseOrderEmail(orderToEmail._id);
      toast.dismiss('sending-email');
      toast.success(response.data.message || `Email enviado a ${orderToEmail.supplier.email}`);
      setOrderToEmail(null);
      fetchData(); // Recargar para actualizar el campo emailSent
    } catch (error) {
      console.error('Error al enviar email:', error);
      toast.dismiss('sending-email');
      toast.error(error.response?.data?.message || 'Error al enviar email');
      setOrderToEmail(null);
    }
  };

  const handlePrint = (order) => {
    const printWindow = window.open('', '_blank');
    const companyName = settings?.businessName || globalSettings?.businessName || 'MECANET';
    const logoUrl = settings?.businessLogoUrl || globalSettings?.businessLogoUrl || '';
    
    writePrintDocument(printWindow, `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Orden de Compra ${escapeHtml(order.orderNumber)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
            .company-name { font-size: 24px; font-weight: bold; color: #333; margin: 10px 0; }
            .info { margin-bottom: 20px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .info-box { padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .total { text-align: right; font-weight: bold; margin-top: 20px; }
            .notes { margin-top: 30px; padding: 15px; background-color: #f9f9f9; border-left: 4px solid #333; }
            .notes-title { font-weight: bold; margin-bottom: 10px; }
            @media print {
              body { padding: 10px; }
              .header { page-break-after: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />` : ''}
            <div class="company-name">${escapeHtml(companyName)}</div>
            <h2 style="margin: 10px 0; color: #666;">Orden de Compra</h2>
            <h3 style="margin: 5px 0;">${escapeHtml(order.orderNumber)}</h3>
          </div>
          
          <div class="info-grid">
            <div class="info-box">
              <p><strong>Proveedor:</strong></p>
              <p>${escapeHtml(order.supplier?.name || order.genericSupplierName || 'Proveedor Genérico')}</p>
              ${order.supplier?.phone ? `<p><strong>Teléfono:</strong> ${escapeHtml(order.supplier.phone)}</p>` : ''}
              ${order.supplier?.email ? `<p><strong>Email:</strong> ${escapeHtml(order.supplier.email)}</p>` : ''}
            </div>
            <div class="info-box">
              <p><strong>Fecha de Orden:</strong> ${new Date(order.orderDate).toLocaleDateString()}</p>
              ${order.expectedDeliveryDate ? `<p><strong>Entrega Esperada:</strong> ${new Date(order.expectedDeliveryDate).toLocaleDateString()}</p>` : ''}
              <p><strong>Estado:</strong> <span style="color: ${order.status === 'Recibida' ? 'green' : order.status === 'Cancelada' ? 'red' : 'orange'};">${order.status}</span></p>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio Unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${escapeHtml(item.product?.sku || 'N/A')}</td>
                  <td>
                    ${escapeHtml(item.product?.name || 'Producto eliminado')}
                    ${item.product?.brand ? `<br/><small style="color: #666;">${escapeHtml(item.product.brand)}</small>` : ''}
                  </td>
                  <td>${item.quantity}</td>
                  <td>$${item.unitPrice.toFixed(2)}</td>
                  <td>$${item.subtotal.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="total">
            <p>Subtotal: $${order.subtotal.toFixed(2)}</p>
            <p>ITBIS (18%): $${order.tax.toFixed(2)}</p>
            <p style="font-size: 18px; margin-top: 10px;"><strong>Total: $${order.total.toFixed(2)}</strong></p>
          </div>
          
          ${order.notes ? `
            <div class="notes">
              <div class="notes-title">Notas:</div>
              <div>${escapeHtml(order.notes)}</div>
            </div>
          ` : ''}
          
          <div style="margin-top: 50px; text-align: center; color: #666; font-size: 12px;">
            <p>Documento generado el ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Mostrar skeleton mientras carga
  if (isLoading && orders.length === 0) {
    return <PurchaseOrdersSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Órdenes de Compra</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona las órdenes de compra a proveedores
          </p>
        </div>
        <div className="flex gap-3">
          {globalSettings.autoCreatePurchaseOrders && (
            <button
              onClick={() => setShowAutoModal(true)}
              className="btn btn-secondary flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" />
              Generar Automática
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nueva Orden
          </button>
        </div>
      </div>

        {!emailFeatureEnabled && (
          <div className="card-glass border border-amber-200 dark:border-amber-500/40 p-4 flex items-start gap-3 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">El envío de emails está desactivado.</p>
              <p className="text-xs">Activa el SMTP en Configuración &gt; Negocio para poder enviar órdenes a los proveedores.</p>
            </div>
          </div>
        )}

        {!requireReception && (
          <div className="card-glass border border-blue-200 dark:border-blue-500/40 p-4 flex items-start gap-3 text-blue-900 dark:text-blue-200">
            <Info className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Recepción manual desactivada.</p>
              <p className="text-xs">Las órdenes pueden marcarse como recibidas sin capturar cantidades ni fecha de recepción.</p>
            </div>
          </div>
        )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-strong rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Órdenes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{orders.length}</p>
            </div>
            <ClipboardList className="w-8 h-8 text-primary-600" />
          </div>
        </div>

        <div className="glass-strong rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">
                {orders.filter((o) => o.status === 'Pendiente').length}
              </p>
            </div>
            <Calendar className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="glass-strong rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Recibidas</p>
              <p className="text-2xl font-bold text-green-600">
                {orders.filter((o) => o.status === 'Recibida').length}
              </p>
            </div>
            <Check className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="glass-strong rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Invertido</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${orders.filter(o => o.status === 'Recibida').reduce((sum, o) => sum + o.total, 0).toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="glass-strong rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número de orden o proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-full md:w-48"
          >
            <option value="all">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Enviada">Enviada</option>
            <option value="Recibida Parcial">Recibida Parcial</option>
            <option value="Recibida">Recibida</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="glass-strong rounded-xl p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400 mt-4">Cargando órdenes...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="glass-strong rounded-xl p-12 text-center">
          <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {searchTerm || statusFilter !== 'all'
              ? 'No se encontraron órdenes'
              : 'No hay órdenes de compra'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {searchTerm || statusFilter !== 'all'
              ? 'Intenta con otros filtros'
              : 'Comienza creando tu primera orden o genera una automática'}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setShowAutoModal(true)} className="btn btn-secondary flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" />
              Generar Automática
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" />
              Nueva Orden
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Órdenes Activas */}
          {(() => {
            const activeOrders = filteredOrders.filter(o => 
              ['Pendiente', 'Enviada', 'Recibida Parcial'].includes(o.status)
            );
            return activeOrders.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary-600 to-transparent"></div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary-600" />
                    Órdenes Activas ({activeOrders.length})
                  </h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary-600 to-transparent"></div>
                </div>
                <div className="space-y-4">
                  {activeOrders.map((order) => (
            <div key={order._id} className="glass-strong rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {order.orderNumber}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Truck className="w-4 h-4" />
                      <span>{order.supplier?.name || order.genericSupplierName || 'Proveedor Genérico'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Package className="w-4 h-4" />
                      <span>{order.items.length} producto(s)</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(order.orderDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
                      <DollarSign className="w-4 h-4" />
                      <span>${order.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {order.status === 'Pendiente' && requireReception && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(order._id, 'Enviada')}
                        className="btn btn-sm btn-secondary flex items-center gap-1.5"
                        title="Marcar orden como enviada al proveedor. La orden está en camino."
                      >
                        <Send className="w-4 h-4" />
                        Enviar
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(order._id, 'Recibida')}
                        className="btn btn-sm btn-primary flex items-center gap-1.5"
                        title="Marcar como recibida. Los productos llegarán al inventario."
                      >
                        <Package className="w-4 h-4" />
                        Recibir
                      </button>
                    </>
                  )}
                  {order.status === 'Pendiente' && !requireReception && (
                    <button
                      onClick={() => handleUpdateStatus(order._id, 'Recibida')}
                      className="btn btn-sm btn-primary flex items-center gap-1.5"
                      title="Completar la orden sin registrar recepción."
                    >
                      <Package className="w-4 h-4" />
                      Finalizar
                    </button>
                  )}
                  {order.status === 'Enviada' && requireReception && (
                    <button
                      onClick={() => handleUpdateStatus(order._id, 'Recibida')}
                      className="btn btn-sm btn-primary flex items-center gap-1.5"
                      title="Marcar como recibida. Los productos se agregarán al inventario automáticamente."
                    >
                      <Package className="w-4 h-4" />
                      Marcar Recibida
                    </button>
                  )}
                  {order.status === 'Enviada' && !requireReception && (
                    <button
                      onClick={() => handleUpdateStatus(order._id, 'Recibida')}
                      className="btn btn-sm btn-primary flex items-center gap-1.5"
                      title="Completar la orden sin registrar recepción."
                    >
                      <Package className="w-4 h-4" />
                      Finalizar
                    </button>
                  )}
                  <button
                    onClick={() => handlePrint(order)}
                    className="btn btn-sm btn-secondary"
                    title="Imprimir orden"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSendEmail(order)}
                    className={`btn btn-sm ${order.emailSent ? 'btn-success' : 'btn-primary'} flex items-center gap-1.5 ${(!order.supplier?.email || !emailFeatureEnabled) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    title={!emailFeatureEnabled
                      ? 'El envío de correos está desactivado'
                      : order.emailSent
                        ? `Email enviado el ${new Date(order.emailSentDate).toLocaleDateString()}`
                        : 'Enviar orden por email al proveedor'}
                    disabled={!order.supplier?.email || !emailFeatureEnabled}
                  >
                    <Mail className="w-4 h-4" />
                    {order.emailSent ? 'Reenviar' : 'Enviar Email'}
                  </button>
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="btn btn-sm btn-secondary"
                    title="Ver detalles"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {order.status === 'Pendiente' && (
                    <>
                      <button
                        onClick={() => handleEditOrder(order)}
                        className="btn btn-sm btn-secondary"
                        title="Editar orden"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order)}
                        className="btn btn-sm bg-red-600 hover:bg-red-700 text-white"
                        title="Eliminar orden"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Items preview */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-gray-600 dark:text-gray-400">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <div key={idx}>
                      • {item.product?.name || 'Producto eliminado'} x{item.quantity}
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="text-gray-500">
                      +{order.items.length - 3} producto(s) más
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
                </div>
              </div>
            );
          })()}

          {/* Órdenes Completadas/Canceladas */}
          {(() => {
            const completedOrders = filteredOrders.filter(o => 
              ['Recibida', 'Cancelada'].includes(o.status)
            );
            return completedOrders.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent"></div>
                  <h3 className="text-lg font-bold text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Órdenes Completadas ({completedOrders.length})
                  </h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-400 to-transparent"></div>
                </div>
                <div className="space-y-4 opacity-75">
                  {completedOrders.map((order) => (
                    <div key={order._id} className="glass-strong rounded-xl p-6 hover:shadow-lg transition-shadow">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-4 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {order.orderNumber}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                              <Truck className="w-4 h-4" />
                              <span>{order.supplier?.name || order.genericSupplierName || 'Proveedor Genérico'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                              <Package className="w-4 h-4" />
                              <span>{order.items.length} producto(s)</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                              <Calendar className="w-4 h-4" />
                              <span>{new Date(order.orderDate).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold">
                              <DollarSign className="w-4 h-4" />
                              <span>${order.total.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handlePrint(order)}
                            className="btn btn-sm btn-secondary"
                            title="Imprimir orden"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="btn btn-sm btn-secondary"
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Items preview */}
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-gray-600 dark:text-gray-400">
                          {order.items.slice(0, 3).map((item, idx) => (
                            <div key={idx}>
                              • {item.product?.name || 'Producto eliminado'} x{item.quantity}
                            </div>
                          ))}
                          {order.items.length > 3 && (
                            <div className="text-gray-500">
                              +{order.items.length - 3} producto(s) más
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Auto Order Modal - Lo crearemos después */}
      {showAutoModal && (
        <AutoOrderModal
          suppliers={suppliers}
          products={products}
          onClose={() => setShowAutoModal(false)}
          onGenerate={handleGenerateAuto}
        />
      )}

      {/* Create Order Modal */}
      {showCreateModal && (
        <CreateOrderModal
          suppliers={suppliers}
          products={products}
          onClose={() => setShowCreateModal(false)}
          onSave={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}

      {/* Edit Order Modal */}
      {showEditModal && editingOrder && (
        <CreateOrderModal
          suppliers={suppliers}
          products={products}
          editingOrder={editingOrder}
          onClose={() => {
            setShowEditModal(false);
            setEditingOrder(null);
          }}
          onSave={() => {
            setShowEditModal(false);
            setEditingOrder(null);
            fetchData();
          }}
        />
      )}

      {/* Order Details Modal - Lo crearemos después */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Receive Order Confirmation Modal */}
      {showReceiveModal && receivingOrder && (
        <ReceiveOrderModal
          order={receivingOrder}
          onClose={() => {
            setShowReceiveModal(false);
            setReceivingOrder(null);
          }}
          onConfirm={handleConfirmReceive}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && orderToDelete && createPortal(
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" 
          style={{ zIndex: 100000 }}
          onClick={() => {
            setShowDeleteModal(false);
            setOrderToDelete(null);
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in" 
            style={{ backgroundColor: 'white', color: '#111827' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center mb-2" style={{ color: '#111827' }}>
              ¿Eliminar Orden de Compra?
            </h3>

            {/* Message */}
            <div className="space-y-3 mb-6">
              <p className="text-center" style={{ color: '#4B5563' }}>
                Estás a punto de eliminar la orden de compra:
              </p>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="font-semibold text-center" style={{ color: '#111827' }}>
                  #{orderToDelete.orderNumber}
                </p>
                <p className="text-sm text-center mt-1" style={{ color: '#6B7280' }}>
                  Proveedor: {orderToDelete.supplier?.name}
                </p>
                <p className="text-sm text-center" style={{ color: '#6B7280' }}>
                  Total: ${orderToDelete.total?.toFixed(2)}
                </p>
              </div>
              <p className="text-sm text-center font-medium" style={{ color: '#DC2626' }}>
                ⚠️ Esta acción no se puede deshacer
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setOrderToDelete(null);
                }}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="btn bg-red-600 hover:bg-red-700 text-white flex-1 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Email Confirmation Modal */}
      {showEmailModal && orderToEmail && createPortal(
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" 
          style={{ zIndex: 100000 }}
          onClick={() => {
            setShowEmailModal(false);
            setOrderToEmail(null);
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in" 
            style={{ backgroundColor: 'white', color: '#111827' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center mb-2" style={{ color: '#111827' }}>
              {orderToEmail.emailSent ? '¿Reenviar Orden por Email?' : '¿Enviar Orden por Email?'}
            </h3>

            {/* Message */}
            <div className="space-y-3 mb-6">
              <p className="text-center" style={{ color: '#4B5563' }}>
                {orderToEmail.emailSent 
                  ? 'Esta orden ya fue enviada anteriormente. ¿Deseas reenviarla?'
                  : 'Se enviará la orden de compra al proveedor por email:'
                }
              </p>
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <p className="font-semibold text-center" style={{ color: '#111827' }}>
                  #{orderToEmail.orderNumber}
                </p>
                <p className="text-sm text-center mt-2" style={{ color: '#6B7280' }}>
                  <strong>Proveedor:</strong> {orderToEmail.supplier?.name}
                </p>
                <p className="text-sm text-center font-medium" style={{ color: '#2563EB' }}>
                  📧 {orderToEmail.supplier?.email}
                </p>
                <p className="text-sm text-center mt-2" style={{ color: '#6B7280' }}>
                  Total: ${orderToEmail.total?.toFixed(2)}
                </p>
              </div>
              {orderToEmail.emailSent && orderToEmail.emailSentDate && (
                <p className="text-xs text-center" style={{ color: '#9CA3AF' }}>
                  Último envío: {new Date(orderToEmail.emailSentDate).toLocaleString('es-DO')}
                </p>
              )}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-center" style={{ color: '#1E3A8A' }}>
                  <strong>📎 Se incluirá:</strong>
                </p>
                <ul className="text-xs mt-2 space-y-1" style={{ color: '#1E40AF', listStyle: 'none' }}>
                  <li className="text-center">✓ Email HTML con tabla de productos</li>
                  <li className="text-center">✓ PDF adjunto con la orden completa</li>
                </ul>
              </div>
            </div>

            {!emailFeatureEnabled && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                Activa el SMTP en Configuración &gt; Email para poder enviar órdenes por correo.
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setOrderToEmail(null);
                }}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={confirmSendEmail}
                className={`btn btn-primary flex-1 flex items-center justify-center gap-2 ${!emailFeatureEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                disabled={!emailFeatureEnabled}
              >
                <Mail className="w-4 h-4" />
                {orderToEmail.emailSent ? 'Reenviar' : 'Enviar Email'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Sub-componentes (modales)
const AutoOrderModal = ({ suppliers, products, onClose, onGenerate }) => {
  const [config, setConfig] = useState({
    supplierId: '',
    productIds: [],
  });

  // Filtrar productos con stock bajo (incluir los que NO tienen proveedor)
  const lowStockProducts = products.filter(p => {
    const isLowStock = p.stock <= p.lowStockThreshold;
    
    if (!config.supplierId) return isLowStock; // Mostrar todos los productos con stock bajo
    
    // Si hay proveedor seleccionado, filtrar por ese proveedor
    const productSupplierId = p.supplier?._id || p.supplier;
    return isLowStock && productSupplierId === config.supplierId;
  });

  const productsWithoutSupplier = lowStockProducts.filter(p => 
    !p.supplier || (!p.supplier._id && !p.supplier)
  );

  const handleGenerate = () => {
    if (lowStockProducts.length === 0) {
      toast.error('No hay productos con stock bajo');
      return;
    }
    onGenerate(config);
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" />
            Generar Orden Automática
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Productos con stock bajo: {lowStockProducts.length}</strong>
              {productsWithoutSupplier.length > 0 && (
                <span className="text-yellow-600 dark:text-yellow-400 ml-2">
                  ({productsWithoutSupplier.length} sin proveedor)
                </span>
              )}
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              Se generarán órdenes automáticas agrupadas por proveedor. Los productos sin proveedor se agruparán en una orden genérica.
            </p>
          </div>

          {productsWithoutSupplier.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>ℹ️ Nota: {productsWithoutSupplier.length} producto(s) sin proveedor asignado</strong>
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Estos productos se incluirán en una orden con proveedor "Genérico". Puedes asignar proveedores específicos en el inventario.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filtrar por Proveedor (Opcional)
            </label>
            <select
              value={config.supplierId}
              onChange={(e) => setConfig({ ...config, supplierId: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">
              Productos a incluir ({lowStockProducts.length})
            </h3>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {lowStockProducts.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-center py-8">
                  No hay productos con stock bajo
                </p>
              ) : (
                lowStockProducts.map((product) => (
                  <div
                    key={product._id}
                    className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">{product.name}</p>
                        <p className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1 mt-1">
                          <Truck className="w-3 h-3" />
                          {product.supplier?.name || 'Sin proveedor'}
                        </p>
                      </div>
                      <div className="text-sm text-red-600 dark:text-red-400 font-medium text-right">
                        Pedir: {Math.max((product.lowStockThreshold * 2) - product.stock, 1)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>Stock: {product.stock}</span>
                      <span>Mínimo: {product.lowStockThreshold}</span>
                      <span className="text-red-600 dark:text-red-400">Déficit: {product.lowStockThreshold - product.stock}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleGenerate}
              disabled={lowStockProducts.length === 0}
              className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="w-5 h-5 mr-2" />
              Generar Órdenes
            </button>
            <button onClick={onClose} className="btn btn-secondary flex-1">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Create/Edit Order Modal - Rediseñado
const CreateOrderModal = ({ suppliers, products, editingOrder, onClose, onSave }) => {
  // Estado del carrito
  const [cart, setCart] = useState(editingOrder?.items?.map(item => ({
    product: item.product?._id || item.product,
    productData: item.product,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  })) || []);

  // Estado del formulario
  const [supplier, setSupplier] = useState(editingOrder?.supplier?._id || editingOrder?.supplier || '');
  const [genericSupplierName, setGenericSupplierName] = useState(editingOrder?.genericSupplierName || '');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    editingOrder?.expectedDeliveryDate 
      ? new Date(editingOrder.expectedDeliveryDate).toISOString().split('T')[0] 
      : ''
  );
  const [notes, setNotes] = useState(editingOrder?.notes || '');

  // Estado de búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); // all, outOfStock, lowStock, normal

  // Productos ordenados y filtrados
  const sortedAndFilteredProducts = products
    .filter(p => {
      // Filtro de búsqueda
      const matchSearch = !searchTerm || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtro de categoría
      const matchCategory = !categoryFilter || p.category === categoryFilter;

      // Filtro de marca
      const matchBrand = !brandFilter || p.brand === brandFilter;

      // Filtro de stock
      let matchStock = true;
      if (stockFilter === 'outOfStock') matchStock = p.stock === 0;
      else if (stockFilter === 'lowStock') matchStock = p.stock > 0 && p.stock <= p.lowStockThreshold;
      else if (stockFilter === 'normal') matchStock = p.stock > p.lowStockThreshold;

      return matchSearch && matchCategory && matchBrand && matchStock;
    })
    .sort((a, b) => {
      // Agotados primero
      if (a.stock === 0 && b.stock !== 0) return -1;
      if (a.stock !== 0 && b.stock === 0) return 1;
      // Stock bajo después
      const aLow = a.stock > 0 && a.stock <= a.lowStockThreshold;
      const bLow = b.stock > 0 && b.stock <= b.lowStockThreshold;
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      // Stock normal al final, ordenado alfabéticamente
      return a.name.localeCompare(b.name);
    });

  // Extraer categorías y marcas únicas
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  // Calcular totales (manejar valores vacíos)
  const subtotal = cart.reduce((sum, item) => {
    const qty = typeof item.quantity === 'number' ? item.quantity : (parseInt(item.quantity) || 0);
    const price = typeof item.unitPrice === 'number' ? item.unitPrice : (parseFloat(item.unitPrice) || 0);
    return sum + (qty * price);
  }, 0);
  const tax = subtotal * 0.18;
  const total = subtotal + tax;

  // Agregar producto al carrito
  const addToCart = (product) => {
    // Verificar si ya está en el carrito
    const existingItem = cart.find(item => item.product === product._id);
    if (existingItem) {
      toast.info('Este producto ya está en el carrito');
      return;
    }

    // Calcular cantidad óptima:
    // Si tiene reorderPoint definido, llevar hasta ese nivel
    // Si no, usar el doble del lowStockThreshold como stock normal
    const targetStock = product.reorderPoint || (product.lowStockThreshold * 2);
    const optimalQuantity = Math.max(1, targetStock - product.stock);

    const newItem = {
      product: product._id,
      productData: product,
      quantity: optimalQuantity,
      unitPrice: 0, // Precio opcional, el proveedor lo define
    };

    setCart([...cart, newItem]);
    
    // Auto-seleccionar proveedor si no hay uno seleccionado
    if (!supplier && (product.supplier?._id || product.supplier)) {
      setSupplier(product.supplier?._id || product.supplier);
    }
  };

  // Actualizar cantidad del producto en el carrito
  const updateQuantity = (productId, newQuantity) => {
    // Permitir valores vacíos para que el usuario pueda borrar
    if (newQuantity === '' || newQuantity === null || newQuantity === undefined) {
      setCart(cart.map(item => 
        item.product === productId ? { ...item, quantity: '' } : item
      ));
      return;
    }
    const quantity = parseInt(newQuantity);
    if (!isNaN(quantity) && quantity >= 1) {
      setCart(cart.map(item => 
        item.product === productId ? { ...item, quantity: quantity } : item
      ));
    }
  };

  // Actualizar precio del producto en el carrito
  const updatePrice = (productId, newPrice) => {
    // Permitir valores vacíos para que el usuario pueda borrar
    if (newPrice === '' || newPrice === null || newPrice === undefined) {
      setCart(cart.map(item => 
        item.product === productId ? { ...item, unitPrice: '' } : item
      ));
      return;
    }
    const price = parseFloat(newPrice);
    if (!isNaN(price) && price >= 0) {
      setCart(cart.map(item => 
        item.product === productId ? { ...item, unitPrice: price } : item
      ));
    }
  };

  // Remover producto del carrito
  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product !== productId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!supplier && !genericSupplierName.trim()) {
      toast.error('Debe especificar un proveedor o ingresar un nombre genérico');
      return;
    }

    if (cart.length === 0) {
      toast.error('Debe agregar al menos un producto');
      return;
    }

    try {
      const orderData = {
        items: cart.map(item => ({
          product: item.product,
          quantity: parseInt(item.quantity),
          unitPrice: item.unitPrice !== '' ? parseFloat(item.unitPrice) : 0,
        })),
        notes,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
      };

      // Solo agregar supplier si se seleccionó uno
      if (supplier) {
        orderData.supplier = supplier;
      }

      // Agregar nombre de proveedor genérico si se escribió
      if (!supplier && genericSupplierName.trim()) {
        orderData.genericSupplierName = genericSupplierName.trim();
      }

      if (editingOrder) {
        await updatePurchaseOrder(editingOrder._id, orderData);
        toast.success('Orden actualizada correctamente');
      } else {
        await createPurchaseOrder(orderData);
        toast.success('Orden creada correctamente');
      }

      onSave();
    } catch (error) {
      console.error('Error al guardar orden:', error);
      toast.error(error.response?.data?.message || 'Error al guardar orden');
    }
  };

  const getStockBadge = (product) => {
    if (product.stock === 0) {
      return { text: 'Agotado', class: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' };
    } else if (product.stock <= product.lowStockThreshold) {
      return { text: 'Stock Bajo', class: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' };
    } else {
      return { text: 'Stock OK', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' };
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-[95vw] h-[85vh] flex flex-col my-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-primary-600" />
            {editingOrder ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* LEFT COLUMN - Product Browser (60%) */}
          <div className="flex-[3] flex flex-col overflow-hidden">
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, SKU o marca..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input w-full pl-10"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="">Todas las categorías</option>
                  {[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="">Todas las marcas</option>
                  {[...new Set(products.map(p => p.brand).filter(Boolean))].sort().map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="all">Todo el stock</option>
                  <option value="outOfStock">Agotados</option>
                  <option value="lowStock">Stock Bajo</option>
                  <option value="normal">Stock Normal</option>
                </select>
              </div>
            </div>

            {/* Products Table */}
            <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Producto</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-400">Stock Actual</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Estado</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Precio</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-400">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedAndFilteredProducts.map((product) => {
                    const badge = getStockBadge(product);
                    const inCart = cart.some(item => item.product === product._id);
                    
                    return (
                      <tr key={product._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 text-gray-900 dark:text-white font-mono text-xs">
                          {product.sku}
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-gray-900 dark:text-white font-medium">{product.name}</div>
                          <div className="text-xs text-gray-500">{product.brand}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-gray-900 dark:text-white font-semibold">
                            {product.stock}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                            / {product.reorderPoint || (product.lowStockThreshold * 2)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>
                            {badge.text}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-white font-medium">
                          ${product.purchasePrice?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            disabled={inCart}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 mx-auto ${
                              inCart
                                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                : 'bg-primary-600 hover:bg-primary-700 text-white'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                            {inCart ? 'Agregado' : 'Agregar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sortedAndFilteredProducts.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No se encontraron productos
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN - Cart & Form (40%) */}
          <div className="flex-[2] flex flex-col overflow-hidden glass-light rounded-lg p-4">
            {/* Cart Header */}
            <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                Carrito ({cart.length})
              </h3>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-auto mb-4 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay productos seleccionados</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product} className="glass-light rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.productData.name}</p>
                        <p className="text-xs text-gray-500">{item.productData.sku}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cantidad *</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product, e.target.value)}
                          className="input w-full text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Precio (opcional)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updatePrice(item.product, e.target.value)}
                          className="input w-full text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-right text-sm font-medium text-gray-900 dark:text-white">
                      Subtotal: ${((typeof item.quantity === 'number' ? item.quantity : (parseInt(item.quantity) || 0)) * (typeof item.unitPrice === 'number' ? item.unitPrice : (parseFloat(item.unitPrice) || 0))).toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Supplier & Details */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Proveedor
                </label>
                <select
                  value={supplier}
                  onChange={(e) => {
                    setSupplier(e.target.value);
                    if (e.target.value) setGenericSupplierName('');
                  }}
                  className="input w-full"
                >
                  <option value="">Proveedor Genérico / Otro</option>
                  {suppliers.filter(s => s.isActive).map((sup) => (
                    <option key={sup._id} value={sup._id}>
                      {sup.name}
                    </option>
                  ))}
                </select>
              </div>

              {!supplier && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre del Proveedor *
                  </label>
                  <input
                    type="text"
                    value={genericSupplierName}
                    onChange={(e) => setGenericSupplierName(e.target.value)}
                    className="input w-full"
                    placeholder="Ej: Ferreteria Local, Vendedor Juan, etc."
                    required={!supplier}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Fecha de Entrega
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notas
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full"
                  rows="2"
                  placeholder="Información adicional..."
                />
              </div>
            </div>

            {/* Totals */}
            {subtotal > 0 && (
              <div className="glass-light rounded-lg p-3 mb-4">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>Subtotal:</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>ITBIS (18%):</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-300 dark:border-gray-600">
                    <span>Total:</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
            {subtotal === 0 && cart.length > 0 && (
              <div className="glass-light rounded-lg p-3 mb-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  💡 Los precios se definirán con el proveedor
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button 
                type="submit" 
                disabled={cart.length === 0 || (!supplier && !genericSupplierName.trim())}
                className="btn btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {editingOrder ? 'Actualizar' : 'Crear'} Orden
              </button>
              <button 
                type="button" 
                onClick={onClose} 
                className="btn btn-secondary flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

const OrderDetailsModal = ({ order, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Detalles de Orden {order.orderNumber}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Proveedor</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {order.supplier?.name || order.genericSupplierName || 'Proveedor Genérico'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Estado</p>
              <p className="font-medium text-gray-900 dark:text-white">{order.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Fecha</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(order.orderDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              <p className="font-medium text-gray-900 dark:text-white">${order.total.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Productos</h3>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg flex justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.product?.name || 'Producto eliminado'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Cantidad: {item.quantity} x ${item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    ${item.subtotal.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Subtotal:</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>ITBIS (18%):</span>
              <span>${order.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-300 dark:border-gray-600">
              <span>Total:</span>
              <span>${order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Receive Order Confirmation Modal
const ReceiveOrderModal = ({ order, onClose, onConfirm }) => {
  const [checkedItems, setCheckedItems] = useState({});
  const [receivedQuantities, setReceivedQuantities] = useState({});
  const [notes, setNotes] = useState('');
  const [allChecked, setAllChecked] = useState(false);

  // Inicializar cantidades recibidas con las cantidades pedidas
  useEffect(() => {
    const initialQuantities = {};
    order.items.forEach(item => {
      const itemId = item._id || item.product?._id;
      initialQuantities[itemId] = item.quantity;
    });
    setReceivedQuantities(initialQuantities);
  }, [order.items]);

  // Cerrar con ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleCheckItem = (itemId) => {
    const newCheckedItems = {
      ...checkedItems,
      [itemId]: !checkedItems[itemId],
    };
    setCheckedItems(newCheckedItems);
    
    // Verificar si todos están marcados
    const allItemsChecked = order.items.every(item => newCheckedItems[item._id || item.product._id]);
    setAllChecked(allItemsChecked);
  };

  const handleQuantityChange = (itemId, newQuantity) => {
    // Permitir valores vacíos para que el usuario pueda borrar
    if (newQuantity === '' || newQuantity === null || newQuantity === undefined) {
      setReceivedQuantities({
        ...receivedQuantities,
        [itemId]: '',
      });
      return;
    }
    const quantity = parseInt(newQuantity);
    if (!isNaN(quantity) && quantity >= 0) {
      setReceivedQuantities({
        ...receivedQuantities,
        [itemId]: quantity,
      });
    }
  };

  const handleCheckAll = () => {
    if (allChecked) {
      setCheckedItems({});
      setAllChecked(false);
    } else {
      const newCheckedItems = {};
      order.items.forEach(item => {
        newCheckedItems[item._id || item.product._id] = true;
      });
      setCheckedItems(newCheckedItems);
      setAllChecked(true);
    }
  };

  const handleConfirm = () => {
    if (!allChecked) {
      toast.error('Debe verificar todos los productos antes de confirmar la recepción');
      return;
    }
    onConfirm(order._id, receivedQuantities, notes);
  };

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-primary-600" />
              Confirmar Recepción de Orden
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {order.orderNumber} - {order.supplier?.name || order.genericSupplierName || 'Proveedor Genérico'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Instrucciones */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                  Lista de Verificación de Recepción
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  Verifique que cada producto haya sido recibido en la cantidad correcta y en buen estado.
                  Marque cada ítem a medida que lo verifique.
                </p>
              </div>
            </div>
          </div>

          {/* Progreso */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30">
                <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
                  {checkedCount}/{order.items.length}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Progreso de Verificación</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {checkedCount === order.items.length ? '¡Todos los productos verificados!' : `${order.items.length - checkedCount} producto(s) pendiente(s)`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCheckAll}
              className="btn-secondary text-sm"
            >
              {allChecked ? 'Desmarcar Todo' : 'Marcar Todo'}
            </button>
          </div>

          {/* Lista de Productos */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Productos en esta Orden
            </h3>
            <div className="space-y-2">
              {order.items.map((item, idx) => {
                const itemId = item._id || item.product?._id || idx;
                const isChecked = checkedItems[itemId] || false;
                const receivedQty = receivedQuantities[itemId] !== undefined && receivedQuantities[itemId] !== '' 
                  ? receivedQuantities[itemId] 
                  : item.quantity;
                const numericReceivedQty = receivedQty === '' ? 0 : (typeof receivedQty === 'number' ? receivedQty : parseInt(receivedQty) || 0);
                const hasDiscrepancy = numericReceivedQty !== item.quantity;
                
                return (
                  <div
                    key={itemId}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      isChecked
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 pt-1">
                        <div 
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                            isChecked
                              ? 'border-green-500 bg-green-500'
                              : 'border-gray-300 dark:border-gray-600 hover:border-primary-500'
                          }`}
                          onClick={() => handleCheckItem(itemId)}
                        >
                          {isChecked && <Check className="w-4 h-4 text-white" />}
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {item.product?.name || 'Producto eliminado'}
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              SKU: {item.product?.sku || 'N/A'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              ${item.subtotal.toFixed(2)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              ${item.unitPrice.toFixed(2)} c/u
                            </p>
                          </div>
                        </div>
                        
                        {/* Campo de cantidad recibida */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Cantidad pedida:
                            </label>
                            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-semibold text-gray-900 dark:text-white">
                              {item.quantity}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Cantidad recibida:
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={receivedQty}
                              onChange={(e) => handleQuantityChange(itemId, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className={`input w-24 text-sm text-center ${
                                hasDiscrepancy 
                                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' 
                                  : ''
                              }`}
                            />
                          </div>
                          
                          {hasDiscrepancy && (
                            <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="text-xs font-medium">
                                {numericReceivedQty > item.quantity ? 'Exceso' : 'Faltante'}: {Math.abs(numericReceivedQty - item.quantity)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notas adicionales */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas de Recepción (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input w-full"
              rows="3"
              placeholder="Ej: Todos los productos en buen estado, embalaje correcto..."
            />
          </div>

          {/* Resumen */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div className="space-y-1">
                <p className="text-gray-600 dark:text-gray-400">Total de Productos:</p>
                <p className="font-semibold text-gray-900 dark:text-white">{order.items.length} ítem(s)</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-600 dark:text-gray-400">Valor Total:</p>
                <p className="font-semibold text-gray-900 dark:text-white">${order.total.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!allChecked}
              className={`btn-primary flex-1 flex items-center justify-center gap-2 ${
                !allChecked ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Check className="w-5 h-5" />
              Confirmar Recepción y Actualizar Stock
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
          </div>

          {!allChecked && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400 text-center">
              ⚠️ Debe verificar todos los productos antes de confirmar la recepción
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PurchaseOrders;
