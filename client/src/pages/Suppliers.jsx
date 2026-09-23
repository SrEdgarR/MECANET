/**
 * @file Suppliers.jsx
 * @description Gestión de proveedores (CRUD completo)
 * 
 * Responsabilidades:
 * - Listar proveedores con búsqueda
 * - Crear nuevo proveedor (modal, solo admin)
 * - Editar proveedor existente (modal, solo admin)
 * - Eliminar proveedor (con confirmación, solo admin)
 * - Mostrar información de contacto y términos de pago
 * 
 * Estados:
 * - suppliers: Array de proveedores desde backend
 * - filteredSuppliers: Array filtrado por searchTerm
 * - searchTerm: Búsqueda por nombre, RNC, contacto
 * - showModal: Boolean para modal crear/editar
 * - editingSupplier: Proveedor en edición o null para crear
 * 
 * Form Data:
 * - name: Nombre del proveedor (requerido)
 * - contactName: Nombre del contacto
 * - email, phone
 * - address
 * - rnc: RNC del proveedor (único, opcional)
 * - paymentTerms: 'Contado', '15 días', '30 días', '45 días', '60 días'
 * - notes: Notas adicionales
 * 
 * APIs:
 * - GET /api/suppliers
 * - POST /api/suppliers (solo admin)
 * - PUT /api/suppliers/:id (solo admin)
 * - DELETE /api/suppliers/:id (solo admin)
 * 
 * Validaciones:
 * - name requerido
 * - RNC único si se proporciona
 * - Email formato válido si se proporciona
 * 
 * UI Features:
 * - Tabla con skeleton loader
 * - Badge de términos de pago
 * - Modal con formulario completo
 * - Confirmación antes de eliminar
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../services/api';
import toast from 'react-hot-toast';
import { TableSkeleton } from '../components/SkeletonLoader';
import {
  Truck,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  Save,
} from 'lucide-react';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    rnc: '',
    paymentTerms: 'Contado',
    notes: '',
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

  useEffect(() => {
    fetchSuppliers();
  }, [pagination.page]);

  useEffect(() => {
    filterSuppliers();
  }, [searchTerm, suppliers]);

  // Cerrar modal con tecla ESC
  useEffect(() => {
    if (showModal) {
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          handleCloseModal();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [showModal]);

  const fetchSuppliers = async () => {
    try {
      setIsLoading(true);
      const response = await getSuppliers({ page: pagination.page, limit: pagination.limit });
      
      const suppliersData = response?.data?.suppliers || response?.data || [];
      const paginationData = response?.data?.pagination || {};
      
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
      setPagination(prev => ({
        ...prev,
        ...paginationData
      }));
    } catch (error) {
      console.error('Error al cargar proveedores:', error);
      toast.error('Error al cargar proveedores');
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterSuppliers = () => {
    if (!searchTerm) {
      setFilteredSuppliers(suppliers);
      return;
    }

    const filtered = suppliers.filter(supplier =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.rnc?.includes(searchTerm)
    );
    setFilteredSuppliers(filtered);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('El nombre del proveedor es requerido');
      return;
    }

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier._id, formData);
        toast.success('Proveedor actualizado exitosamente');
      } else {
        await createSupplier(formData);
        toast.success('Proveedor creado exitosamente');
      }
      
      handleCloseModal();
      fetchSuppliers();
    } catch (error) {
      console.error('Error al guardar proveedor:', error);
      toast.error(error.response?.data?.message || 'Error al guardar proveedor');
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      rnc: supplier.rnc || '',
      paymentTerms: supplier.paymentTerms || 'Contado',
      notes: supplier.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Está seguro de desactivar este proveedor?')) return;

    try {
      await deleteSupplier(id);
      toast.success('Proveedor desactivado exitosamente');
      fetchSuppliers();
    } catch (error) {
      console.error('Error al eliminar proveedor:', error);
      toast.error('Error al eliminar proveedor');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
      rnc: '',
      paymentTerms: 'Contado',
      notes: '',
    });
  };

  const formatPhone = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setFormData(prev => ({ ...prev, phone: formatted }));
  };

  // Mostrar skeleton mientras carga
  if (isLoading && suppliers.length === 0) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Proveedores</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestiona tus proveedores y sus datos de contacto
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Proveedor
        </button>
      </div>

      {/* Search */}
      <div className="glass-strong rounded-xl p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o RNC..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      {/* Suppliers List */}
      {isLoading ? (
        <div className="glass-strong rounded-xl p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400 mt-4">Cargando proveedores...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="glass-strong rounded-xl p-12 text-center">
          <Truck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {searchTerm
              ? 'Intenta con otro término de búsqueda'
              : 'Comienza agregando tu primer proveedor'}
          </p>
          {!searchTerm && (
            <button onClick={() => setShowModal(true)} className="btn btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Agregar Proveedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map((supplier) => (
            <div key={supplier._id} className="glass-strong rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                    <Truck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{supplier.name}</h3>
                    {supplier.contactName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{supplier.contactName}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(supplier)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => handleDelete(supplier._id)}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {supplier.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Phone className="w-4 h-4" />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {supplier.address && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <MapPin className="w-4 h-4" />
                    <span className="line-clamp-1">{supplier.address}</span>
                  </div>
                )}
                {supplier.rnc && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <FileText className="w-4 h-4" />
                    <span>RNC: {supplier.rnc}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-gray-900 dark:text-white font-medium">
                    {supplier.paymentTerms}
                  </span>
                </div>
              </div>

              {!supplier.isActive && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-red-600 font-medium">Inactivo</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      {!isLoading && pagination.pages > 1 && (
        <div className="glass-strong rounded-xl">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Mostrando {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} proveedores
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
        </div>
      )}

      {/* Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 100000 }}>
          <div className="glass-strong rounded-2xl max-w-2xl w-full max-h-[90vh] min-h-[400px] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 pb-4 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nombre del Proveedor *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="input w-full"
                    placeholder="Ej: Repuestos del Caribe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Persona de Contacto
                  </label>
                  <input
                    type="text"
                    name="contactName"
                    value={formData.contactName}
                    onChange={handleChange}
                    className="input w-full"
                    placeholder="Ej: Juan Pérez"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    RNC
                  </label>
                  <input
                    type="text"
                    name="rnc"
                    value={formData.rnc}
                    onChange={handleChange}
                    className="input w-full"
                    placeholder="Ej: 123456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="input w-full"
                    placeholder="contacto@proveedor.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    className="input w-full"
                    placeholder="809-555-5555"
                    maxLength="12"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Dirección
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="input w-full"
                    placeholder="Calle, Número, Sector, Ciudad"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Términos de Pago
                  </label>
                  <select
                    name="paymentTerms"
                    value={formData.paymentTerms}
                    onChange={handleChange}
                    className="input w-full"
                  >
                    <option value="Contado">Contado</option>
                    <option value="15 días">15 días</option>
                    <option value="30 días">30 días</option>
                    <option value="45 días">45 días</option>
                    <option value="60 días">60 días</option>
                    <option value="90 días">90 días</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Notas
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    className="input w-full"
                    rows="3"
                    placeholder="Información adicional sobre el proveedor..."
                  />
                </div>
              </div>
            </div>

            {/* Footer with Actions */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex gap-3 flex-shrink-0 shadow-lg">
              <button 
                onClick={handleSubmit}
                className="btn btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {editingSupplier ? 'Actualizar' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Suppliers;
