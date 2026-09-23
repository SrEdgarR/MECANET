import { csvCell } from '../utils/safeDocuments';
import { useState, useEffect } from "react";
import api from "../services/api";
import { toast } from "react-hot-toast";
import {
  Shield,
  User,
  Download,
  Trash2,
  Eye,
  Filter,
  Calendar,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock
} from "lucide-react";

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [pagination, setPagination] = useState(null);

  const [filters, setFilters] = useState({
    module: "",
    action: "",
    severity: "",
    entityType: "",
    startDate: "",
    endDate: "",
    page: 1,
    limit: 50
  });

  useEffect(() => {
    loadLogs();
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const response = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(response.data.logs || []);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error("Error al cargar logs de auditoría:", error);
      const errorMessage = error.response?.data?.message || error.message || "Error al cargar logs";
      toast.error(errorMessage);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get("/audit-logs/stats?days=7");
      setStats(response.data);
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
      setStats(null);
    }
  };

  const cleanOldLogs = async () => {
    if (!confirm("¿Está seguro que desea eliminar los logs de auditoría antiguos (mayores a 365 días)?")) {
      return;
    }

    try {
      const response = await api.delete("/audit-logs/clean", {
        data: { daysToKeep: 365 }
      });
      toast.success(response.data.message);
      loadLogs();
      loadStats();
    } catch (error) {
      console.error("Error al limpiar logs:", error);
      toast.error("Error al limpiar logs");
    }
  };

  const exportLogs = () => {
    const headers = ["Fecha", "Usuario", "Módulo", "Acción", "Entidad", "Descripción"];
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString("es-DO"),
      log.userInfo?.name || "Desconocido",
      log.module,
      log.action,
      `${log.entity.type} - ${log.entity.name}`,
      log.description
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(csvCell).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const getSeverityBadge = (severity) => {
    const badges = {
      info: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: <CheckCircle className="w-3 h-3" /> },
      warning: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: <AlertTriangle className="w-3 h-3" /> },
      critical: { color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: <XCircle className="w-3 h-3" /> }
    };

    const badge = badges[severity] || badges.info;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.icon}
        {severity}
      </span>
    );
  };

  const getModuleBadge = (module) => {
    const colors = {
      ventas: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      inventario: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      clientes: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      proveedores: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      usuarios: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      caja: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      devoluciones: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      ordenes_compra: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
      configuracion: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[module] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"}`}>
        {module.replace("_", " ").toUpperCase()}
      </span>
    );
  };

  const resetFilters = () => {
    setFilters({
      module: "",
      action: "",
      severity: "",
      entityType: "",
      startDate: "",
      endDate: "",
      page: 1,
      limit: 50
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Auditoría de Acciones de Usuario
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Registro de eventos de negocio significativos</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportLogs}
            disabled={logs.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={cleanOldLogs}
            className="btn-secondary flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Limpiar Antiguos
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      {stats && stats.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Acciones (7d)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.summary.total}</p>
              </div>
              <Shield className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Acciones Críticas</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.summary.critical}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Advertencias</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.summary.warning}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500 dark:text-yellow-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Acciones Normales</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.summary.info}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 dark:text-green-400" />
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card-glass p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
            <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            Filtros
          </h3>
          <button
            onClick={resetFilters}
            className="ml-auto text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Limpiar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <select
            value={filters.module}
            onChange={(e) => setFilters({ ...filters, module: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todos los módulos</option>
            <option value="ventas">Ventas</option>
            <option value="inventario">Inventario</option>
            <option value="clientes">Clientes</option>
            <option value="proveedores">Proveedores</option>
            <option value="usuarios">Usuarios</option>
            <option value="caja">Caja</option>
            <option value="devoluciones">Devoluciones</option>
            <option value="ordenes_compra">Órdenes de Compra</option>
            <option value="configuracion">Configuración</option>
          </select>

          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todas las acciones</option>
            <optgroup label="Ventas">
              <option value="Creación de Venta">Creación de Venta</option>
              <option value="Anulación de Venta">Anulación de Venta</option>
              <option value="Modificación de Venta">Modificación de Venta</option>
            </optgroup>
            <optgroup label="Inventario">
              <option value="Creación de Producto">Creación de Producto</option>
              <option value="Eliminación de Producto">Eliminación de Producto</option>
              <option value="Modificación de Producto">Modificación de Producto</option>
              <option value="Ajuste de Stock">Ajuste de Stock</option>
            </optgroup>
            <optgroup label="Clientes">
              <option value="Creación de Cliente">Creación de Cliente</option>
              <option value="Eliminación de Cliente">Eliminación de Cliente</option>
              <option value="Modificación de Cliente">Modificación de Cliente</option>
            </optgroup>
            <optgroup label="Usuarios y Seguridad">
              <option value="Inicio de Sesión Exitoso">Inicio de Sesión Exitoso</option>
              <option value="Intento de Inicio de Sesión Fallido">Intento Fallido</option>
              <option value="Creación de Usuario">Creación de Usuario</option>
              <option value="Eliminación de Usuario">Eliminación de Usuario</option>
              <option value="Cambio de Rol">Cambio de Rol</option>
            </optgroup>
          </select>

          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todas las severidades</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todas las entidades</option>
            <option value="Factura">Factura</option>
            <option value="Producto">Producto</option>
            <option value="Cliente">Cliente</option>
            <option value="Proveedor">Proveedor</option>
            <option value="Usuario">Usuario</option>
            <option value="Caja">Caja</option>
            <option value="Devolución">Devolución</option>
          </select>

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500 dark:[color-scheme:dark]"
            placeholder="Fecha inicio"
          />

          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500 dark:[color-scheme:dark]"
            placeholder="Fecha fin"
          />
        </div>
      </div>

      {/* Tabla de logs */}
      <div className="card-glass overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-500">
            <Shield className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No hay logs de auditoría disponibles</p>
            <p className="text-sm mt-2">Los eventos de usuario aparecerán aquí</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Fecha/Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Usuario</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Módulo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Acción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Entidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Descripción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Severidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          {new Date(log.timestamp).toLocaleString("es-DO")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{log.userInfo?.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{log.userInfo?.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getModuleBadge(log.module)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{log.entity.type}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{log.entity.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-md">
                        <p className="line-clamp-2">{log.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        {getSeverityBadge(log.severity)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                          title="Ver detalles completos"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} de{" "}
                  {pagination.total} logs
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    disabled={filters.page === 1}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-sm font-medium">
                    Página {pagination.page} de {pagination.pages}
                  </span>
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    disabled={filters.page >= pagination.pages}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de detalles */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto dark:bg-gray-900">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Detalles de Auditoría</h2>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Usuario */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Usuario</h3>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">{selectedLog.userInfo?.name} ({selectedLog.userInfo?.email})</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Rol: {selectedLog.userInfo?.role}</p>
                </div>

                {/* Fecha y Hora */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha y Hora</h3>
                  <p className="text-lg text-gray-900 dark:text-white">{new Date(selectedLog.timestamp).toLocaleString("es-DO", {
                    dateStyle: "full",
                    timeStyle: "long"
                  })}</p>
                </div>

                {/* Módulo y Acción */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Módulo</h3>
                    {getModuleBadge(selectedLog.module)}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Severidad</h3>
                    {getSeverityBadge(selectedLog.severity)}
                  </div>
                </div>

                {/* Acción */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Acción Realizada</h3>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">{selectedLog.action}</p>
                </div>

                {/* Entidad */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Entidad Afectada</h3>
                  <p className="text-lg text-gray-900 dark:text-white">{selectedLog.entity.type}: <span className="font-medium">{selectedLog.entity.name}</span></p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">ID: {selectedLog.entity.id}</p>
                </div>

                {/* Descripción */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Descripción</h3>
                  <p className="text-gray-800 whitespace-pre-line dark:text-gray-200">{selectedLog.description}</p>
                </div>

                {/* Cambios */}
                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Cambios Realizados</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2 dark:bg-gray-800">
                      {selectedLog.changes.map((change, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{change.fieldLabel}:</span>
                          <span className="text-gray-500 line-through">{String(change.oldValue)}</span>
                          <span>→</span>
                          <span className="text-green-600 font-medium">{String(change.newValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadatos */}
                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Información Adicional</h3>
                    <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-800">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap dark:text-gray-300">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="btn-primary"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
