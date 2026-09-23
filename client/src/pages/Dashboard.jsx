/**
 * @file Dashboard.jsx
 * @description Página principal con estadísticas y gráficos
 * 
 * Responsabilidades:
 * - Mostrar KPIs principales: ventas hoy, productos vendidos, bajo stock, total clientes
 * - Gráfico de ventas por día (últimos 7 días) con LineChart
 * - Tabla de productos más vendidos (top 5, últimos 30 días)
 * - Gráfico de ventas por método de pago (PieChart)
 * 
 * Estados:
 * - stats: Objeto con todaySales, todayProductsSold, lowStockCount, totalCustomers
 * - salesByDay: Array para gráfico de líneas (fecha, total)
 * - topProducts: Array de productos más vendidos (name, totalSold, totalRevenue)
 * - salesByPayment: Array para gráfico de pastel (paymentMethod, total, count)
 * - isLoading: Boolean durante fetch inicial
 * 
 * APIs:
 * - GET /api/dashboard/stats
 * - GET /api/dashboard/sales-by-day?days=7
 * - GET /api/dashboard/top-products?limit=5&days=30
 * - GET /api/dashboard/sales-by-payment?days=30
 * 
 * Gráficos (recharts):
 * - LineChart: Ventas por día con gradient (verde)
 * - PieChart: Métodos de pago con colores personalizados
 * 
 * UI:
 * - Skeleton loader durante carga inicial
 * - Cards con glassmorphism para KPIs
 * - Tooltips informativos en títulos de sección
 * - Responsive: grid cols-1 md:cols-2 lg:cols-4
 */

import { useState, useEffect } from 'react';
import {
  getAllDashboardData,
} from '../services/api';
import toast from 'react-hot-toast';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  Users,
  Info,
  HelpCircle,
} from 'lucide-react';
import { DashboardSkeleton } from '../components/SkeletonLoader';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [salesByDay, setSalesByDay] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [salesByPayment, setSalesByPayment] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSalesChartTooltip, setShowSalesChartTooltip] = useState(false);
  const [showPaymentChartTooltip, setShowPaymentChartTooltip] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      // Una sola petición para todo el dashboard
      const response = await getAllDashboardData();
      const data = response.data;

      setStats(data.stats);
      setSalesByDay(data.salesByDay);
      setTopProducts(data.topProducts);
      const preferredOrder = ['Efectivo', 'Tarjeta', 'Transferencia'];
      const normalizedPayments = (data.salesByPayment || []).map((entry) => ({
        ...entry,
        name: entry.name || entry._id || 'Desconocido'
      }));

      normalizedPayments.sort((a, b) => {
        const aIndex = preferredOrder.indexOf(a.name);
        const bIndex = preferredOrder.indexOf(b.name);
        if (aIndex === -1 && bIndex === -1) {
          return a.name.localeCompare(b.name);
        }
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      setSalesByPayment(normalizedPayments);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Error al cargar datos del dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  // Colores vibrantes y atractivos con gradientes
  const COLORS = [
    '#6366f1', // Indigo vibrante
    '#ec4899', // Pink brillante
    '#14b8a6', // Teal moderno
    '#f59e0b', // Amber cálido
    '#8b5cf6', // Púrpura profundo
  ];

  // Custom label para la gráfica de pastel - mejorado para mantener dentro
  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }) => {
    // Solo mostrar si el porcentaje es significativo (mayor a 5%)
    if (percent < 0.05) return null;

    const RADIAN = Math.PI / 180;
    // Posicionar en el centro del anillo (entre innerRadius y outerRadius)
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontSize: '14px',
          fontWeight: 'bold',
          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
          pointerEvents: 'none'
        }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Ventas de Hoy"
          tooltip="Total de ingresos generados hoy incluyendo todos los métodos de pago"
          value={formatCurrency(stats?.today?.total || 0)}
          icon={DollarSign}
          color="blue"
          subtitle={`${stats?.today?.transactions || 0} transacciones`}
        />
        <KPICard
          title="Venta Promedio"
          value={formatCurrency(stats?.today?.avgTicket || 0)}
          icon={TrendingUp}
          color="green"
          subtitle="Por transacción hoy"
          tooltip="Monto promedio por cada venta realizada hoy (total de ventas ÷ número de ventas)"
        />
        <KPICard
          title="Productos"
          value={stats?.inventory?.totalProducts || 0}
          icon={Package}
          color="purple"
          subtitle={`${stats?.inventory?.lowStockProducts || 0} con bajo stock`}
          tooltip="Total de productos registrados en el inventario. Se alerta cuando hay productos con stock bajo"
        />
        <KPICard
          title="Clientes"
          value={stats?.customers || 0}
          icon={Users}
          color="orange"
          subtitle="Registrados"
          tooltip="Número total de clientes registrados en el sistema con su información y historial de compras"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Day Chart */}
        <div className="card-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ventas de la Última Semana
            </h3>
            <div className="relative">
              <button
                onMouseEnter={() => setShowSalesChartTooltip(true)}
                onMouseLeave={() => setShowSalesChartTooltip(false)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <HelpCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
              {showSalesChartTooltip && (
                <div className="absolute right-0 top-8 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg shadow-xl z-50">
                  <p className="font-semibold mb-1">¿Qué muestra esta gráfica?</p>
                  <p className="text-xs leading-relaxed">
                    Muestra el total de ventas diarias (ingresos) de los últimos 7 días.
                    Cada barra representa el monto total vendido en ese día. Pasa el cursor sobre las barras para ver detalles.
                  </p>
                </div>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={salesByDay}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={12}
                tickMargin={10}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                }}
                formatter={(value) => [formatCurrency(value), 'Ventas']}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={3}
                fill="url(#colorTotal)"
                name="Total de Ventas"
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Payment Method */}
        <div className="card-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ventas por Método de Pago
            </h3>
            <div className="relative">
              <button
                onMouseEnter={() => setShowPaymentChartTooltip(true)}
                onMouseLeave={() => setShowPaymentChartTooltip(false)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <HelpCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
              {showPaymentChartTooltip && (
                <div className="absolute right-0 top-8 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-sm rounded-lg shadow-xl z-50">
                  <p className="font-semibold mb-1">¿Qué muestra esta gráfica?</p>
                  <p className="text-xs leading-relaxed">
                    Distribución de ventas de los últimos 30 días por método de pago (Efectivo, Tarjeta, Transferencia).
                    Cada porción representa el porcentaje del total.
                  </p>
                </div>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <defs>
                {COLORS.map((color, index) => (
                  <linearGradient key={`gradient-${index}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                  </linearGradient>
                ))}
              </defs>
              <Pie
                data={salesByPayment}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={110}
                innerRadius={60}
                fill="#8884d8"
                dataKey="total"
                nameKey="name"
                paddingAngle={3}
                animationBegin={0}
                animationDuration={800}
              >
                {salesByPayment.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`url(#gradient-${index % COLORS.length})`}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.85)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
                labelStyle={{
                  color: '#fff',
                  fontWeight: 'bold',
                  marginBottom: '4px'
                }}
                itemStyle={{
                  color: '#fff',
                  padding: '2px 0'
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                formatter={(value) => (
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {value}
                  </span>
                )}
                wrapperStyle={{
                  paddingTop: '20px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Estadísticas adicionales debajo de la gráfica */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {salesByPayment.map((payment, index) => {
              const methodName = payment.name || payment._id || 'Desconocido';
              return (
                <div
                  key={`${methodName}-${index}`}
                  className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600"
                >
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-2"
                    style={{
                      background: `linear-gradient(180deg, ${COLORS[index % COLORS.length]} 0%, ${COLORS[index % COLORS.length]}99 100%)`
                    }}
                  />
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {methodName}
                  </p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(payment.total)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="card-glass p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Productos Más Vendidos (Últimos 30 días)
          </h3>
          <div className="space-y-3">
            {topProducts.map((product, index) => (
              <div
                key={product._id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-primary-600 dark:text-primary-400">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {product.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {product.sku}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {product.totalQuantity} unid.
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {formatCurrency(product.totalRevenue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="card-glass p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Productos con Bajo Stock
            </h3>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
            {stats?.inventory?.lowStockItems?.map((product) => (
              <div
                key={product._id}
                className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {product.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {product.sku}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                    {product.stock}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    en stock
                  </p>
                </div>
              </div>
            ))}
            {stats?.inventory?.lowStockItems?.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No hay productos con bajo stock
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// KPI Card Component
const KPICard = ({ title, value, icon: Icon, color, subtitle, tooltip }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="card-glass hover-lift relative">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            {tooltip && (
              <div className="relative">
                <button
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <Info className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {showTooltip && (
                  <div className="absolute left-0 top-6 w-56 p-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-xl z-50">
                    {tooltip}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={`w-12 h-12 bg-gradient-to-br ${colorClasses[color]} rounded-xl flex items-center justify-center shadow-lg`}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
