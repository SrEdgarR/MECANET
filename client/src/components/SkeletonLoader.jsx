import React from 'react';

// Skeleton base con animación mejorada
export const Skeleton = ({ className = '', variant = 'rectangular', delay = 0 }) => {
  const baseClasses = 'relative overflow-hidden bg-gray-200 dark:bg-gray-700';
  
  const variantClasses = {
    rectangular: 'rounded',
    circular: 'rounded-full',
    text: 'rounded h-4',
  };

  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Efecto shimmer/wave */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent" />
    </div>
  );
};

// Skeleton para KPI Card
export const KPICardSkeleton = () => {
  return (
    <div className="card-glass p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton className="h-4 w-24 mb-3" variant="text" />
          <Skeleton className="h-8 w-32 mb-2" variant="text" />
          <Skeleton className="h-3 w-28" variant="text" />
        </div>
        <Skeleton className="w-12 h-12" variant="circular" />
      </div>
    </div>
  );
};

// Skeleton para gráfica
export const ChartSkeleton = ({ height = '300px' }) => {
  return (
    <div className="card-glass p-6">
      <Skeleton className="h-6 w-48 mb-4" variant="text" />
      <div style={{ height }} className="flex items-end justify-around gap-2">
        {[...Array(7)].map((_, i) => (
          <Skeleton 
            key={i} 
            className="w-full" 
            style={{ height: `${Math.random() * 60 + 40}%` }}
          />
        ))}
      </div>
    </div>
  );
};

// Skeleton para gráfica de pastel
export const PieChartSkeleton = () => {
  return (
    <div className="card-glass p-6">
      <Skeleton className="h-6 w-56 mb-6" variant="text" />
      <div className="flex items-center justify-center">
        <Skeleton className="w-48 h-48" variant="circular" />
      </div>
      <div className="mt-6 flex justify-center gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="w-3 h-3" variant="circular" />
            <Skeleton className="h-3 w-16" variant="text" />
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton para lista de productos
export const ProductListSkeleton = ({ items = 5 }) => {
  return (
    <div className="card-glass p-6">
      <Skeleton className="h-6 w-40 mb-4" variant="text" />
      <div className="space-y-3">
        {[...Array(items)].map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2" variant="text" />
              <Skeleton className="h-3 w-24" variant="text" />
            </div>
            <Skeleton className="h-5 w-16" variant="text" />
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton para alertas de stock
export const AlertListSkeleton = ({ items = 3 }) => {
  return (
    <div className="card-glass p-6">
      <Skeleton className="h-6 w-40 mb-4" variant="text" />
      <div className="space-y-3">
        {[...Array(items)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <Skeleton className="w-5 h-5 mt-0.5" variant="circular" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 mb-2" variant="text" />
              <Skeleton className="h-3 w-32" variant="text" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton completo del Dashboard
export const DashboardSkeleton = () => {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </div>

      {/* Gráfica de ventas */}
      <ChartSkeleton height="400px" />

      {/* Fila media */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieChartSkeleton />
        <AlertListSkeleton />
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProductListSkeleton />
        <ProductListSkeleton />
      </div>
    </div>
  );
};

// Skeleton para tabla de datos (Inventario, Clientes, Proveedores, etc.)
export const TableSkeleton = ({ rows = 10, columns = 6 }) => {
  return (
    <div className="card-glass p-6 animate-fade-in">
      {/* Header de la tabla */}
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Barra de búsqueda y filtros */}
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 flex gap-4">
          {[...Array(columns)].map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" delay={i * 50} />
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {[...Array(rows)].map((_, rowIndex) => (
            <div key={rowIndex} className="p-4 flex gap-4">
              {[...Array(columns)].map((_, colIndex) => (
                <Skeleton 
                  key={colIndex} 
                  className="h-4 flex-1" 
                  delay={rowIndex * 50 + colIndex * 10}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Paginación */}
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" variant="circular" />
          <Skeleton className="h-8 w-8" variant="circular" />
          <Skeleton className="h-8 w-8" variant="circular" />
        </div>
      </div>
    </div>
  );
};

// Skeleton para formulario (Agregar/Editar productos, clientes, etc.)
export const FormSkeleton = ({ fields = 6 }) => {
  return (
    <div className="card-glass p-6 animate-fade-in">
      <Skeleton className="h-8 w-48 mb-6" />
      
      <div className="space-y-4">
        {[...Array(fields)].map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-32 mb-2" delay={i * 100} />
            <Skeleton className="h-10 w-full" delay={i * 100 + 50} />
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
};

// Skeleton para la sección de Facturación/Caja
export const BillingSkeleton = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Panel de productos */}
      <div className="lg:col-span-2 space-y-4">
        {/* Buscador */}
        <div className="card-glass p-4">
          <Skeleton className="h-10 w-full mb-4" />
          <div className="flex gap-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" delay={i * 50} />
            ))}
          </div>
        </div>

        {/* Grid de productos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="card-glass p-4">
              <Skeleton className="h-32 w-full mb-3" delay={i * 30} />
              <Skeleton className="h-4 w-full mb-2" delay={i * 30 + 10} />
              <Skeleton className="h-4 w-3/4 mb-3" delay={i * 30 + 20} />
              <Skeleton className="h-8 w-full" delay={i * 30 + 30} />
            </div>
          ))}
        </div>
      </div>

      {/* Panel de carrito */}
      <div className="space-y-4">
        <div className="card-glass p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          
          {/* Items del carrito */}
          <div className="space-y-3 mb-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <Skeleton className="h-16 w-16" delay={i * 100} />
                <div className="flex-1">
                  <Skeleton className="h-4 w-full mb-2" delay={i * 100 + 20} />
                  <Skeleton className="h-3 w-20" delay={i * 100 + 40} />
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-6 w-full mt-2" />
          </div>

          {/* Botones */}
          <div className="mt-6 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};

// Skeleton para Reportes
export const ReportsSkeleton = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filtros y controles */}
      <div className="card-glass p-6">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        <div className="flex gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-24" delay={i * 50} />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-32 mb-2" delay={i * 100} />
        ))}
      </div>

      {/* Resumen de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-glass p-6">
            <Skeleton className="h-4 w-24 mb-3" delay={i * 50} />
            <Skeleton className="h-8 w-32 mb-2" delay={i * 50 + 20} />
            <Skeleton className="h-3 w-20" delay={i * 50 + 40} />
          </div>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton height="300px" />
        <PieChartSkeleton />
      </div>

      {/* Tabla de datos */}
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
};

// Skeleton para Órdenes de Compra
export const PurchaseOrdersSkeleton = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header con acciones */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Filtros */}
      <div className="card-glass p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" delay={i * 50} />
          ))}
        </div>
      </div>

      {/* Lista de órdenes */}
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card-glass p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <Skeleton className="h-6 w-48 mb-2" delay={i * 100} />
                <Skeleton className="h-4 w-64" delay={i * 100 + 20} />
              </div>
              <Skeleton className="h-8 w-24" delay={i * 100 + 40} />
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" delay={i * 100 + j * 20} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton para Usuarios
export const UsersSkeleton = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card-glass p-6">
            <div className="flex items-center gap-4 mb-4">
              <Skeleton className="w-16 h-16" variant="circular" delay={i * 80} />
              <div className="flex-1">
                <Skeleton className="h-5 w-32 mb-2" delay={i * 80 + 20} />
                <Skeleton className="h-3 w-24" delay={i * 80 + 40} />
              </div>
            </div>
            <Skeleton className="h-4 w-full mb-2" delay={i * 80 + 60} />
            <Skeleton className="h-4 w-3/4" delay={i * 80 + 80} />
            <div className="flex gap-2 mt-4">
              <Skeleton className="h-8 w-20" delay={i * 80 + 100} />
              <Skeleton className="h-8 w-20" delay={i * 80 + 120} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton para Configuración
export const SettingsSkeleton = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <Skeleton className="h-8 w-48 mb-6" />

      {/* Secciones de configuración */}
      {[...Array(3)].map((_, sectionIndex) => (
        <div key={sectionIndex} className="card-glass p-6">
          <Skeleton className="h-6 w-40 mb-4" delay={sectionIndex * 200} />
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" delay={sectionIndex * 200 + i * 50} />
                  <Skeleton className="h-3 w-48" delay={sectionIndex * 200 + i * 50 + 20} />
                </div>
                <Skeleton className="h-10 w-48" delay={sectionIndex * 200 + i * 50 + 40} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
};

export default Skeleton;
