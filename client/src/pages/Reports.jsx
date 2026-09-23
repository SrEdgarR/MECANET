import API from '../services/api';
/**
 * @file Reports.jsx
 * @description Página de reportes y analíticas (solo admin)
 * 
 * Responsabilidades:
 * - Generar reportes de ventas, inventario, clientes
 * - Mostrar gráficos de análisis (recharts)
 * - Exportar reportes en múltiples formatos (Excel, PDF, CSV)
 * - Filtrar reportes por fechas
 * - Imprimir reportes
 * 
 * Tipos de Reportes:
 * 1. Reporte de Ventas:
 *    - Ventas por periodo con totales
 *    - Gráfico de ventas por día (LineChart)
 *    - Gráfico de ventas por método de pago (PieChart)
 *    - Productos más vendidos (BarChart)
 * 
 * 2. Reporte de Inventario:
 *    - Listado de productos con stock actual
 *    - Productos con bajo stock
 *    - Valor total del inventario
 *    - Gráfico de distribución por categoría
 * 
 * 3. Reporte de Clientes:
 *    - Listado de clientes con historial de compras
 *    - Clientes frecuentes (top 10)
 *    - Total de clientes activos
 * 
 * Estados:
 * - reportType: 'sales', 'inventory', 'customers'
 * - dateRange: { startDate, endDate }
 * - sales, products, customers: Datos desde backend
 * - isLoading: Boolean durante fetch
 * - reportData: Datos procesados para el reporte actual
 * - charts: Datos formateados para recharts
 * 
 * APIs:
 * - GET /api/sales (con filtros de fecha)
 * - GET /api/products
 * - GET /api/customers
 * - GET /api/dashboard/sales-by-day
 * - GET /api/dashboard/top-products
 * - GET /api/dashboard/sales-by-payment
 * 
 * Exportación:
 * - Excel (XLSX): Usa biblioteca 'xlsx' para generar .xlsx
 * - PDF: Usa 'jspdf' + 'jspdf-autotable' para tablas
 * - CSV: Formato de texto plano separado por comas
 * 
 * Formato de Exportación:
 * - Incluye logo del negocio
 * - Header con nombre de reporte y fechas
 * - Tabla de datos
 * - Totales y resúmenes
 * - Footer con fecha de generación
 * 
 * UI Features:
 * - Selector de tipo de reporte (tabs)
 * - Selector de rango de fechas
 * - Gráficos interactivos (recharts)
 * - Botones de exportación (Excel, PDF, CSV, Imprimir)
 * - Skeleton loader durante carga
 * - Tooltips informativos
 */

import React, { useState, useEffect } from 'react';
import { getSales, getProducts, getCustomers, getProductsWithProfit } from '../services/api';
import { useSettingsStore } from '../store/settingsStore';
import toast from 'react-hot-toast';
import { ReportsSkeleton } from '../components/SkeletonLoader';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Calendar,
  Download,
  FileText,
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  Filter,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  Printer,
  Search,
  HelpCircle,
  Info,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const Reports = () => {
  const { settings } = useSettingsStore();

  // Helper para obtener fecha local sin problemas de zona horaria
  const getLocalDateString = (daysOffset = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState('sales');
  const [selectedRange, setSelectedRange] = useState('week'); // 'today', '3days', 'week', 'month', 'year', 'custom'
  const [dateRange, setDateRange] = useState({
    startDate: getLocalDateString(-7),
    endDate: getLocalDateString(0),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({
    current: 0,
    total: 0,
    stage: '',
    percentage: 0
  });
  const [salesData, setSalesData] = useState([]);
  const [productsData, setProductsData] = useState([]);
  const [customersData, setCustomersData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);

  // Calcular rango de fechas según selección
  const getDateRangeBySelection = (range) => {
    const endDate = getLocalDateString(0); // Hoy
    let startDate;

    switch (range) {
      case 'today':
        startDate = endDate; // Mismo día
        break;
      case '3days':
        startDate = getLocalDateString(-3);
        break;
      case 'week':
        startDate = getLocalDateString(-7);
        break;
      case 'month':
        startDate = getLocalDateString(-30);
        break;
      case 'year':
        startDate = getLocalDateString(-365);
        break;
      default:
        return dateRange;
    }

    return { startDate, endDate };
  };

  // Manejar cambio de rango predefinido
  const handleRangeChange = (range) => {
    setSelectedRange(range);
    if (range !== 'custom') {
      setDateRange(getDateRangeBySelection(range));
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [dateRange, activeTab]);

  const fetchReportData = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress({ current: 0, total: 3, stage: 'Iniciando...', percentage: 0 });

      if (activeTab === 'sales') {
        // Etapa 1: Cargar ventas
        setLoadingProgress({ current: 1, total: 3, stage: 'Cargando ventas...', percentage: 33 });
        const response = await getSales({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          limit: 10000
        });
        const salesArray = response?.data?.sales || response?.data || [];
        setSalesData(Array.isArray(salesArray) ? salesArray : []);

        // Etapa 2: Procesar datos
        setLoadingProgress({ current: 2, total: 3, stage: 'Procesando datos...', percentage: 66 });
        await new Promise(resolve => setTimeout(resolve, 300));
        setFilteredData(Array.isArray(salesArray) ? salesArray : []);

        // Etapa 3: Completado
        setLoadingProgress({ current: 3, total: 3, stage: 'Completado', percentage: 100 });

      } else if (activeTab === 'products') {
        // Etapa 1: Cargar productos con beneficio
        setLoadingProgress({ current: 1, total: 3, stage: 'Cargando productos...', percentage: 33 });
        const response = await getProductsWithProfit({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        });
        const productsArray = response?.data?.products || response?.data || [];
        setProductsData(Array.isArray(productsArray) ? productsArray : []);

        // Etapa 2: Procesar datos
        setLoadingProgress({ current: 2, total: 3, stage: 'Calculando inventario...', percentage: 66 });
        await new Promise(resolve => setTimeout(resolve, 300));
        setFilteredData(Array.isArray(productsArray) ? productsArray : []);

        // Etapa 3: Completado
        setLoadingProgress({ current: 3, total: 3, stage: 'Completado', percentage: 100 });

      } else if (activeTab === 'customers') {
        // Etapa 1: Cargar clientes
        setLoadingProgress({ current: 1, total: 3, stage: 'Cargando clientes...', percentage: 33 });
        const response = await getCustomers({ limit: 10000 });
        const customersArray = response?.data?.customers || response?.data || [];
        setCustomersData(Array.isArray(customersArray) ? customersArray : []);

        // Etapa 2: Procesar datos
        setLoadingProgress({ current: 2, total: 3, stage: 'Analizando historial...', percentage: 66 });
        await new Promise(resolve => setTimeout(resolve, 300));
        setFilteredData(Array.isArray(customersArray) ? customersArray : []);

        // Etapa 3: Completado
        setLoadingProgress({ current: 3, total: 3, stage: 'Completado', percentage: 100 });
      }

      // Pequeña pausa para mostrar el 100%
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error('Error fetching report data:', error);
      toast.error('Error al cargar datos del reporte');
      setSalesData([]);
      setProductsData([]);
      setCustomersData([]);
      setFilteredData([]);
    } finally {
      setIsLoading(false);
      setLoadingProgress({ current: 0, total: 0, stage: '', percentage: 0 });
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(value);
  };

  const formatDate = (date) => {
    // Agregar 'T00:00:00' para evitar problemas de zona horaria
    const dateString = date.includes('T') ? date : `${date}T00:00:00`;
    return new Date(dateString).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Santo_Domingo'
    });
  };

  // Cálculos para el reporte de ventas
  const getSalesSummary = () => {
    const validSales = salesData.filter(s => s.status !== 'Cancelada');
    const total = validSales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
    const subtotal = validSales.reduce((sum, sale) => sum + (Number(sale.subtotal) || 0), 0);
    const discounts = validSales.reduce((sum, sale) => sum + (Number(sale.totalDiscount) || 0), 0);
    const transactions = validSales.length;
    const avgTicket = transactions > 0 ? total / transactions : 0;

    return { total, subtotal, discounts, transactions, avgTicket };
  };

  // Ventas por día
  const getSalesByDay = () => {
    const salesByDay = {};
    salesData.filter(s => s.status !== 'Cancelada').forEach(sale => {
      const date = new Date(sale.createdAt).toLocaleDateString('es-DO', { month: 'short', day: 'numeric' });
      salesByDay[date] = (salesByDay[date] || 0) + (Number(sale.total) || 0);
    });
    return Object.keys(salesByDay).map(date => ({
      date,
      total: salesByDay[date]
    }));
  };

  // Ventas por método de pago
  const getSalesByPaymentMethod = () => {
    const byMethod = {};
    salesData.filter(s => s.status !== 'Cancelada').forEach(sale => {
      byMethod[sale.paymentMethod] = (byMethod[sale.paymentMethod] || 0) + (Number(sale.total) || 0);
    });
    return Object.keys(byMethod).map(method => ({
      name: method,
      value: byMethod[method]
    }));
  };

  // Top productos vendidos
  const getTopProducts = () => {
    const productSales = {};
    salesData.filter(s => s.status !== 'Cancelada').forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach(item => {
          const productName = item.product?.name || 'Producto';
          if (!productSales[productName]) {
            productSales[productName] = { quantity: 0, revenue: 0 };
          }
          productSales[productName].quantity += Number(item.quantity) || 0;
          productSales[productName].revenue += Number(item.subtotal) || 0;
        });
      }
    });

    return Object.keys(productSales)
      .map(name => ({
        name,
        quantity: productSales[name].quantity,
        revenue: productSales[name].revenue
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  };

  // Top clientes
  const getTopCustomers = () => {
    return [...customersData]
      .sort((a, b) => (b.totalPurchases || 0) - (a.totalPurchases || 0))
      .slice(0, 10);
  };

  // Productos con bajo stock
  const getLowStockProducts = () => {
    return productsData.filter(p => p.stock <= p.minStock);
  };

  // Exportar a Excel
  const exportToExcel = () => {
    let data = [];
    let filename = '';
    let sheetName = '';

    if (activeTab === 'sales') {
      data = salesData.filter(s => s.status !== 'Cancelada').map(sale => ({
        'Factura': sale.invoiceNumber,
        'Fecha': formatDate(sale.createdAt),
        'Hora': new Date(sale.createdAt).toLocaleTimeString('es-DO'),
        'Cliente': sale.customer?.fullName || 'General',
        'Método de Pago': sale.paymentMethod,
        'Subtotal': sale.subtotal,
        'Descuento': sale.totalDiscount || 0,
        'Total': sale.total
      }));
      filename = `ventas_${dateRange.startDate}_${dateRange.endDate}.xlsx`;
      sheetName = 'Ventas';
    } else if (activeTab === 'products') {
      data = productsData.map(product => ({
        'SKU': product.sku,
        'Nombre': product.name,
        'Categoría': product.category || '',
        'Marca': product.brand || '',
        'Precio Compra': product.purchasePrice,
        'Precio Venta': product.sellingPrice,
        'Stock': product.stock,
        'Stock Mínimo': product.minStock,
        'Vendidos': product.soldCount || 0,
        'Unidades Vendidas (Periodo)': product.totalQuantitySold || 0,
        'Ingresos Totales': product.totalRevenue || 0,
        'Costo Total': product.totalCost || 0,
        'Beneficio': product.totalProfit || 0,
        'Beneficio por Unidad': product.profitPerUnit || 0,
        'Margen %': product.profitMargin ? product.profitMargin.toFixed(2) : '0.00'
      }));
      filename = 'productos.xlsx';
      sheetName = 'Productos';
    } else if (activeTab === 'customers') {
      data = customersData.map(customer => ({
        'Nombre': customer.fullName,
        'Cédula': customer.cedula || '',
        'Teléfono': customer.phone || '',
        'Email': customer.email || '',
        'Total Compras': customer.totalPurchases || 0,
        '# Compras': customer.purchaseHistory?.length || 0,
        'Fecha Registro': formatDate(customer.createdAt)
      }));
      filename = 'clientes.xlsx';
      sheetName = 'Clientes';
    }

    if (data.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Auto ajustar ancho de columnas
    const maxWidth = data.reduce((w, r) => Math.max(w, Object.keys(r).length), 10);
    worksheet['!cols'] = Array(maxWidth).fill({ wch: 15 });

    XLSX.writeFile(workbook, filename);
    toast.success('Reporte exportado a Excel exitosamente');
  };

  // Exportar a PDF
  const exportToPDF = async () => {
    // Validar que hay datos
    if (activeTab === 'sales' && salesData.length === 0) {
      toast.error('No hay datos de ventas para exportar');
      return;
    }
    if (activeTab === 'products' && productsData.length === 0) {
      toast.error('No hay datos de productos para exportar');
      return;
    }
    if (activeTab === 'customers' && customersData.length === 0) {
      toast.error('No hay datos de clientes para exportar');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let yPosition = 20;

    // Logo y nombre de empresa
    let logoLoaded = false;
    if (settings.businessLogoUrl) {
      try {
        const imageUrl = settings.businessLogoUrl;
        const blob = /^https?:/i.test(imageUrl)
          ? (await API.get('/proxy/image', { params: { url: imageUrl }, responseType: 'blob' })).data
          : await (await fetch(imageUrl)).blob();

        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        doc.addImage(base64, 'PNG', 14, 10, 30, 30);
        logoLoaded = true;
        yPosition = 45;
      } catch (error) {
        console.log('No se pudo cargar el logo:', error.message || error);
        // No mostrar toast de error, solo continuar sin logo
      }
    }

    // Nombre de la empresa
    if (settings.businessName) {
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      const xPos = logoLoaded ? 50 : pageWidth / 2;
      const align = logoLoaded ? 'left' : 'center';
      doc.text(settings.businessName, xPos, logoLoaded ? 25 : yPosition, { align });
      yPosition = logoLoaded ? 45 : yPosition + 10;
    }

    // Línea separadora
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.5);
    doc.line(14, yPosition, pageWidth - 14, yPosition);
    yPosition += 10;

    // Título del reporte
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');

    if (activeTab === 'sales') {
      doc.text('Reporte de Ventas', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Periodo: ${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // Resumen
      const summary = getSalesSummary();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumen:', 14, yPosition);
      yPosition += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Ventas: ${formatCurrency(summary.total)}`, 14, yPosition);
      yPosition += 5;
      doc.text(`Transacciones: ${summary.transactions}`, 14, yPosition);
      yPosition += 5;
      doc.text(`Ticket Promedio: ${formatCurrency(summary.avgTicket)}`, 14, yPosition);
      yPosition += 10;

      // Tabla de ventas
      const tableData = salesData.filter(s => s.status !== 'Cancelada').map(sale => {
        const date = new Date(sale.createdAt);
        const dateStr = date.toLocaleDateString('es-DO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('es-DO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        return [
          sale.invoiceNumber,
          `${dateStr}\n${timeStr}`,
          sale.customer?.fullName || 'General',
          sale.paymentMethod,
          formatCurrency(sale.total)
        ];
      });

      autoTable(doc, {
        startY: yPosition,
        head: [['Factura', 'Fecha', 'Cliente', 'Método Pago', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        margin: { top: 10 },
        styles: { cellPadding: 3, fontSize: 9 }
      });

      doc.save(`ventas_${dateRange.startDate}_${dateRange.endDate}.pdf`);

    } else if (activeTab === 'products') {
      doc.text('Reporte de Productos', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      const tableData = productsData.map(product => [
        product.sku,
        product.name,
        product.category || '',
        product.brand || '',
        formatCurrency(product.sellingPrice),
        product.stock.toString(),
        product.totalQuantitySold || 0,
        formatCurrency(product.totalProfit || 0),
        (product.profitMargin || 0).toFixed(2) + '%'
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [['SKU', 'Nombre', 'Categoría', 'Marca', 'Precio', 'Stock', 'Vendidos', 'Beneficio', 'Margen %']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8 }
      });

      doc.save('productos.pdf');

    } else if (activeTab === 'customers') {
      doc.text('Reporte de Clientes', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      const tableData = customersData.map(customer => [
        customer.fullName,
        customer.cedula || '',
        customer.phone || '',
        formatCurrency(customer.totalPurchases || 0),
        (customer.purchaseHistory?.length || 0).toString()
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [['Nombre', 'Cédula', 'Teléfono', 'Total Compras', '# Compras']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9 }
      });

      doc.save('clientes.pdf');
    }

    toast.success('Reporte exportado a PDF exitosamente');
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Componente de progreso de carga
  const LoadingProgress = () => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 120 120">
              {/* Círculo de fondo */}
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-gray-300 dark:text-gray-700"
              />
              {/* Círculo de progreso */}
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                className="text-primary-600 transition-all duration-300"
                strokeDasharray={`${2 * Math.PI * 54}`}
                strokeDashoffset={`${2 * Math.PI * 54 * (1 - loadingProgress.percentage / 100)}`}
              />
            </svg>
            {/* Porcentaje en el centro */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {Math.round(loadingProgress.percentage)}%
              </span>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Generando Reporte
          </h3>

          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {loadingProgress.stage}
          </p>

          {/* Barra de progreso lineal */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress.percentage}%` }}
            />
          </div>

          {/* Indicador de etapas */}
          <div className="mt-4 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className={loadingProgress.current >= 1 ? 'text-primary-600 font-medium' : ''}>
              1. Cargar
            </span>
            <span className={loadingProgress.current >= 2 ? 'text-primary-600 font-medium' : ''}>
              2. Procesar
            </span>
            <span className={loadingProgress.current >= 3 ? 'text-primary-600 font-medium' : ''}>
              3. Completar
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // Mostrar progreso de carga
  if (isLoading) {
    return <LoadingProgress />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reportes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Análisis y exportación de datos
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="btn-primary flex items-center gap-2 print:hidden">
            <Download className="w-5 h-5" />
            Exportar Excel
          </button>
          <button onClick={exportToPDF} className="btn-secondary flex items-center gap-2 print:hidden">
            <FileText className="w-5 h-5" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card-glass p-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'sales'
              ? 'bg-primary-600 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            <TrendingUp className="w-5 h-5" />
            Ventas
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'products'
              ? 'bg-primary-600 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            <Package className="w-5 h-5" />
            Productos
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'customers'
              ? 'bg-primary-600 text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
          >
            <Users className="w-5 h-5" />
            Clientes
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      {activeTab === 'sales' && (
        <div className="card-glass p-4 space-y-4">
          {/* Botones de rango predefinido */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleRangeChange('today')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedRange === 'today'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Hoy
            </button>
            <button
              onClick={() => handleRangeChange('3days')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedRange === '3days'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Últimos 3 Días
            </button>
            <button
              onClick={() => handleRangeChange('week')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedRange === 'week'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Última Semana
            </button>
            <button
              onClick={() => handleRangeChange('month')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedRange === 'month'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Último Mes
            </button>
            <button
              onClick={() => handleRangeChange('year')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedRange === 'year'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Último Año
            </button>
            <button
              onClick={() => handleRangeChange('custom')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedRange === 'custom'
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Personalizado
            </button>
          </div>

          {/* Inputs de fecha personalizada */}
          {selectedRange === 'custom' && (
            <div className="flex items-center gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">Periodo:</span>
              </div>
              <input
                type="date"
                value={dateRange.startDate}
                max={getLocalDateString(0)}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="input"
              />
              <span className="text-gray-500">-</span>
              <input
                type="date"
                value={dateRange.endDate}
                max={getLocalDateString(0)}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="input"
              />
            </div>
          )}

          {/* Indicador de rango seleccionado */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Mostrando datos desde <span className="font-semibold text-gray-900 dark:text-white">{formatDate(dateRange.startDate)}</span> hasta <span className="font-semibold text-gray-900 dark:text-white">{formatDate(dateRange.endDate)}</span>
            </p>
            {salesData.length === 0 && !isLoading && (
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <Info className="w-4 h-4" />
                No hay ventas en este periodo
              </p>
            )}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {/* Sales Report */}
          {activeTab === 'sales' && <SalesReport
            summary={getSalesSummary()}
            salesByDay={getSalesByDay()}
            salesByPayment={getSalesByPaymentMethod()}
            topProducts={getTopProducts()}
            salesData={salesData}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            COLORS={COLORS}
          />}

          {/* Products Report */}
          {activeTab === 'products' && <ProductsReport
            products={productsData}
            lowStockProducts={getLowStockProducts()}
            formatCurrency={formatCurrency}
          />}

          {/* Customers Report */}
          {activeTab === 'customers' && <CustomersReport
            customers={customersData}
            topCustomers={getTopCustomers()}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />}
        </>
      )}
    </div>
  );
};

// Sales Report Component
const SalesReport = ({ summary, salesByDay, salesByPayment, topProducts, salesData, formatCurrency, formatDate, COLORS }) => {
  const [showTooltip, setShowTooltip] = React.useState(null);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Ventas</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('totalVentas')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'totalVentas' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Total de ingresos generados en el periodo seleccionado
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(summary.total)}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Subtotal</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('subtotal')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'subtotal' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Suma de ventas antes de aplicar descuentos
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(summary.subtotal)}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Descuentos</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('descuentos')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'descuentos' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Total de descuentos aplicados a las ventas
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(summary.discounts)}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Transacciones</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('transacciones')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'transacciones' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Número total de ventas realizadas
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.transactions}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Ticket Promedio</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('ticketPromedio')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'ticketPromedio' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Valor promedio por transacción
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {formatCurrency(summary.avgTicket)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Day */}
        <div className="card-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ventas por Día
            </h3>
            <div className="relative">
              <HelpCircle
                className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('ventasPorDia')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'ventasPorDia' && (
                <div className="absolute bottom-full right-0 mb-2 w-56 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Muestra la evolución de las ventas diarias durante el periodo seleccionado
                </div>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                formatter={(value) => formatCurrency(value)}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Payment Method */}
        <div className="card-glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Por Método de Pago
            </h3>
            <div className="relative">
              <HelpCircle
                className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('metodosPago')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'metodosPago' && (
                <div className="absolute bottom-full right-0 mb-2 w-56 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Distribución porcentual de ventas por método de pago (Efectivo, Tarjeta, Transferencia)
                </div>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPie>
              <Pie
                data={salesByPayment}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {salesByPayment.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </RechartsPie>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Top 10 Productos Más Vendidos
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cantidad</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ingresos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {topProducts.map((product, index) => (
                <tr key={index}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-bold">{index + 1}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{product.name}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{product.quantity}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales List */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Detalle de Ventas
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Factura</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Método</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {salesData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No hay ventas registradas en este periodo
                  </td>
                </tr>
              ) : (
                salesData.slice(0, 50).map((sale) => (
                  <tr key={sale._id}>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{sale.invoiceNumber}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(sale.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{sale.customer?.fullName || 'General'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{sale.paymentMethod}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(sale.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Products Report Component
const ProductsReport = ({ products, lowStockProducts, formatCurrency }) => {
  const [showTooltip, setShowTooltip] = React.useState(null);
  const totalValue = products.reduce((sum, p) => sum + (p.sellingPrice * p.stock), 0);
  const totalProducts = products.length;
  const outOfStock = products.filter(p => p.stock === 0).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Productos</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('totalProductos')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'totalProductos' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Cantidad total de productos registrados en el inventario
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalProducts}</p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Valor Inventario</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('valorInventario')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'valorInventario' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Valor total del inventario actual (precio × stock)
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(totalValue)}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Bajo Stock</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('bajoStock')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'bajoStock' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Productos con stock igual o menor al stock mínimo
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {lowStockProducts.length}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Sin Stock</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('sinStock')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'sinStock' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Productos agotados que requieren reabastecimiento urgente
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{outOfStock}</p>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <div className="card-glass p-6 border-l-4 border-yellow-500">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            ⚠️ Productos con Bajo Stock
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SKU</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stock Actual</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stock Mínimo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {lowStockProducts.map((product) => (
                  <tr key={product._id}>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-mono">{product.sku}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{product.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${product.stock === 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{product.minStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Products */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Inventario Completo
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SKU</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Producto</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Categoría</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Precio</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stock</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {products.map((product) => (
                <tr key={product._id}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-mono">{product.sku}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{product.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{product.category || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                    {formatCurrency(product.sellingPrice)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${product.stock === 0 ? 'text-red-600' :
                      product.stock <= product.minStock ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(product.sellingPrice * product.stock)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Customers Report Component
const CustomersReport = ({ customers, topCustomers, formatCurrency, formatDate }) => {
  const [showTooltip, setShowTooltip] = React.useState(null);
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter(c => c.purchaseHistory && c.purchaseHistory.length > 0).length;
  const totalRevenue = customers.reduce((sum, c) => sum + (c.totalPurchases || 0), 0);
  const avgPerCustomer = activeCustomers > 0 ? totalRevenue / activeCustomers : 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Clientes</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('totalClientes')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'totalClientes' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Número total de clientes registrados en el sistema
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalCustomers}</p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Clientes Activos</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('clientesActivos')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'clientesActivos' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Clientes que han realizado al menos una compra
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCustomers}</p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Ingresos Totales</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('ingresosTotales')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'ingresosTotales' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Total de ingresos generados por todos los clientes
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
        <div className="card-glass p-4 relative">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Promedio/Cliente</p>
            <div className="relative">
              <Info
                className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
                onMouseEnter={() => setShowTooltip('promedioCliente')}
                onMouseLeave={() => setShowTooltip(null)}
              />
              {showTooltip === 'promedioCliente' && (
                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                  Valor promedio de compras por cliente activo
                </div>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {formatCurrency(avgPerCustomer)}
          </p>
        </div>
      </div>

      {/* Top Customers */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Top 10 Mejores Clientes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contacto</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"># Compras</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Gastado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {topCustomers.map((customer, index) => (
                <tr key={customer._id}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-bold">{index + 1}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{customer.fullName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{customer.phone || customer.email}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                    {customer.purchaseHistory?.length || 0}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(customer.totalPurchases || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Customers */}
      <div className="card-glass p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Todos los Clientes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nombre</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cédula</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Teléfono</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Compras</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Registro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {customers.map((customer) => (
                <tr key={customer._id}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{customer.fullName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono">{customer.cedula || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{customer.phone || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{customer.email || '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                    {customer.purchaseHistory?.length || 0}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(customer.totalPurchases || 0)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(customer.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
