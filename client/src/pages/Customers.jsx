/**
 * @file Customers.jsx
 * @description Gestión de clientes (CRUD completo + historial de compras)
 * 
 * Responsabilidades:
 * - Listar clientes con búsqueda
 * - Crear nuevo cliente (modal)
 * - Editar cliente existente (modal)
 * - Eliminar cliente (con confirmación, solo admin)
 * - Ver detalle de cliente con historial de compras
 * - Mostrar estadísticas del cliente (total gastado, número de compras)
 * 
 * Estados:
 * - customers: Array de clientes desde backend
 * - filteredCustomers: Array filtrado por searchTerm
 * - searchTerm: Búsqueda por nombre, cédula, teléfono
 * - showCustomerModal: Boolean para modal crear/editar
 * - showDetailModal: Boolean para modal de detalle + historial
 * - editingCustomer: Cliente en edición o null para crear
 * - selectedCustomer: Cliente seleccionado para ver detalle
 * - customerSales: Array de ventas del cliente seleccionado
 * 
 * APIs:
 * - GET /api/customers
 * - POST /api/customers
 * - PUT /api/customers/:id
 * - DELETE /api/customers/:id (solo admin)
 * - GET /api/customers/:id/purchases (historial)
 * 
 * Form Data:
 * - fullName, email, phone
 * - address, city
 * - identificationType: 'Cédula', 'Pasaporte', 'RNC'
 * - identificationNumber
 * 
 * Validaciones:
 * - fullName requerido
 * - identificationType + identificationNumber requeridos
 * - Email opcional pero formato válido
 * - identificationNumber único (sparse index en backend)
 * 
 * UI Features:
 * - Tabla con skeleton loader
 * - Modal de historial con lista de compras y totales
 * - Confirmación antes de eliminar
 * - Tooltips informativos
 */

import React, { useState, useEffect } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getSales } from '../services/api';
import toast from 'react-hot-toast';
import { TableSkeleton } from '../components/SkeletonLoader';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  User,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  Calendar,
  X,
  Check,
  Eye,
  Users,
  TrendingUp,
  DollarSign,
  Info,
} from 'lucide-react';
import { createPortal } from 'react-dom';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSales, setCustomerSales] = useState([]);
  const [showTooltip, setShowTooltip] = useState(null);

  // Paginación
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });

  useEffect(() => {
    fetchCustomers();
  }, [pagination.page]);

  useEffect(() => {
    filterCustomers();
  }, [customers, searchTerm]);

  // Cerrar modales con tecla ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (showCustomerModal) {
          setShowCustomerModal(false);
          setEditingCustomer(null);
        }
        if (showDetailModal) {
          setShowDetailModal(false);
          setSelectedCustomer(null);
        }
      }
    };
    
    if (showCustomerModal || showDetailModal) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [showCustomerModal, showDetailModal]);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const response = await getCustomers({ page: pagination.page, limit: pagination.limit });
      
      const customersData = response?.data?.customers || response?.data || [];
      const paginationData = response?.data?.pagination || {};
      
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setPagination(prev => ({
        ...prev,
        ...paginationData
      }));
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Error al cargar clientes');
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterCustomers = () => {
    let filtered = [...customers];

    if (searchTerm) {
      filtered = filtered.filter(
        (customer) =>
          customer.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.cedula?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredCustomers(filtered);
  };

  const handleAddCustomer = () => {
    setEditingCustomer(null);
    setShowCustomerModal(true);
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setShowCustomerModal(true);
  };

  const handleDeleteCustomer = async (customerId) => {
    if (!window.confirm('¿Está seguro de eliminar este cliente?')) {
      return;
    }

    try {
      await deleteCustomer(customerId);
      toast.success('Cliente eliminado exitosamente');
      fetchCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error(error.response?.data?.message || 'Error al eliminar cliente');
    }
  };

  const handleSaveCustomer = async (customerData) => {
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer._id, customerData);
        toast.success('Cliente actualizado exitosamente');
      } else {
        await createCustomer(customerData);
        toast.success('Cliente creado exitosamente');
      }
      setShowCustomerModal(false);
      fetchCustomers();
    } catch (error) {
      console.error('Error saving customer:', error);
      toast.error(error.response?.data?.message || 'Error al guardar cliente');
    }
  };

  const handleViewCustomer = async (customer) => {
    try {
      setSelectedCustomer(customer);
      setShowDetailModal(true);
      
      // Fetch sales for this customer
      const response = await getSales();
      const customerSalesData = response.data.filter(sale => sale.customer?._id === customer._id);
      setCustomerSales(customerSalesData);
    } catch (error) {
      console.error('Error fetching customer sales:', error);
      toast.error('Error al cargar historial de compras');
    }
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

  const getTotalCustomers = () => customers.length;
  
  const getTotalSales = () => {
    return customers.reduce((sum, c) => sum + (c.totalPurchases || 0), 0);
  };

  const getActiveCustomers = () => {
    // Clientes con al menos una compra
    return customers.filter(c => c.purchaseHistory && c.purchaseHistory.length > 0).length;
  };

  const getAveragePerCustomer = () => {
    const active = getActiveCustomers();
    return active > 0 ? getTotalSales() / active : 0;
  };

  // Mostrar skeleton mientras carga
  if (isLoading && customers.length === 0) {
    return <TableSkeleton rows={10} columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Clientes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestión de base de datos de clientes
          </p>
        </div>
        <button onClick={handleAddCustomer} className="btn-primary">
          <Plus className="w-5 h-5" />
          Nuevo Cliente
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Clientes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{getTotalCustomers()}</p>
            </div>
            <Users className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
        </div>

        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Clientes Activos</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{getActiveCustomers()}</p>
            </div>
            <ShoppingBag className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Ventas Totales</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(getTotalSales())}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <div className="card-glass p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Promedio/Cliente</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {formatCurrency(getAveragePerCustomer())}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card-glass p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, cédula, teléfono o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cédula
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Dirección
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Compras
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total Gastado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Registrado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div className="ml-3">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {customer.fullName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-mono">
                      {customer.cedula || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {customer.phone && (
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Phone className="w-4 h-4 mr-1" />
                            {customer.phone}
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Mail className="w-4 h-4 mr-1" />
                            {customer.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {customer.address ? (
                        <div className="flex items-start">
                          <MapPin className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{customer.address}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {customer.purchaseHistory?.length || 0}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400"> compras</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(customer.totalPurchases || 0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleViewCustomer(customer)}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        title="Ver detalles"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleEditCustomer(customer)}
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
                        title="Editar"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(customer._id)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400"
                        title="Eliminar"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {!isLoading && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Mostrando {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} clientes
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={!pagination.hasPrevPage}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pagination.hasPrevPage
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pagination.hasNextPage
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Modal */}
      {showCustomerModal && (
        <CustomerModal
          customer={editingCustomer}
          onSave={handleSaveCustomer}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {/* Customer Detail Modal */}
      {showDetailModal && selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          sales={customerSales}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedCustomer(null);
            setCustomerSales([]);
          }}
          onEdit={() => {
            setShowDetailModal(false);
            handleEditCustomer(selectedCustomer);
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      )}
    </div>
  );
};

// Customer Modal Component
const CustomerModal = ({ customer, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    fullName: customer?.fullName || '',
    cedula: customer?.cedula || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const formatPhone = (value) => {
    // Remover todo excepto números
    const cleaned = value.replace(/\D/g, '');
    
    // Limitar a 10 dígitos
    const limited = cleaned.substring(0, 10);
    
    // Aplicar formato XXX-XXX-XXXX
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    } else {
      return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6)}`;
    }
  };

  const formatCedula = (value) => {
    // Remover todo excepto números
    const cleaned = value.replace(/\D/g, '');
    
    // Limitar a 11 dígitos
    const limited = cleaned.substring(0, 11);
    
    // Aplicar formato XXX-XXXXXXX-X
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 10) {
      return `${limited.slice(0, 3)}-${limited.slice(3)}`;
    } else {
      return `${limited.slice(0, 3)}-${limited.slice(3, 10)}-${limited.slice(10)}`;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;
    
    // Aplicar formato según el campo
    if (name === 'phone') {
      formattedValue = formatPhone(value);
    } else if (name === 'cedula') {
      formattedValue = formatCedula(value);
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]: formattedValue,
    }));
    
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'El nombre es requerido';
    }

    // Cédula opcional, pero si se proporciona debe ser válida
    if (formData.cedula.trim() && formData.cedula.replace(/\D/g, '').length !== 11) {
      newErrors.cedula = 'La cédula debe tener 11 dígitos';
    }

    // Teléfono opcional, pero si se proporciona debe ser válido
    if (formData.phone.trim() && formData.phone.replace(/\D/g, '').length !== 10) {
      newErrors.phone = 'El teléfono debe tener 10 dígitos';
    }

    // Email opcional, pero si se proporciona debe ser válido
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Por favor corrija los errores en el formulario');
      return;
    }

    setIsLoading(true);
    try {
      await onSave(formData);
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {customer ? 'Editar Cliente' : 'Nuevo Cliente'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre Completo *
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className={`input ${errors.fullName ? 'border-red-500' : ''}`}
              placeholder="Juan Pérez"
              autoFocus
            />
            {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cédula
            </label>
            <input
              type="text"
              name="cedula"
              value={formData.cedula}
              onChange={handleChange}
              className={`input font-mono ${errors.cedula ? 'border-red-500' : ''}`}
              placeholder="001-0123456-7 (opcional)"
            />
            {errors.cedula && <p className="text-xs text-red-600 mt-1">{errors.cedula}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Teléfono
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`input font-mono ${errors.phone ? 'border-red-500' : ''}`}
              placeholder="809-555-1234 (opcional)"
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`input ${errors.email ? 'border-red-500' : ''}`}
              placeholder="cliente@ejemplo.com"
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Dirección
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows="3"
              className="input"
              placeholder="Calle, número, sector, ciudad..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={isLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  {customer ? 'Actualizar' : 'Crear'}
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Customer Detail Modal Component
const CustomerDetailModal = ({ customer, sales, onClose, onEdit, formatCurrency, formatDate }) => {
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <User className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {customer.fullName}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Cliente desde {formatDate(customer.createdAt)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Información de Contacto
            </h4>
            <div className="space-y-2">
              {customer.cedula && (
                <div className="flex items-center text-gray-900 dark:text-white">
                  <User className="w-4 h-4 mr-2 text-gray-400" />
                  <span className="font-mono">{customer.cedula}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center text-gray-900 dark:text-white">
                  <Phone className="w-4 h-4 mr-2 text-gray-400" />
                  {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center text-gray-900 dark:text-white">
                  <Mail className="w-4 h-4 mr-2 text-gray-400" />
                  {customer.email}
                </div>
              )}
              {customer.address && (
                <div className="flex items-start text-gray-900 dark:text-white">
                  <MapPin className="w-4 h-4 mr-2 mt-1 text-gray-400 flex-shrink-0" />
                  <span>{customer.address}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Estadísticas de Compra
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Total de compras:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {sales.length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Total gastado:</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(customer.totalPurchases || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Promedio por compra:</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {formatCurrency(sales.length > 0 ? (customer.totalPurchases || 0) / sales.length : 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Purchase History */}
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Historial de Compras
          </h4>
          
          {sales.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No hay compras registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sales.map((sale) => (
                <div
                  key={sale._id}
                  className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        Factura #{sale.invoiceNumber}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(sale.createdAt)}
                        </span>
                        <span className="flex items-center">
                          <ShoppingBag className="w-4 h-4 mr-1" />
                          {sale.items.length} artículo(s)
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatCurrency(sale.total)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {sale.paymentMethod}
                      </div>
                    </div>
                  </div>
                  
                  {/* Items */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                    <div className="space-y-1">
                      {sale.items.map((item, index) => (
                        <div
                          key={index}
                          className="flex justify-between text-sm text-gray-600 dark:text-gray-400"
                        >
                          <span>
                            {item.quantity}x {item.product?.name || 'Producto'}
                          </span>
                          <span>{formatCurrency(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cerrar
          </button>
          <button onClick={onEdit} className="btn-primary flex-1">
            <Edit className="w-5 h-5" />
            Editar Cliente
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Customers;
