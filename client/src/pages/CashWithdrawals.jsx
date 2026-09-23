/**
 * @file CashWithdrawals.jsx
 * @description Gestión de retiros de caja (salidas de efectivo)
 * 
 * Responsabilidades:
 * - Listar retiros de caja con filtros
 * - Crear nuevo retiro (cajero crea con status 'pending', admin con 'approved')
 * - Ver detalle de retiro
 * - Aprobar/Rechazar retiro (solo admin)
 * - Eliminar retiro (solo admin)
 * - Mostrar resumen de retiros
 * 
 * Estados:
 * - withdrawals: Array de retiros desde backend
 * - summary: Objeto con pending, approved, rejected, totalAmount
 * - filters: { status, category, startDate, endDate, search }
 * - showCreateModal: Boolean para modal crear
 * - showDetailModal: Boolean para modal detalle
 * - selectedWithdrawal: Retiro seleccionado para detalle
 * 
 * APIs:
 * - GET /api/cash-withdrawals (con filtros)
 * - POST /api/cash-withdrawals (crear)
 * - GET /api/cash-withdrawals/:id (detalle)
 * - PATCH /api/cash-withdrawals/:id (aprobar/rechazar, solo admin)
 * - DELETE /api/cash-withdrawals/:id (eliminar, solo admin)
 * 
 * Lógica por Rol:
 * - Admin:
 *   - Ve todos los retiros
 *   - Crea retiros con status 'approved' automáticamente
 *   - Puede aprobar/rechazar retiros pendientes
 *   - Puede eliminar retiros
 * - Cajero:
 *   - Solo ve sus propios retiros
 *   - Crea retiros con status 'pending' (requiere aprobación de admin)
 *   - No puede aprobar/rechazar/eliminar
 * 
 * Form Data (Crear):
 * - amount: Monto del retiro (requerido, > 0)
 * - category: 'Pago a proveedores', 'Gastos operativos', 'Retiro personal', 'Otros'
 * - description: Descripción del retiro
 * - receipt: Número de comprobante (opcional)
 * 
 * UI Features:
 * - Tarjetas de resumen (pending, approved, rejected, total)
 * - Tabla con skeleton loader
 * - Badge de status con colores
 * - Filtros expandibles
 * - Botones de aprobar/rechazar (solo admin, solo pending)
 * - Confirmación antes de aprobar/rechazar/eliminar
 */

import { useState, useEffect } from 'react';
import { 
  DollarSign,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Trash2,
  AlertCircle,
  Calendar,
  User,
  FileText,
  TrendingDown,
  Receipt
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  getCashWithdrawals, 
  createCashWithdrawal, 
  updateCashWithdrawalStatus,
  deleteCashWithdrawal 
} from '../services/api';
import { useAuthStore } from '../store/authStore';
import { TableSkeleton } from '../components/SkeletonLoader';
import { createPortal } from 'react-dom';

const CashWithdrawals = () => {
  const { user } = useAuthStore();
  const canAuthorizeWithdrawals = ['admin', 'desarrollador'].includes(user?.role);
  const [withdrawals, setWithdrawals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchWithdrawals();
  }, [filters]);

  const fetchWithdrawals = async () => {
    try {
      setIsLoading(true);
      const response = await getCashWithdrawals(filters);
      setWithdrawals(response.data.withdrawals || []);
      setSummary(response.data.summary || null);
    } catch (error) {
      console.error('Error al cargar retiros:', error);
      toast.error('Error al cargar retiros');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWithdrawal = async (data) => {
    try {
      await createCashWithdrawal(data);
      toast.success('Retiro registrado exitosamente');
      setShowCreateModal(false);
      fetchWithdrawals();
    } catch (error) {
      console.error('Error al crear retiro:', error);
      toast.error(error.response?.data?.message || 'Error al crear retiro');
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('¿Aprobar este retiro?')) return;
    
    try {
      await updateCashWithdrawalStatus(id, { status: 'approved' });
      toast.success('Retiro aprobado');
      fetchWithdrawals();
    } catch (error) {
      console.error('Error al aprobar:', error);
      toast.error(error.response?.data?.message || 'Error al aprobar retiro');
    }
  };

  const handleReject = async (id) => {
    const notes = window.prompt('Razón del rechazo:');
    if (!notes) return;
    
    try {
      await updateCashWithdrawalStatus(id, { status: 'rejected', notes });
      toast.success('Retiro rechazado');
      fetchWithdrawals();
    } catch (error) {
      console.error('Error al rechazar:', error);
      toast.error(error.response?.data?.message || 'Error al rechazar retiro');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este retiro permanentemente?')) return;
    
    try {
      await deleteCashWithdrawal(id);
      toast.success('Retiro eliminado');
      fetchWithdrawals();
    } catch (error) {
      console.error('Error al eliminar:', error);
      toast.error(error.response?.data?.message || 'Error al eliminar retiro');
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock, label: 'Pendiente' },
      approved: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle, label: 'Aprobado' },
      rejected: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: XCircle, label: 'Rechazado' },
    };
    
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const getCategoryLabel = (category) => {
    const categories = {
      personal: 'Personal',
      business: 'Negocio',
      supplier: 'Proveedor',
      other: 'Otro'
    };
    return categories[category] || category;
  };

  if (isLoading && withdrawals.length === 0) {
    return <TableSkeleton rows={8} columns={6} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Retiros de Caja</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestión de retiros y gastos de efectivo
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)} 
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Retiro
        </button>
      </div>

      {/* Stats Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Retiros</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
              </div>
              <Receipt className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Monto Total</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(summary.totalAmount)}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {summary.byStatus.pending}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprobados</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {summary.byStatus.approved}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-glass p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="approved">Aprobados</option>
            <option value="rejected">Rechazados</option>
          </select>

          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="input"
          >
            <option value="">Todas las categorías</option>
            <option value="personal">Personal</option>
            <option value="business">Negocio</option>
            <option value="supplier">Proveedor</option>
            <option value="other">Otro</option>
          </select>

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="input"
            placeholder="Fecha inicio"
          />

          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="input"
            placeholder="Fecha fin"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Número
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Razón
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Categoría
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Retirado por
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No hay retiros registrados</p>
                  </td>
                </tr>
              ) : (
                withdrawals.map((withdrawal) => (
                  <tr key={withdrawal._id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {withdrawal.withdrawalNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(withdrawal.withdrawalDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {formatCurrency(withdrawal.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 dark:text-white line-clamp-2">
                        {withdrawal.reason}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {getCategoryLabel(withdrawal.category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {withdrawal.withdrawnBy?.fullName || 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(withdrawal.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedWithdrawal(withdrawal);
                            setShowDetailModal(true);
                          }}
                          className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        {canAuthorizeWithdrawals && withdrawal.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(withdrawal._id)}
                              className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                              title="Aprobar"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReject(withdrawal._id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              title="Rechazar"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {canAuthorizeWithdrawals && (
                          <button
                            onClick={() => handleDelete(withdrawal._id)}
                            className="text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWithdrawalModal
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateWithdrawal}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedWithdrawal && (
        <WithdrawalDetailModal
          withdrawal={selectedWithdrawal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedWithdrawal(null);
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          getStatusBadge={getStatusBadge}
          getCategoryLabel={getCategoryLabel}
        />
      )}
    </div>
  );
};

// Create Withdrawal Modal Component
const CreateWithdrawalModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    amount: '',
    reason: '',
    category: 'other',
    notes: '',
    receiptAttached: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.reason) {
      toast.error('Monto y razón son requeridos');
      return;
    }

    if (parseFloat(formData.amount) <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        ...formData,
        amount: parseFloat(formData.amount),
      });
    } catch (error) {
      // Error handled in parent
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Nuevo Retiro de Caja</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Monto *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="input"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Razón del retiro *
            </label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="input"
              placeholder="Ej: Compra de materiales"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Categoría
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input"
            >
              <option value="other">Otro</option>
              <option value="personal">Personal</option>
              <option value="business">Negocio</option>
              <option value="supplier">Proveedor</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notas adicionales
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input"
              rows="3"
              placeholder="Información adicional (opcional)"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="receiptAttached"
              checked={formData.receiptAttached}
              onChange={(e) => setFormData({ ...formData, receiptAttached: e.target.checked })}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="receiptAttached" className="text-sm text-gray-700 dark:text-gray-300">
              Tengo comprobante adjunto
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isSaving}
            >
              {isSaving ? 'Guardando...' : 'Registrar Retiro'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// Detail Modal Component
const WithdrawalDetailModal = ({ withdrawal, onClose, formatCurrency, formatDate, getStatusBadge, getCategoryLabel }) => {
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Detalle de Retiro
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Número de Retiro</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {withdrawal.withdrawalNumber}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Estado</p>
              <div className="mt-1">
                {getStatusBadge(withdrawal.status)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Monto</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(withdrawal.amount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Categoría</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {getCategoryLabel(withdrawal.category)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Razón del Retiro</p>
            <p className="text-base text-gray-900 dark:text-white mt-1">
              {withdrawal.reason}
            </p>
          </div>

          {withdrawal.notes && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Notas</p>
              <p className="text-base text-gray-900 dark:text-white mt-1">
                {withdrawal.notes}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Fecha de Retiro</p>
              <p className="text-base text-gray-900 dark:text-white">
                {formatDate(withdrawal.withdrawalDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Comprobante</p>
              <p className="text-base text-gray-900 dark:text-white">
                {withdrawal.receiptAttached ? '✅ Adjuntado' : '❌ No adjuntado'}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Retirado por</p>
                <p className="text-base text-gray-900 dark:text-white">
                  {withdrawal.withdrawnBy?.fullName || 'N/A'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {withdrawal.withdrawnBy?.email || ''}
                </p>
              </div>
              {withdrawal.authorizedBy && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Autorizado por</p>
                  <p className="text-base text-gray-900 dark:text-white">
                    {withdrawal.authorizedBy?.fullName || 'N/A'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {withdrawal.authorizedBy?.email || ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="btn btn-secondary w-full">
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CashWithdrawals;
