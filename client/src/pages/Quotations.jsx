import { writePrintDocument, escapeHtml } from '../utils/safeDocuments';
/**
 * @file Quotations.jsx
 * @description Gestión de Cotizaciones - Crear presupuestos y convertirlos en ventas
 * 
 * Características:
 * - Listar cotizaciones con filtros (estado, cliente, fechas)
 * - Crear nueva cotización
 * - Ver detalle de cotización
 * - Editar cotización (solo si está Pendiente)
 * - Convertir cotización a venta
 * - Eliminar cotización (solo admin)
 * - Badges de estado con colores
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getQuotations,
  getQuotationById,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  convertQuotationToSale,
  updateQuotationStatus,
  getCustomers,
  getProducts,
} from '../services/api';
import toast from 'react-hot-toast';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  Check,
  X,
  ShoppingCart,
  Calendar,
  User,
  UserPlus,
  Phone,
  StickyNote,
  Package,
  DollarSign,
  AlertCircle,
  Printer,
} from 'lucide-react';

const addBusinessDaysClient = (startDate, days) => {
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

const getDefaultValidDateString = () => {
  return addBusinessDaysClient(new Date(), 5).toISOString().split('T')[0];
};

const Quotations = () => {
  const [quotations, setQuotations] = useState([]);
  const [filteredQuotations, setFilteredQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [quotationToPrint, setQuotationToPrint] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterQuotations();
  }, [quotations, searchTerm, statusFilter]);

  const getCustomerDisplayName = (quotation) => (
    quotation.customer?.fullName || quotation.genericCustomerName || 'Cliente Genérico'
  );

  const getCustomerDisplayContact = (quotation) => (
    quotation.customer?.phone || quotation.genericCustomerContact || ''
  );

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [quotationsRes, customersRes, productsRes] = await Promise.all([
        getQuotations(),
        getCustomers({ limit: 1000 }),
        getProducts({ limit: 1000 }),
      ]);

      setQuotations(Array.isArray(quotationsRes.data) ? quotationsRes.data : []);
      setCustomers(Array.isArray(customersRes.data?.customers) ? customersRes.data.customers : []);
      setProducts(Array.isArray(productsRes.data?.products) ? productsRes.data.products : []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('Error al cargar datos');
      setQuotations([]);
      setCustomers([]);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterQuotations = () => {
    let filtered = quotations;

    if (searchTerm) {
      const normalizedTerm = searchTerm.toLowerCase();
      filtered = filtered.filter((q) => {
        const customerName = getCustomerDisplayName(q).toLowerCase();
        return (
          q.quotationNumber?.toLowerCase().includes(normalizedTerm) ||
          customerName.includes(normalizedTerm)
        );
      });
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((q) => q.status === statusFilter);
    }

    setFilteredQuotations(filtered);
  };

  const handleCreateOrEdit = async (data) => {
    try {
      if (editingQuotation) {
        await updateQuotation(editingQuotation._id, data);
        toast.success('Cotización actualizada');
      } else {
        const response = await createQuotation(data);
        const createdQuotation = response?.data;
        toast.success('Cotización creada');
        if (createdQuotation) {
          setQuotationToPrint(createdQuotation);
          setShowPrintModal(true);
        }
      }
      setShowCreateModal(false);
      setEditingQuotation(null);
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || 'Error al guardar cotización');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta cotización?')) return;
    
    try {
      await deleteQuotation(id);
      toast.success('Cotización eliminada');
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || 'Error al eliminar');
    }
  };

  const handleConvert = async (quotation) => {
    const paymentMethod = prompt('Método de pago (Efectivo/Tarjeta/Transferencia):');
    if (!paymentMethod) return;

    if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(paymentMethod)) {
      toast.error('Método de pago inválido');
      return;
    }

    try {
      await convertQuotationToSale(quotation._id, { paymentMethod });
      toast.success('Cotización convertida en venta');
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || 'Error al convertir');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Pendiente': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      'Aprobada': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      'Rechazada': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      'Convertida': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      'Vencida': 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400',
    };
    return styles[status] || styles['Pendiente'];
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handlePrintQuotation = (quotation) => {
    if (!quotation) return;

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      toast.error('No se pudo abrir la ventana de impresión');
      return;
    }

    const customerName = getCustomerDisplayName(quotation);
    const customerContact = getCustomerDisplayContact(quotation) || 'N/A';
    const validUntilDisplay = quotation.validUntil ? formatDate(quotation.validUntil) : 'N/A';
    const createdDate = quotation.createdAt ? formatDate(quotation.createdAt) : formatDate(new Date());
    const itemsRows = (quotation.items || []).map((item, index) => {
      const productName = item.product?.name || 'Producto';
      const qty = item.quantity || 0;
      const unit = formatCurrency(item.unitPrice || 0);
      const subtotal = formatCurrency(item.subtotal || (item.unitPrice || 0) * qty);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(productName)}</td>
          <td>${qty}</td>
          <td>${unit}</td>
          <td>${subtotal}</td>
        </tr>
      `;
    }).join('');

    writePrintDocument(printWindow, `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Cotización ${escapeHtml(quotation.quotationNumber || '')}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 24px; color: #111827; }
            h1 { text-align: center; margin-bottom: 8px; }
            .meta { text-align: center; color: #6b7280; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f3f4f6; }
            .totals { margin-top: 16px; width: 40%; float: right; }
            .totals td { border: none; padding: 4px 8px; }
            .totals tr:last-child td { font-size: 16px; font-weight: bold; border-top: 1px solid #d1d5db; }
            .notes { margin-top: 32px; font-size: 12px; color: #374151; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <h1>Cotización</h1>
          <div class="meta">
            <div><strong>Número:</strong> ${escapeHtml(quotation.quotationNumber || 'N/A')}</div>
            <div><strong>Fecha:</strong> ${createdDate}</div>
            <div><strong>Válida hasta:</strong> ${validUntilDisplay}</div>
          </div>

          <div style="margin-bottom: 16px;">
            <strong>Cliente:</strong> ${escapeHtml(customerName)}<br />
            <strong>Contacto:</strong> ${escapeHtml(customerContact)}
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows || '<tr><td colspan="5" style="text-align:center; padding:16px;">Sin productos</td></tr>'}
            </tbody>
          </table>

          <table class="totals">
            <tr>
              <td>Subtotal:</td>
              <td>${formatCurrency(quotation.subtotal || 0)}</td>
            </tr>
            <tr>
              <td>Impuestos:</td>
              <td>${formatCurrency(quotation.tax || 0)}</td>
            </tr>
            <tr>
              <td>Total:</td>
              <td>${formatCurrency(quotation.total || 0)}</td>
            </tr>
          </table>

          ${quotation.notes ? `<div class="notes"><strong>Notas:</strong> ${escapeHtml(quotation.notes)}</div>` : ''}
          ${quotation.terms ? `<div class="notes"><strong>Términos:</strong> ${escapeHtml(quotation.terms)}</div>` : ''}

          <div class="footer">
            Gracias por su preferencia
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  if (isLoading && quotations.length === 0) {
    return (
      <div className="animate-fade-in p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-primary-600" />
            Cotizaciones
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona presupuestos y conviértelos en ventas
          </p>
        </div>
        <button
          onClick={() => {
            setEditingQuotation(null);
            setShowCreateModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nueva Cotización
        </button>
      </div>

      {/* Filters */}
      <div className="card-glass p-4 mb-6">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número o cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-48"
          >
            <option value="all">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Aprobada">Aprobada</option>
            <option value="Rechazada">Rechazada</option>
            <option value="Convertida">Convertida</option>
            <option value="Vencida">Vencida</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{quotations.length}</p>
            </div>
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">{quotations.filter(q => q.status === 'Pendiente').length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Convertidas</p>
              <p className="text-2xl font-bold text-blue-600">{quotations.filter(q => q.status === 'Convertida').length}</p>
            </div>
            <ShoppingCart className="w-8 h-8 text-blue-400" />
          </div>
        </div>
        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Vencidas</p>
              <p className="text-2xl font-bold text-gray-600">{quotations.filter(q => q.status === 'Vencida').length}</p>
            </div>
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Número
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Productos
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Total
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Estado
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Válida hasta
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'No se encontraron cotizaciones' 
                      : 'No hay cotizaciones. Crea una nueva para comenzar.'}
                  </td>
                </tr>
              ) : (
                filteredQuotations.map((quotation) => (
                  <tr key={quotation._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                        {quotation.quotationNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {getCustomerDisplayName(quotation)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getCustomerDisplayContact(quotation)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {quotation.items?.length || 0} producto(s)
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatCurrency(quotation.total || 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(quotation.status)}`}>
                          {quotation.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(quotation.validUntil)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedQuotation(quotation);
                            setShowDetailModal(true);
                          }}
                          className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400"
                          title="Ver detalle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {quotation.status === 'Pendiente' && (
                          <>
                            <button
                              onClick={() => {
                                setEditingQuotation(quotation);
                                setShowCreateModal(true);
                              }}
                              className="p-2 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg text-yellow-600 dark:text-yellow-400"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConvert(quotation)}
                              className="p-2 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400"
                              title="Convertir a venta"
                            >
                              <ShoppingCart className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(quotation._id)}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <QuotationModal
          quotation={editingQuotation}
          customers={customers}
          products={products}
          onSave={handleCreateOrEdit}
          onClose={() => {
            setShowCreateModal(false);
            setEditingQuotation(null);
          }}
        />
      )}

      {showPrintModal && quotationToPrint && (
        <QuotationPrintModal
          quotation={quotationToPrint}
          onPrint={() => {
            handlePrintQuotation(quotationToPrint);
            setShowPrintModal(false);
            setQuotationToPrint(null);
          }}
          onClose={() => {
            setShowPrintModal(false);
            setQuotationToPrint(null);
          }}
        />
      )}

      {showDetailModal && selectedQuotation && (
        <DetailModal
          quotation={selectedQuotation}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedQuotation(null);
          }}
        />
      )}
    </div>
  );
};

// Modal de creación/edición (simplificado por ahora)
const QuotationModal = ({ quotation, customers, products, onSave, onClose }) => {
  const initialCustomerId = quotation?.customer?._id || quotation?.customer || '';
  const [customerMode, setCustomerMode] = useState(initialCustomerId ? 'existing' : 'generic');
  const [formData, setFormData] = useState({
    customer: initialCustomerId,
    genericCustomerName: quotation?.genericCustomerName || '',
    genericCustomerContact: quotation?.genericCustomerContact || '',
    validUntil: quotation?.validUntil ? new Date(quotation.validUntil).toISOString().split('T')[0] : '',
    notes: quotation?.notes || '',
    terms: quotation?.terms || '',
  });

  const buildInitialCart = () => {
    if (!quotation?.items) return [];
    return quotation.items.map((item) => {
      const productObj = typeof item.product === 'object' && item.product !== null
        ? item.product
        : products.find((p) => p._id === item.product);
      const productId = typeof item.product === 'object' && item.product !== null
        ? item.product._id
        : item.product;

      return {
        product: productId,
        productData: productObj || null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
      };
    });
  };

  const [cart, setCart] = useState(() => buildInitialCart());
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    if (!quotation) {
      setFormData((prev) => {
        if (prev.validUntil) return prev;
        return { ...prev, validUntil: getDefaultValidDateString() };
      });
    }
  }, [quotation]);

  useEffect(() => {
    if (!products.length) return;
    setCart((prev) => prev.map((item) => {
      if (item.productData) return item;
      const productObj = products.find((p) => p._id === item.product);
      return productObj ? { ...item, productData: productObj } : item;
    }));
  }, [products]);

  const addProduct = (product) => {
    const exists = cart.find((item) => item.product === product._id);
    if (exists) {
      toast.error('Producto ya agregado');
      return;
    }

    setCart([
      ...cart,
      {
        product: product._id,
        productData: product,
        quantity: 1,
        unitPrice: product.sellingPrice ?? 0,
        discount: 0,
      },
    ]);
  };

  const removeProduct = (productId) => {
    setCart(cart.filter((item) => item.product !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    const parsed = Math.max(1, parseInt(quantity, 10) || 1);
    setCart(cart.map((item) => (item.product === productId ? { ...item, quantity: parsed } : item)));
  };

  const filteredProducts = products.filter((p) => {
    const term = productSearch.toLowerCase();
    const name = p.name?.toLowerCase() || '';
    const sku = p.sku?.toLowerCase() || '';
    return name.includes(term) || sku.includes(term);
  });

  const approximateTotal = cart.reduce((sum, item) => sum + item.quantity * (Number(item.unitPrice) || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (customerMode === 'existing' && !formData.customer) {
      toast.error('Selecciona un cliente registrado');
      return;
    }

    if (customerMode === 'generic' && (!formData.genericCustomerName || formData.genericCustomerName.trim() === '')) {
      toast.error('Ingresa un nombre para el cliente genérico');
      return;
    }

    if (cart.length === 0) {
      toast.error('Agrega al menos un producto');
      return;
    }

    if (!formData.validUntil) {
      toast.error('Selecciona fecha de vencimiento');
      return;
    }

    onSave({
      customer: customerMode === 'existing' ? formData.customer : null,
      genericCustomerName: customerMode === 'generic' ? formData.genericCustomerName : undefined,
      genericCustomerContact: customerMode === 'generic' ? formData.genericCustomerContact : undefined,
      validUntil: formData.validUntil,
      notes: formData.notes,
      terms: formData.terms,
      items: cart.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice) || 0,
        discount: item.discount || 0,
      })),
    });
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {quotation ? 'Editar Cotización' : 'Nueva Cotización'}
              </h2>
              <p className="text-sm text-gray-500">Completa los datos y selecciona productos</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden grid grid-cols-3 gap-4 p-6">
          {/* Columna 1: Lista de productos disponibles */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Productos Disponibles
            </h3>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="input w-full pl-10"
              />
            </div>
            <div className="flex-1 overflow-auto border rounded-lg p-2 space-y-2 bg-gray-50 dark:bg-gray-900/50">
              {filteredProducts.map((product) => (
                <button
                  type="button"
                  key={product._id}
                  className="w-full p-3 hover:bg-white dark:hover:bg-gray-800 rounded-lg flex justify-between items-center text-left border border-transparent hover:border-primary-300 dark:hover:border-primary-700 transition-all"
                  onClick={() => addProduct(product)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.sku}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm font-bold text-primary-600 dark:text-primary-400">
                      ${(product.sellingPrice ?? 0).toFixed(2)}
                    </span>
                    <Plus className="w-4 h-4 text-primary-600" />
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-center text-gray-500 py-8">No se encontraron productos</p>
              )}
            </div>
          </div>

          {/* Columna 2: Formulario de datos */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              Datos de la Cotización
            </h3>
            <div className="flex-1 overflow-auto space-y-4 pr-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    customerMode === 'existing'
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20'
                      : 'border-gray-300 text-gray-600 hover:border-primary-200'
                  }`}
                >
                  <User className="w-4 h-4" /> Cliente registrado
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('generic')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    customerMode === 'generic'
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20'
                      : 'border-gray-300 text-gray-600 hover:border-primary-200'
                  }`}
                >
                  <UserPlus className="w-4 h-4" /> Cliente genérico
                </button>
              </div>

              {customerMode === 'existing' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Cliente *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={formData.customer}
                      onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                      className="input w-full pl-9"
                    >
                      <option value="">Selecciona un cliente</option>
                      {customers.map((c) => (
                        <option key={c._id} value={c._id}>{c.fullName}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {customerMode === 'generic' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Nombre del cliente *</label>
                    <div className="relative">
                      <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.genericCustomerName}
                        onChange={(e) => setFormData({ ...formData, genericCustomerName: e.target.value })}
                        className="input w-full pl-9"
                        placeholder="Cliente mostrador"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Contacto</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.genericCustomerContact}
                        onChange={(e) => setFormData({ ...formData, genericCustomerContact: e.target.value })}
                        className="input w-full pl-9"
                        placeholder="Teléfono o email"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Válida hasta *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="input w-full pl-9"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Se recomienda entregar antes de {formData.validUntil || 'la fecha indicada'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Notas</label>
                <div className="relative">
                  <StickyNote className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="input w-full pl-9"
                    rows="2"
                    placeholder="Detalles internos"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Columna 3: Carrito de productos */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Carrito ({cart.length})
            </h3>
            <div className="flex-1 overflow-auto border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-lg p-3 bg-primary-50/30 dark:bg-primary-900/10">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <ShoppingCart className="w-16 h-16 mb-3 opacity-30" />
                  <p className="text-center font-medium">Carrito vacío</p>
                  <p className="text-xs text-center mt-1">Agrega productos desde la izquierda</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div key={item.product} className="p-3 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.productData?.name || 'Producto'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{item.productData?.sku || ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProduct(item.product)}
                          className="flex-shrink-0 p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Eliminar producto"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Cantidad</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.product, e.target.value)}
                            className="input text-sm w-full px-2 py-1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Precio</label>
                          <p className="text-sm font-medium text-gray-900 dark:text-white px-2 py-1">${(Number(item.unitPrice) || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Subtotal</label>
                          <p className="text-sm font-bold text-primary-600 dark:text-primary-400 px-2 py-1">
                            ${(item.quantity * (Number(item.unitPrice) || 0)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t-2 border-primary-300 dark:border-primary-700">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">Total</span>
                      <span className="text-2xl font-bold text-primary-600 dark:text-primary-400">${approximateTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={cart.length === 0}>
                {quotation ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// Modal de detalle (simplificado)
const DetailModal = ({ quotation, onClose }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  const customerName = quotation.customer?.fullName || quotation.genericCustomerName || 'Cliente Genérico';
  const customerContact = quotation.customer?.phone || quotation.genericCustomerContact || 'N/A';

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">{quotation.quotationNumber}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Cliente</p>
            <p className="font-medium">{customerName}</p>
            <p className="text-xs text-gray-500">{customerContact}</p>
          </div>

          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Productos</p>
            {quotation.items?.map((item, idx) => (
              <div key={idx} className="flex justify-between py-2 border-b">
                <span>{item.product?.name || 'Producto'} x{item.quantity}</span>
                <span className="font-bold">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t">
            <div className="flex justify-between text-lg font-bold">
              <span>Total:</span>
              <span>{formatCurrency(quotation.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const QuotationPrintModal = ({ quotation, onPrint, onClose }) => {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  const customerName = quotation.customer?.fullName || quotation.genericCustomerName || 'Cliente Genérico';
  const validUntil = quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('es-DO') : 'N/A';

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Printer className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            ¡Cotización creada!
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Número: <span className="font-semibold">{quotation.quotationNumber || 'N/A'}</span>
          </p>
          <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 mt-3">
            {formatCurrency(quotation.total || 0)}
          </p>
        </div>

        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex justify-between">
            <span>Cliente:</span>
            <span className="font-medium text-gray-900 dark:text-white">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span>Productos:</span>
            <span className="font-medium text-gray-900 dark:text-white">{quotation.items?.length || 0} ítem(s)</span>
          </div>
          <div className="flex justify-between">
            <span>Válida hasta:</span>
            <span className="font-medium text-gray-900 dark:text-white">{validUntil}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <X className="w-5 h-5" />
            No imprimir
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

export default Quotations;
