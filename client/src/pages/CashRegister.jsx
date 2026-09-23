/**
 * @file CashRegister.jsx
 * @description Cierre de caja del cajero (corte de caja)
 * 
 * Responsabilidades:
 * - Mostrar ventas del cajero actual del día
 * - Calcular totales por método de pago (systemTotals)
 * - Permitir ingresar efectivo contado físicamente (countedTotals)
 * - Calcular diferencias (systemTotals vs countedTotals)
 * - Cerrar caja y crear CashierSession
 * - Imprimir reporte de cierre
 * 
 * Estados:
 * - sales: Array de ventas del cajero (GET /api/sales/user/me)
 * - summary: { totalSales, totalAmount, byPaymentMethod }
 * - selectedSale: Venta seleccionada para detalle
 * - showDetailModal: Boolean para modal detalle de venta
 * - showClosingModal: Boolean para modal de cierre de caja
 * - countedCash: Monto de efectivo contado físicamente
 * - showPrintReport: Boolean para modal de impresión de reporte
 * 
 * APIs:
 * - GET /api/sales/user/me (ventas del cajero actual)
 * - POST /api/sales/close-register (cerrar caja)
 * 
 * Flujo de Cierre:
 * 1. Cajero revisa ventas del día
 * 2. Ve totales del sistema (systemTotals)
 * 3. Cuenta efectivo físicamente
 * 4. Ingresa monto contado (countedCash)
 * 5. Sistema calcula diferencia
 * 6. Cajero confirma cierre
 * 7. Backend crea CashierSession con systemTotals, countedTotals, differences
 * 8. Frontend muestra reporte para imprimir
 * 
 * Cálculos:
 * - systemTotals: Totales según ventas registradas
 *   - totalSales: Número de ventas
 *   - cash, card, transfer: Totales por método
 *   - total: Suma de todos los métodos
 * - countedTotals: Totales contados físicamente
 *   - cash: Ingresado por cajero
 *   - card, transfer: Igual a systemTotals (no se cuenta físicamente)
 * - differences: systemTotals - countedTotals
 *   - Positivo: falta dinero
 *   - Negativo: sobra dinero
 * 
 * UI Features:
 * - Tarjetas de resumen por método de pago
 * - Tabla de ventas del día ordenables
 * - Modal de cierre con input de efectivo contado
 * - Reporte de cierre imprimible
 * - Indicador de diferencias (rojo si hay diferencia)
 */

import React, { useState, useEffect } from 'react';
import { getMySales, closeCashRegister } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  DollarSign,
  CreditCard,
  Banknote,
  ShoppingBag,
  TrendingUp,
  Calendar,
  Clock,
  User,
  Receipt,
  Printer,
  Eye,
  X,
  Info,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { createPortal } from 'react-dom';

const CashRegister = () => {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalAmount: 0,
    byPaymentMethod: {
      Efectivo: 0,
      Tarjeta: 0,
      Transferencia: 0,
    },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [sortBy, setSortBy] = useState('time-desc');
  const [showPrintReport, setShowPrintReport] = useState(false);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(null);
  const { user, logout } = useAuthStore();
  const roleLabels = {
    admin: 'Administrador',
    desarrollador: 'Desarrollador',
    cajero: 'Cajero',
  };
  const currentRoleLabel = roleLabels[user?.role] || 'Usuario';
  const navigate = useNavigate();

  useEffect(() => {
    fetchMySales();
  }, []);

  const fetchMySales = async () => {
    try {
      setIsLoading(true);
      const response = await getMySales();
      setSales(response.data.sales);
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Error al cargar ventas del día');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewSale = (sale) => {
    setSelectedSale(sale);
    setShowDetailModal(true);
  };

  const handlePrintReport = () => {
    setShowPrintReport(true);
    // Esperar a que el componente se renderice antes de imprimir
    setTimeout(() => {
      window.print();
      // Ocultar el reporte después de imprimir
      setTimeout(() => {
        setShowPrintReport(false);
      }, 500);
    }, 100);
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

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCurrentDate = () => {
    return new Date().toLocaleDateString('es-DO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getSortedSales = () => {
    const sorted = [...sales];
    
    switch (sortBy) {
      case 'time-asc':
        return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      case 'time-desc':
        return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'customer-asc':
        return sorted.sort((a, b) => {
          const nameA = a.customer?.fullName || 'Cliente General';
          const nameB = b.customer?.fullName || 'Cliente General';
          return nameA.localeCompare(nameB);
        });
      case 'customer-desc':
        return sorted.sort((a, b) => {
          const nameA = a.customer?.fullName || 'Cliente General';
          const nameB = b.customer?.fullName || 'Cliente General';
          return nameB.localeCompare(nameA);
        });
      case 'payment-method':
        return sorted.sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));
      case 'amount-asc':
        return sorted.sort((a, b) => a.total - b.total);
      case 'amount-desc':
        return sorted.sort((a, b) => b.total - a.total);
      default:
        return sorted;
    }
  };

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'Efectivo':
        return <Banknote className="w-5 h-5" />;
      case 'Tarjeta':
        return <CreditCard className="w-5 h-5" />;
      case 'Transferencia':
        return <DollarSign className="w-5 h-5" />;
      default:
        return <DollarSign className="w-5 h-5" />;
    }
  };

  const getPaymentMethodColor = (method) => {
    switch (method) {
      case 'Efectivo':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'Tarjeta':
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      case 'Transferencia':
        return 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center print:mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white print:text-2xl">
            Cierre de Caja
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {getCurrentDate()}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handlePrintReport}
            className="btn btn-secondary print:hidden flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Imprimir Reporte
          </button>
          <button
            onClick={() => setShowClosingModal(true)}
            className="btn-primary print:hidden flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Realizar Cierre de Caja
          </button>
        </div>
      </div>

      {/* User Info */}
      <div className="card-glass p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <User className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {user?.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {user?.email} • {currentRoleLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Ventas */}
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Ventas</span>
              <div className="relative">
                <Info
                  className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                  onMouseEnter={() => setShowTooltip('totalVentas')}
                  onMouseLeave={() => setShowTooltip(null)}
                />
                {showTooltip === 'totalVentas' && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                    Número total de transacciones realizadas hoy
                  </div>
                )}
              </div>
            </div>
            <ShoppingBag className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {summary.totalSales}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Transacciones completadas
          </p>
        </div>

        {/* Total General */}
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Recaudado</span>
              <div className="relative">
                <Info
                  className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                  onMouseEnter={() => setShowTooltip('totalRecaudado')}
                  onMouseLeave={() => setShowTooltip(null)}
                />
                {showTooltip === 'totalRecaudado' && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                    Suma total de ingresos del día por todos los métodos de pago
                  </div>
                )}
              </div>
            </div>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(summary.totalAmount)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Suma de todos los métodos
          </p>
        </div>

        {/* Efectivo */}
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Efectivo</span>
              <div className="relative">
                <Info
                  className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                  onMouseEnter={() => setShowTooltip('efectivo')}
                  onMouseLeave={() => setShowTooltip(null)}
                />
                {showTooltip === 'efectivo' && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                    Total de ventas pagadas en efectivo
                  </div>
                )}
              </div>
            </div>
            <Banknote className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(summary.byPaymentMethod.Efectivo)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {sales.filter(s => s.paymentMethod === 'Efectivo').length} ventas
          </p>
        </div>

        {/* Tarjeta */}
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Tarjeta</span>
              <div className="relative">
                <Info
                  className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                  onMouseEnter={() => setShowTooltip('tarjeta')}
                  onMouseLeave={() => setShowTooltip(null)}
                />
                {showTooltip === 'tarjeta' && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                    Total de ventas pagadas con tarjeta de crédito/débito
                  </div>
                )}
              </div>
            </div>
            <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(summary.byPaymentMethod.Tarjeta)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {sales.filter(s => s.paymentMethod === 'Tarjeta').length} ventas
          </p>
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Desglose por Método de Pago
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Efectivo */}
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
                <Banknote className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Efectivo</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sales.filter(s => s.paymentMethod === 'Efectivo').length} transacciones
                </p>
              </div>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(summary.byPaymentMethod.Efectivo)}
            </p>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {summary.totalAmount > 0 
                ? `${((summary.byPaymentMethod.Efectivo / summary.totalAmount) * 100).toFixed(1)}% del total`
                : '0% del total'}
            </div>
          </div>

          {/* Tarjeta */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Tarjeta</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sales.filter(s => s.paymentMethod === 'Tarjeta').length} transacciones
                </p>
              </div>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(summary.byPaymentMethod.Tarjeta)}
            </p>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {summary.totalAmount > 0 
                ? `${((summary.byPaymentMethod.Tarjeta / summary.totalAmount) * 100).toFixed(1)}% del total`
                : '0% del total'}
            </div>
          </div>

          {/* Transferencia */}
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Transferencia</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sales.filter(s => s.paymentMethod === 'Transferencia').length} transacciones
                </p>
              </div>
            </div>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(summary.byPaymentMethod.Transferencia)}
            </p>
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {summary.totalAmount > 0 
                ? `${((summary.byPaymentMethod.Transferencia / summary.totalAmount) * 100).toFixed(1)}% del total`
                : '0% del total'}
            </div>
          </div>
        </div>
      </div>

      {/* Sales List */}
      <div className="card-glass overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Detalle de Ventas del Día
            </h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Ordenar por:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input py-1 text-sm"
              >
                <option value="time-desc">Hora (Más reciente)</option>
                <option value="time-asc">Hora (Más antigua)</option>
                <option value="customer-asc">Cliente (A-Z)</option>
                <option value="customer-desc">Cliente (Z-A)</option>
                <option value="payment-method">Método de Pago</option>
                <option value="amount-desc">Monto (Mayor a Menor)</option>
                <option value="amount-asc">Monto (Menor a Mayor)</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Factura
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Hora
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Método de Pago
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider print:hidden">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No hay ventas registradas el día de hoy</p>
                  </td>
                </tr>
              ) : (
                getSortedSales().map((sale) => (
                  <tr
                    key={sale._id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {sale.invoiceNumber}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 mr-1" />
                        {formatTime(sale.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {sale.customer?.fullName || 'Cliente General'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {sale.items.length} artículo(s)
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getPaymentMethodColor(sale.paymentMethod)}`}>
                        {getPaymentMethodIcon(sale.paymentMethod)}
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(sale.total)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right print:hidden">
                      <button
                        onClick={() => handleViewSale(sale)}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        title="Ver detalles"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Report */}
      {showPrintReport && (
        <PrintableReport
          user={user}
          sales={sales}
          summary={summary}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formatTime={formatTime}
        />
      )}

      {/* Sale Detail Modal */}
      {showDetailModal && selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedSale(null);
          }}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formatTime={formatTime}
        />
      )}

      {showClosingModal && (
        <CashClosingModal
          summary={summary}
          onClose={() => setShowClosingModal(false)}
          onConfirm={async (data) => {
            try {
              await closeCashRegister(data);
              toast.success('¡Turno cerrado correctamente! Redirigiendo...');
              setShowClosingModal(false);
              
              // Esperar 2 segundos y luego cerrar sesión
              setTimeout(() => {
                logout();
                navigate('/login');
              }, 2000);
            } catch (error) {
              console.error('Error al cerrar caja:', error);
              toast.error(error.response?.data?.message || 'Error al cerrar caja');
            }
          }}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
};

// Sale Detail Modal Component
const SaleDetailModal = ({ sale, onClose, formatCurrency, formatDate, formatTime }) => {
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

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              Factura #{sale.invoiceNumber}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {formatDate(sale.createdAt)} a las {formatTime(sale.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Customer Info */}
        {sale.customer && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Cliente
            </h4>
            <div className="space-y-1">
              <p className="text-gray-900 dark:text-white font-medium">
                {sale.customer.fullName}
              </p>
              {sale.customer.phone && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sale.customer.phone}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            Artículos
          </h4>
          <div className="space-y-2">
            {sale.items.map((item, index) => (
              <div
                key={index}
                className="flex justify-between items-start p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.product?.name || 'Producto'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.product?.sku} • {formatCurrency(item.priceAtSale)} c/u
                  </p>
                  {item.discountApplied > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Descuento: {item.discountApplied}%
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(item.subtotal)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    x{item.quantity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-2 mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>Subtotal:</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          {sale.totalDiscount > 0 && (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Descuento:</span>
              <span>-{formatCurrency(sale.totalDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
            <span>Total:</span>
            <span>{formatCurrency(sale.total)}</span>
          </div>
        </div>

        {/* Payment Method */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Método de Pago
          </h4>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {sale.paymentMethod}
          </p>
        </div>

        {/* Notes */}
        {sale.notes && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Notas
            </h4>
            <p className="text-gray-900 dark:text-white">{sale.notes}</p>
          </div>
        )}

        {/* Close Button */}
        <button onClick={onClose} className="btn-primary w-full">
          Cerrar
        </button>
      </div>
    </div>,
    document.body
  );
};

// Printable Report Component
const PrintableReport = ({ user, sales, summary, formatCurrency, formatDate, formatTime }) => {
  const now = new Date();
  const firstSaleTime = sales.length > 0 ? new Date(sales[sales.length - 1].createdAt) : now;
  const lastSaleTime = sales.length > 0 ? new Date(sales[0].createdAt) : now;

  // Calcular ventas brutas y descuentos
  const ventasBrutas = sales.reduce((sum, sale) => sum + sale.subtotal, 0);
  const descuentosTotales = sales.reduce((sum, sale) => sum + (sale.totalDiscount || 0), 0);
  const ventasNetas = summary.totalAmount;

  return (
    <>
      <style>{`
        .printable-report {
          position: absolute;
          left: -9999px;
          top: 0;
        }
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 10mm;
            width: 80mm;
            font-family: 'Courier New', monospace;
            font-size: 9pt;
          }
          .printable-report {
            position: static !important;
            left: auto !important;
            display: block !important;
          }
          * {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
      <div className="printable-report">
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: '20pt', borderBottom: '2pt solid black', paddingBottom: '10pt' }}>
          <h1 style={{ margin: '0 0 5pt 0', fontSize: '20pt' }}>MECANET</h1>
          <p style={{ margin: '0', fontSize: '10pt', color: '#666' }}>Sistema de Punto de Venta</p>
        </div>

      <div style={{ textAlign: 'center', marginBottom: '20pt' }}>
        <h1 style={{ margin: '0 0 10pt 0', fontSize: '18pt', fontWeight: 'bold' }}>
          REPORTE DE CIERRE DE CAJA
        </h1>
      </div>

      {/* Información del Cajero y Periodo */}
      <div style={{ marginBottom: '20pt', fontSize: '11pt' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}><strong>Cajero:</strong></td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}>{user?.name}</td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}><strong>Email:</strong></td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}>{user?.email}</td>
            </tr>
            <tr>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}><strong>Fecha de Emisión:</strong></td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}>{formatDate(now)}</td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}><strong>Hora de Emisión:</strong></td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}>{formatTime(now)}</td>
            </tr>
            <tr>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}><strong>Periodo Desde:</strong></td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}>
                {formatDate(firstSaleTime)} {formatTime(firstSaleTime)}
              </td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}><strong>Periodo Hasta:</strong></td>
              <td style={{ padding: '4pt', borderBottom: '1pt solid #ddd' }}>
                {formatDate(lastSaleTime)} {formatTime(lastSaleTime)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Resumen General de Ventas */}
      <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginTop: '15pt', marginBottom: '8pt', borderBottom: '2pt solid black', paddingBottom: '3pt' }}>
        RESUMEN GENERAL DE VENTAS
      </h2>
      <table style={{ width: '100%', marginBottom: '15pt', borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <td style={{ padding: '8pt', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>Ventas Brutas:</td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>{formatCurrency(ventasBrutas)}</td>
          </tr>
          <tr>
            <td style={{ padding: '8pt', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>Descuentos Totales:</td>
            <td style={{ padding: '8pt', textAlign: 'right', color: 'red', borderBottom: '1pt solid #ccc' }}>-{formatCurrency(descuentosTotales)}</td>
          </tr>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <td style={{ padding: '8pt', fontWeight: 'bold', fontSize: '12pt', borderBottom: '2pt solid black' }}>Ventas Netas:</td>
            <td style={{ padding: '8pt', textAlign: 'right', fontWeight: 'bold', fontSize: '12pt', borderBottom: '2pt solid black' }}>{formatCurrency(ventasNetas)}</td>
          </tr>
          <tr>
            <td style={{ padding: '8pt', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>Número Total de Transacciones:</td>
            <td style={{ padding: '8pt', textAlign: 'right', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>{summary.totalSales}</td>
          </tr>
        </tbody>
      </table>

      {/* Desglose por Método de Pago */}
      <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginTop: '20pt', marginBottom: '8pt', borderBottom: '2pt solid black', paddingBottom: '3pt' }}>
        DESGLOSE POR MÉTODO DE PAGO
      </h2>
      <table style={{ width: '100%', marginBottom: '15pt', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#e0e0e0' }}>
            <th style={{ padding: '8pt', textAlign: 'left', borderBottom: '2pt solid black' }}>Método de Pago</th>
            <th style={{ padding: '8pt', textAlign: 'center', borderBottom: '2pt solid black' }}>Nº Transacciones</th>
            <th style={{ padding: '8pt', textAlign: 'right', borderBottom: '2pt solid black' }}>Total Recibido</th>
            <th style={{ padding: '8pt', textAlign: 'right', borderBottom: '2pt solid black' }}>% del Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '8pt', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>Efectivo</td>
            <td style={{ padding: '8pt', textAlign: 'center', borderBottom: '1pt solid #ccc' }}>
              {sales.filter(s => s.paymentMethod === 'Efectivo').length}
            </td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>
              {formatCurrency(summary.byPaymentMethod.Efectivo)}
            </td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>
              {summary.totalAmount > 0 ? `${((summary.byPaymentMethod.Efectivo / summary.totalAmount) * 100).toFixed(1)}%` : '0%'}
            </td>
          </tr>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <td style={{ padding: '8pt', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>Tarjeta</td>
            <td style={{ padding: '8pt', textAlign: 'center', borderBottom: '1pt solid #ccc' }}>
              {sales.filter(s => s.paymentMethod === 'Tarjeta').length}
            </td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>
              {formatCurrency(summary.byPaymentMethod.Tarjeta)}
            </td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>
              {summary.totalAmount > 0 ? `${((summary.byPaymentMethod.Tarjeta / summary.totalAmount) * 100).toFixed(1)}%` : '0%'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '8pt', fontWeight: 'bold', borderBottom: '1pt solid #ccc' }}>Transferencia</td>
            <td style={{ padding: '8pt', textAlign: 'center', borderBottom: '1pt solid #ccc' }}>
              {sales.filter(s => s.paymentMethod === 'Transferencia').length}
            </td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>
              {formatCurrency(summary.byPaymentMethod.Transferencia)}
            </td>
            <td style={{ padding: '8pt', textAlign: 'right', borderBottom: '1pt solid #ccc' }}>
              {summary.totalAmount > 0 ? `${((summary.byPaymentMethod.Transferencia / summary.totalAmount) * 100).toFixed(1)}%` : '0%'}
            </td>
          </tr>
          <tr style={{ backgroundColor: '#d0d0d0', fontWeight: 'bold', fontSize: '12pt' }}>
            <td style={{ padding: '10pt', borderTop: '2pt solid black' }}>GRAN TOTAL</td>
            <td style={{ padding: '10pt', textAlign: 'center', borderTop: '2pt solid black' }}>{summary.totalSales}</td>
            <td style={{ padding: '10pt', textAlign: 'right', borderTop: '2pt solid black' }}>{formatCurrency(summary.totalAmount)}</td>
            <td style={{ padding: '10pt', textAlign: 'right', borderTop: '2pt solid black' }}>100%</td>
          </tr>
        </tbody>
      </table>

      {/* Detalle de Transacciones */}
      <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginTop: '20pt', marginBottom: '8pt', borderBottom: '2pt solid black', paddingBottom: '3pt' }}>
        DETALLE DE TRANSACCIONES
      </h2>
      <table style={{ width: '100%', marginBottom: '20pt', borderCollapse: 'collapse', fontSize: '10pt' }}>
        <thead>
          <tr style={{ backgroundColor: '#e0e0e0' }}>
            <th style={{ padding: '6pt', textAlign: 'left', borderBottom: '1pt solid black' }}>Factura</th>
            <th style={{ padding: '6pt', textAlign: 'left', borderBottom: '1pt solid black' }}>Hora</th>
            <th style={{ padding: '6pt', textAlign: 'left', borderBottom: '1pt solid black' }}>Cliente</th>
            <th style={{ padding: '6pt', textAlign: 'center', borderBottom: '1pt solid black' }}>Método</th>
            <th style={{ padding: '6pt', textAlign: 'right', borderBottom: '1pt solid black' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale, index) => (
            <tr key={sale._id} style={{ backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'white' }}>
              <td style={{ padding: '5pt', borderBottom: '1pt solid #ddd' }}>{sale.invoiceNumber}</td>
              <td style={{ padding: '5pt', borderBottom: '1pt solid #ddd' }}>{formatTime(sale.createdAt)}</td>
              <td style={{ padding: '5pt', borderBottom: '1pt solid #ddd' }}>{sale.customer?.fullName || 'Cliente General'}</td>
              <td style={{ padding: '5pt', textAlign: 'center', borderBottom: '1pt solid #ddd' }}>{sale.paymentMethod}</td>
              <td style={{ padding: '5pt', textAlign: 'right', borderBottom: '1pt solid #ddd' }}>{formatCurrency(sale.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Firmas */}
      <div style={{ marginTop: '40pt', pageBreakInside: 'avoid' }}>
        <div style={{ marginBottom: '30pt' }}>
          <div style={{ borderTop: '1pt solid black', width: '250pt', marginBottom: '5pt' }}></div>
          <p style={{ margin: '0', textAlign: 'left', fontSize: '10pt' }}>Firma del Cajero: {user?.name}</p>
        </div>

        <div>
          <div style={{ borderTop: '1pt solid black', width: '250pt', marginBottom: '5pt' }}></div>
          <p style={{ margin: '0', textAlign: 'left', fontSize: '10pt' }}>Firma del Gerente</p>
        </div>
      </div>

      {/* Pie de página */}
      <div style={{ marginTop: '30pt', textAlign: 'center', fontSize: '9pt', color: '#666', borderTop: '1pt solid #ddd', paddingTop: '10pt' }}>
        <p style={{ margin: '0' }}>Documento generado automáticamente por MECANET</p>
        <p style={{ margin: '5pt 0 0 0' }}>Fecha de impresión: {formatDate(now)} - {formatTime(now)}</p>
      </div>
    </div>
    </>
  );
};

// Cash Closing Modal Component
const CashClosingModal = ({ summary, onClose, onConfirm, formatCurrency }) => {
  const [countedTotals, setCountedTotals] = useState({
    cash: '',
    card: '',
    transfer: ''
  });
  const [notes, setNotes] = useState('');

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calcular diferencias en tiempo real
  const differences = {
    cash: (parseFloat(countedTotals.cash) || 0) - summary.byPaymentMethod.Efectivo,
    card: (parseFloat(countedTotals.card) || 0) - summary.byPaymentMethod.Tarjeta,
    transfer: (parseFloat(countedTotals.transfer) || 0) - summary.byPaymentMethod.Transferencia
  };
  differences.total = differences.cash + differences.card + differences.transfer;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validar que se ingresaron todos los totales
    if (!countedTotals.cash || !countedTotals.card || !countedTotals.transfer) {
      toast.error('Debe ingresar todos los totales contados');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        countedTotals: {
          cash: parseFloat(countedTotals.cash),
          card: parseFloat(countedTotals.card),
          transfer: parseFloat(countedTotals.transfer)
        },
        notes
      });
    } catch (error) {
      setIsSubmitting(false);
    }
  };

  const getDifferenceColor = (value) => {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getDifferenceLabel = (value) => {
    if (value > 0) return `Sobrante: ${formatCurrency(Math.abs(value))}`;
    if (value < 0) return `Faltante: ${formatCurrency(Math.abs(value))}`;
    return 'Sin diferencia';
  };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ zIndex: 100000 }}>
      <div className="glass-strong rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CheckCircle className="w-7 h-7 text-primary-600" />
            Realizar Cierre de Caja
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Advertencia */}
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Esta acción finalizará su turno y cerrará su sesión
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Asegúrese de haber contado correctamente el dinero antes de continuar.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Totales del Sistema */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              Totales del Sistema (Esperados)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card-glass p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Ventas</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.totalSales}</p>
              </div>
              <div className="card-glass p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Efectivo</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(summary.byPaymentMethod.Efectivo)}
                </p>
              </div>
              <div className="card-glass p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Tarjeta</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(summary.byPaymentMethod.Tarjeta)}
                </p>
              </div>
              <div className="card-glass p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Transferencia</p>
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {formatCurrency(summary.byPaymentMethod.Transferencia)}
                </p>
              </div>
            </div>
          </div>

          {/* Conteo del Cajero */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Conteo del Cajero (Ingrese los totales contados)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Efectivo Contado <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={countedTotals.cash}
                  onChange={(e) => setCountedTotals({ ...countedTotals, cash: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
                {countedTotals.cash && (
                  <p className={`text-sm mt-1 font-medium ${getDifferenceColor(differences.cash)}`}>
                    {getDifferenceLabel(differences.cash)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Vouchers de Tarjeta <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={countedTotals.card}
                  onChange={(e) => setCountedTotals({ ...countedTotals, card: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
                {countedTotals.card && (
                  <p className={`text-sm mt-1 font-medium ${getDifferenceColor(differences.card)}`}>
                    {getDifferenceLabel(differences.card)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Transferencias <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={countedTotals.transfer}
                  onChange={(e) => setCountedTotals({ ...countedTotals, transfer: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
                {countedTotals.transfer && (
                  <p className={`text-sm mt-1 font-medium ${getDifferenceColor(differences.transfer)}`}>
                    {getDifferenceLabel(differences.transfer)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Diferencias Totales */}
          {(countedTotals.cash || countedTotals.card || countedTotals.transfer) && (
            <div className="card-glass p-6 border-2 border-primary-500/30">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Diferencia Total
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">
                  {differences.total === 0 ? '✓ Cuadra perfecto' : differences.total > 0 ? 'Sobrante' : 'Faltante'}
                </span>
                <span className={`text-3xl font-bold ${getDifferenceColor(differences.total)}`}>
                  {formatCurrency(Math.abs(differences.total))}
                </span>
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas / Justificación de diferencias (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[100px]"
              placeholder="Ejemplo: Faltante de $50 por error en cambio de la venta #1234..."
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Cerrando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Confirmar y Cerrar Turno
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default CashRegister;
