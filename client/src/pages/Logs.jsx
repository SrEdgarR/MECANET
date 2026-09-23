import { csvCell } from '../utils/safeDocuments';
﻿import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import { toast } from "react-hot-toast";
import {
  Activity,
  XCircle,
  AlertCircle,
  Box,
  Filter,
  Eye,
  CheckCircle,
  AlertTriangle,
  Info,
  User,
  Download,
  Trash2
} from "lucide-react";

const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [hoveredLog, setHoveredLog] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [pagination, setPagination] = useState(null);
  const hoverTimeoutRef = useRef(null);

  const [filters, setFilters] = useState({
    type: "",
    module: "",
    severity: "",
    isSystemAction: "",
    statusCode: "",
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

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const response = await api.get(`/logs?${params.toString()}`);
      setLogs(response.data.logs || []);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error("Error al cargar logs:", error);
      const errorMessage = error.response?.data?.message || error.message || "Error al cargar logs";
      toast.error(errorMessage);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get("/logs/stats?days=7");
      setStats(response.data || []);
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
      setStats([]);
    }
  };

  const cleanOldLogs = async () => {
    if (!confirm("¿Está seguro que desea eliminar los logs antiguos (mayores a 90 días)?")) {
      return;
    }

    try {
      const response = await api.delete("/logs/clean", {
        data: { daysToKeep: 90 }
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
    const headers = ["Fecha", "Tipo", "Módulo", "Acción", "Usuario", "Mensaje"];
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString("es-DO"),
      log.type,
      log.module,
      log.action,
      log.userDetails?.name || log.userDetails?.username || "Sistema",
      log.message
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(csvCell).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `logs_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const getTypeIcon = (type) => {
    const icons = {
      error: <XCircle className="w-5 h-5 text-red-500" />,
      warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
      success: <CheckCircle className="w-5 h-5 text-green-500" />,
      info: <Info className="w-5 h-5 text-blue-500" />,
      auth: <User className="w-5 h-5 text-purple-500" />,
      action: <Activity className="w-5 h-5 text-indigo-500" />
    };
    return icons[type] || <AlertCircle className="w-5 h-5 text-gray-500" />;
  };

  const getTypeLabel = (type) => {
    const labels = {
      error: "Error",
      warning: "Advertencia",
      success: "Éxito",
      info: "Información",
      auth: "Autenticación",
      action: "Acción"
    };
    return labels[type] || type;
  };

  const getSeverityBadge = (severity) => {
    const badges = {
      low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badges[severity] || badges.medium}`}>
        {severity}
      </span>
    );
  };

  const getStatusDescription = (code) => {
    if (!code) return "";
    const codes = {
      200: "OK - La solicitud ha tenido éxito",
      201: "Created - La solicitud ha tenido éxito y se ha creado un nuevo recurso",
      204: "No Content - La solicitud se ha completado con éxito pero no hay contenido que devolver",
      400: "Bad Request - El servidor no pudo interpretar la solicitud dada una sintaxis inválida",
      401: "Unauthorized - Es necesario autenticarse para obtener la respuesta solicitada",
      403: "Forbidden - El cliente no posee los permisos necesarios para cierto contenido",
      404: "Not Found - El servidor no pudo encontrar el contenido solicitado",
      500: "Internal Server Error - El servidor ha encontrado una situación que no sabe cómo manejar",
      502: "Bad Gateway - El servidor obtuvo una respuesta inválida",
      503: "Service Unavailable - El servidor no está listo para manejar la petición"
    };
    return codes[code] || "Código de estado HTTP";
  };

  const getStatusColor = (code) => {
    if (!code) return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    const c = parseInt(code);
    if (c >= 200 && c < 300) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (c >= 300 && c < 400) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    if (c >= 400 && c < 500) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    if (c >= 500) return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
  };

  const handleIconHover = (log, event) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    const target = event.currentTarget;
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      setHoverPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height + 5
      });
      setHoveredLog(log);
    }, 300);
  };

  const handleIconLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredLog(null);
  };

  const resetFilters = () => {
    setFilters({
      type: "",
      module: "",
      severity: "",
      isSystemAction: "",
      statusCode: "",
      startDate: "",
      endDate: "",
      page: 1,
      limit: 50
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Sistema de Logs
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Auditoría y seguimiento de actividades del sistema</p>
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

      {stats && stats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Logs (7d)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.reduce((sum, s) => sum + s.count, 0)}
                </p>
              </div>
              <Activity className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Errores</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.reduce((sum, s) => sum + s.errors, 0)}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Módulos Activos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {new Set(stats.map(s => s._id.module)).size}
                </p>
              </div>
              <Box className="w-8 h-8 text-blue-500 dark:text-blue-400" />
            </div>
          </div>

          <div className="card-glass p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Tiempo Promedio</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(stats.reduce((sum, s) => sum + (s.avgDuration || 0), 0) / stats.length).toFixed(0)}ms
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-green-500 dark:text-green-400" />
            </div>
          </div>
        </div>
      )}

      <div className="card-glass p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Filtros</h2>
          <button
            onClick={resetFilters}
            className="ml-auto text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Limpiar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todos los tipos</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="auth">Auth</option>
            <option value="action">Action</option>
          </select>

          <select
            value={filters.module}
            onChange={(e) => setFilters({ ...filters, module: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todos los módulos</option>
            <option value="auth">Auth</option>
            <option value="products">Products</option>
            <option value="sales">Sales</option>
            <option value="returns">Returns</option>
            <option value="customers">Customers</option>
            <option value="suppliers">Suppliers</option>
            <option value="users">Users</option>
            <option value="system">System</option>
          </select>

          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todas las severidades</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={filters.isSystemAction}
            onChange={(e) => setFilters({ ...filters, isSystemAction: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todos los orígenes</option>
            <option value="false">👤 Acciones de Usuario</option>
            <option value="true">⚙️ Acciones del Sistema</option>
          </select>

          <select
            value={filters.statusCode}
            onChange={(e) => setFilters({ ...filters, statusCode: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="">Todos los códigos</option>
            <option value="200">200 OK</option>
            <option value="201">201 Created</option>
            <option value="400">400 Bad Request</option>
            <option value="401">401 Unauthorized</option>
            <option value="403">403 Forbidden</option>
            <option value="404">404 Not Found</option>
            <option value="500">500 Server Error</option>
          </select>

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500 dark:[color-scheme:dark]"
          />

          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500 dark:[color-scheme:dark]"
          />

          <select
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: e.target.value, page: 1 })}
            className="form-input dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:border-indigo-500"
          >
            <option value="25">25 logs</option>
            <option value="50">50 logs</option>
            <option value="100">100 logs</option>
            <option value="200">200 logs</option>
          </select>
        </div>
      </div>

      <div className="card-glass overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center p-12">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No se encontraron logs con los filtros seleccionados</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Fecha/Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Módulo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Acción</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Usuario</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Mensaje</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Severidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-300">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-800">
                      <td className="px-4 py-3">
                        <div
                          className="relative inline-block cursor-help"
                          onMouseEnter={(e) => handleIconHover(log, e)}
                          onMouseLeave={handleIconLeave}
                          title={getTypeLabel(log.type)}
                        >
                          {getTypeIcon(log.type)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {new Date(log.timestamp).toLocaleString("es-DO")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{log.module}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{log.action}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${log.isSystemAction
                              ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                              }`}
                            title={log.isSystemAction ? "Acción del Sistema" : "Acción de Usuario"}
                          >
                            {log.isSystemAction ? "⚙️" : "👤"}
                          </span>
                          <span className="text-sm text-gray-900 dark:text-white">
                            {log.userDetails?.name || log.userDetails?.username || "Sistema"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-md truncate">
                        {log.message}
                      </td>
                      <td className="px-4 py-3">
                        {log.metadata?.statusCode ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-help ${getStatusColor(log.metadata.statusCode)}`}
                            title={getStatusDescription(log.metadata.statusCode)}
                          >
                            {log.metadata.statusCode}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
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

            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Página {pagination.page} de {pagination.pages} ({pagination.total} logs)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    disabled={filters.page === 1}
                    className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
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

      {hoveredLog && createPortal(
        <div
          className="fixed z-[100001] pointer-events-none"
          style={{
            left: `${hoverPosition.x}px`,
            top: `${hoverPosition.y}px`,
            transform: "translateX(-50%)"
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl border-2 border-gray-300 p-4 max-w-md dark:bg-gray-800 dark:border-gray-600">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {getTypeIcon(hoveredLog.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{getTypeLabel(hoveredLog.type)}</h3>
                  {getSeverityBadge(hoveredLog.severity)}
                </div>
                <div className="space-y-1 text-xs">
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Módulo:</span> {hoveredLog.module}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Acción:</span> {hoveredLog.action}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Usuario:</span> {hoveredLog.userDetails?.name || hoveredLog.userDetails?.username || "Sistema"}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Fecha:</span> {new Date(hoveredLog.timestamp).toLocaleString("es-DO")}
                  </p>
                  <p className="text-gray-700 mt-2 break-words dark:text-gray-200">
                    <span className="font-medium">Mensaje:</span> {hoveredLog.message}
                  </p>
                  {hoveredLog.request?.ip && (
                    <p className="text-gray-600 mt-2 dark:text-gray-300">
                      <span className="font-medium">IP:</span> {hoveredLog.request.ip}
                    </p>
                  )}
                </div>
                <p className="text-xs text-indigo-600 mt-2 italic font-medium dark:text-indigo-400">💡 Click en el ícono de ojo para ver todos los detalles</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedLog && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100000]">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Detalles del Log</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Tipo</label>
                  <div className="flex items-center gap-2 mt-1">
                    {getTypeIcon(selectedLog.type)}
                    <span className="font-medium text-gray-900 dark:text-white">{getTypeLabel(selectedLog.type)}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Severidad</label>
                  <div className="mt-1">
                    {getSeverityBadge(selectedLog.severity)}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Módulo</label>
                  <p className="mt-1 font-medium text-gray-900 dark:text-white">{selectedLog.module}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Acción</label>
                  <p className="mt-1 font-medium text-gray-900 dark:text-white">{selectedLog.action}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Fecha/Hora</label>
                  <p className="mt-1 text-gray-900 dark:text-white">{new Date(selectedLog.timestamp).toLocaleString("es-DO")}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Usuario</label>
                  <p className="mt-1 text-gray-900 dark:text-white">{selectedLog.userDetails?.name || selectedLog.userDetails?.username || "Sistema"}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Mensaje</label>
                <p className="mt-1 bg-gray-50 dark:bg-gray-800 p-3 rounded text-gray-900 dark:text-white">{selectedLog.message}</p>
              </div>

              {selectedLog.request && Object.keys(selectedLog.request).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Información de la Petición</label>
                  <pre className="mt-1 bg-gray-50 dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto text-gray-900 dark:text-white">
                    {JSON.stringify(selectedLog.request, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Detalles</label>
                  <pre className="mt-1 bg-gray-50 dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto text-gray-900 dark:text-white">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Cambios Realizados</label>
                  <div className="mt-1 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Antes</p>
                      <pre className="bg-red-50 dark:bg-red-900/20 p-3 rounded text-xs overflow-x-auto text-gray-900 dark:text-white">
                        {JSON.stringify(selectedLog.changes.before, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Después</p>
                      <pre className="bg-green-50 dark:bg-green-900/20 p-3 rounded text-xs overflow-x-auto text-gray-900 dark:text-white">
                        {JSON.stringify(selectedLog.changes.after, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {selectedLog.error && (
                <div>
                  <label className="text-sm font-medium text-red-600">Error</label>
                  <div className="mt-1 bg-red-50 p-3 rounded dark:bg-red-900/20">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">{selectedLog.error.message}</p>
                    {selectedLog.error.stack && (
                      <pre className="mt-2 text-xs text-red-700 overflow-x-auto dark:text-red-300">
                        {selectedLog.error.stack}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Metadata</label>
                  <div className="mt-1 grid grid-cols-3 gap-4">
                    {selectedLog.metadata.duration && (
                      <div className="bg-gray-50 p-3 rounded dark:bg-gray-800">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Duración</p>
                        <p className="font-medium dark:text-white">{selectedLog.metadata.duration}ms</p>
                      </div>
                    )}
                    {selectedLog.metadata.statusCode && (
                      <div className="bg-gray-50 p-3 rounded dark:bg-gray-800">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Código HTTP</p>
                        <p className="font-medium dark:text-white">{selectedLog.metadata.statusCode}</p>
                      </div>
                    )}
                    {selectedLog.metadata.success !== undefined && (
                      <div className="bg-gray-50 p-3 rounded dark:bg-gray-800">
                        <p className="text-xs text-gray-600 dark:text-gray-400">Estado</p>
                        <p className="font-medium dark:text-white">
                          {selectedLog.metadata.success ? "✅ Exitoso" : "❌ Fallido"}
                        </p>
                      </div>
                    )}
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default Logs;
