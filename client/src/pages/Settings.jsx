/**
 * @file Settings.jsx
 * @description Página de configuración global (solo admin)
 * 
 * Responsabilidades:
 * - Cargar y actualizar configuración del sistema
 * - Organizar settings en 5 secciones (tabs):
 *   1. Negocio: Información de la empresa
 *   2. Sistema: Configuraciones generales
 *   3. Notificaciones: Alertas y notificaciones
 *   4. Facturación: Configuración fiscal
 *   5. Integraciones: APIs externas (clima)
 * 
 * Props:
 * - section: 'all' | 'business' | 'system' | 'notifications' | 'billing' | 'integrations'
 *   (por defecto 'all' muestra todas las secciones)
 * 
 * Estados:
 * - formData: Objeto con todos los campos de configuración
 * - isLoading: Boolean durante fetch inicial
 * - isSaving: Boolean durante guardado
 * - hasChanges: Boolean si hay cambios sin guardar
 * - showTooltip: String del tooltip activo
 * 
 * Secciones de Configuración:
 * 
 * 1. **Negocio** (Business):
 *    - businessName: Nombre del negocio
 *    - businessLogoUrl: URL del logo
 *    - businessAddress: Dirección
 *    - businessPhone: Teléfono
 *    - businessEmail: Email
 * 
 * 2. **Sistema** (System):
 *    - currency: Moneda (DOP, USD, EUR)
 *    - receiptFooter: Mensaje al pie de recibos
 *    - toastPosition: Posición de notificaciones
 * 
 * 3. **Notificaciones** (Notifications):
 *    - lowStockAlert: Activar alertas de stock bajo
 *    - autoCreatePurchaseOrders: Crear órdenes automáticamente
 *    - autoOrderThreshold: Umbral para órdenes automáticas
 * 
 * 4. **Facturación** (Billing):
 *    - taxRate: Tasa de impuesto (%)
 *    - fiscalPrinterEnabled: Usar impresora fiscal
 *    - rnc: RNC de la empresa
 * 
 * 5. **Integraciones** (Integrations):
 *    - showWeather: Mostrar widget de clima
 *    - weatherLocation: Ubicación para clima
 *    - weatherApiKey: API key de OpenWeatherMap
 * 
 * APIs:
 * - GET /api/settings (cargar configuración)
 * - PUT /api/settings (guardar cambios, solo admin)
 * 
 * Validaciones:
 * - taxRate: 0-100
 * - autoOrderThreshold: > 0
 * - URLs y emails con formato válido
 * 
 * UI Features:
 * - Tabs de navegación entre secciones
 * - Indicador de cambios sin guardar
 * - Botón de guardar con loader
 * - Skeleton loader durante carga
 * - Tooltips informativos
 * - Toggle para password (weatherApiKey)
 * - Confirmación antes de salir si hay cambios
 * 
 * Nota:
 * - Los cambios se aplican globalmente en settingsStore
 * - Frontend recarga settings al guardar
 */

import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  getSettings,
  updateSettings,
  exportSystemData,
  importSystemData,
  cleanTestData,
  getNotificationPreferences,
  updateNotificationPreferences
} from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import { SettingsSkeleton } from '../components/SkeletonLoader';
import WeatherWidget from '../components/WeatherWidget';
import {
  Save,
  Building2,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  FileText,
  Image,
  AlertCircle,
  Check,
  Info,
  Settings as SettingsIcon,
  Store,
  Package,
  Receipt,
  Bell,
  X,
  Eye,
  EyeOff,
  Globe,
  CreditCard,
  Cloud,
  Send,
  Download,
  Upload,
  Trash2,
  Database,
  FileDown,
  FileUp,
  Gift,
} from 'lucide-react';

const Settings = ({ section = 'all' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { setSettings: updateSettingsStore } = useSettingsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showTooltip, setShowTooltip] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showCleanConfirmModal, setShowCleanConfirmModal] = useState(false);
  const [cleanConfirmText, setCleanConfirmText] = useState('');
  const [importMode, setImportMode] = useState('merge');
  const [notificationPrefs, setNotificationPrefs] = useState({
    lowStockAlerts: true,
    expirationAlerts: true,
    salesAlerts: true,
    paymentReminders: true
  });
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    businessName: '',
    businessLogoUrl: '',
    businessAddress: '',
    businessPhone: '',
    businessEmail: '',
    smtp: {
      enabled: true,
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: '',
      password: '',
      fromName: '',
      fromEmail: ''
    },
    taxRate: 0,
    currency: 'DOP',
    receiptFooter: '',
    lowStockAlert: true,
    weatherLocation: 'Santo Domingo,DO',
    weatherApiKey: '',
    showWeather: true,
    autoCreatePurchaseOrders: false,
    requireOrderReception: true,
    autoOrderThreshold: 5,
    toastPosition: 'top-center',
    logRetention: {
      info: 7,
      warning: 30,
      error: 90,
      critical: 180
    }
  });

  const [originalData, setOriginalData] = useState({});
  const [autoSaveTimeout, setAutoSaveTimeout] = useState(null);
  const smtpEnabled = formData.smtp?.enabled !== false;
  const isAdminUser = user?.role === 'admin';
  const isDeveloper = user?.role === 'desarrollador' || user?.role === 'developer';
  const canManageSettings = ['admin', 'desarrollador'].includes(user?.role);

  useEffect(() => {
    fetchSettings();
    fetchNotificationPreferences();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await getSettings();

      const smtpDefaults = {
        enabled: true,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        user: '',
        password: '',
        fromName: '',
        fromEmail: ''
      };

      // Asegurar que smtp existe con valores por defecto si no viene del backend
      const settingsData = {
        ...response.data,
        smtp: {
          ...smtpDefaults,
          ...(response.data.smtp || {})
        },
        logRetention: {
          info: 7,
          warning: 30,
          error: 90,
          critical: 180,
          ...(response.data.logRetention || {})
        }
      };

      if (settingsData.requireOrderReception === undefined) {
        settingsData.requireOrderReception = true;
      }

      setFormData(settingsData);
      setOriginalData(settingsData);
      // Actualizar store solo al cargar configuración
      updateSettingsStore(settingsData);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Error al cargar la configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const [failedSettings, setFailedSettings] = useState(null);
  const persistSettings = async () => {
    const submitted = formData;
    let saved;
    try {
      ({ data: saved } = await updateSettings(submitted));
      setFailedSettings(null);
    } catch (error) {
      setFailedSettings(JSON.stringify(submitted));
      throw error;
    }
    const merge = (current, sent, result) => {
      const merged = { ...result };
      for (const [key, value] of Object.entries(current)) {
        if (JSON.stringify(value) === JSON.stringify(sent?.[key])) continue;
        merged[key] = value && typeof value === 'object' && !Array.isArray(value)
          ? merge(value, sent?.[key], result?.[key]) : value;
      }
      return merged;
    };
    setOriginalData(saved);
    setFormData(current => merge(current, submitted, saved));
    updateSettingsStore(saved);
    setHasChanges(false);
  };

  // Auto-guardar cuando cambia formData
  useEffect(() => {
    // No auto-guardar en la carga inicial
    if (Object.keys(originalData).length === 0 || isSaving || testingEmail) return;

    if (failedSettings === JSON.stringify(formData)) return;
    // Verificar si hay cambios reales
    const hasRealChanges = JSON.stringify(formData) !== JSON.stringify(originalData);
    if (!hasRealChanges) {
      setHasChanges(false);
      return;
    }

    // Limpiar timeout anterior
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    // Configurar nuevo timeout para auto-guardar después de 300ms (casi instantáneo)
    const timeout = setTimeout(() => {
      autoSaveSettings();
    }, 300);

    setAutoSaveTimeout(timeout);

    // Cleanup
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [formData, originalData, isSaving, testingEmail, failedSettings]);

  const autoSaveSettings = async () => {
    // Validaciones
    if (!formData.businessName.trim()) {
      toast.error('El nombre del negocio es requerido');
      return;
    }

    if (formData.taxRate < 0 || formData.taxRate > 100) {
      toast.error('La tasa de impuesto debe estar entre 0 y 100');
      return;
    }

    try {
      setIsSaving(true);
      await persistSettings();
      toast.success('✨ Guardado', {
        duration: 1500,
        icon: '💾',
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    setHasChanges(true);

    // Debug: Update store immediately for visual feedback
    if (field === 'forceChristmas') {
      updateSettingsStore({ ...newData, weatherApiKey: '', smtp: { ...newData.smtp, password: '' } });
    }
  };

  const handleSmtpChange = (field, value) => {
    setFormData({
      ...formData,
      smtp: { ...formData.smtp, [field]: value }
    });
    setHasChanges(true);
  };

  const toggleSmtpEnabled = () => {
    if (!canManageSettings) return;
    handleSmtpChange('enabled', !smtpEnabled);
  };

  const fetchNotificationPreferences = async () => {
    try {
      const response = await getNotificationPreferences();
      if (response.data?.data) {
        setNotificationPrefs(response.data.data);
      }
    } catch (error) {
      console.error('Error al cargar preferencias de notificaciones:', error);
    }
  };

  const handleNotificationPrefChange = async (key, value) => {
    try {
      const newPrefs = { ...notificationPrefs, [key]: value };
      setNotificationPrefs(newPrefs);

      await updateNotificationPreferences(newPrefs);
      toast.success('Preferencia actualizada', { duration: 1500 });
    } catch (error) {
      console.error('Error al actualizar preferencia:', error);
      toast.error('Error al actualizar preferencia');
      // Revertir cambio en caso de error
      setNotificationPrefs(notificationPrefs);
    }
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      toast.loading('Exportando datos...', { id: 'export' });

      const response = await exportSystemData();
      const data = response.data;

      // Crear blob y descargar
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sgtm-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`✅ Datos exportados: ${data.metadata.totalRecords.products} productos, ${data.metadata.totalRecords.sales} ventas`, { id: 'export' });
    } catch (error) {
      console.error('Error al exportar datos:', error);
      toast.error('Error al exportar datos', { id: 'export' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      toast.loading('Importando datos...', { id: 'import' });

      // Leer archivo
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validar estructura básica
      if (!importData.metadata || !importData.data) {
        throw new Error('Archivo inválido: estructura incorrecta');
      }

      // Confirmar importación
      const confirmMsg = importMode === 'replace'
        ? '⚠️ MODO REEMPLAZAR: Se eliminarán datos existentes. ¿Continuar?'
        : '¿Importar datos en modo COMBINAR?';

      if (!window.confirm(confirmMsg)) {
        toast.dismiss('import');
        setIsImporting(false);
        return;
      }

      // Ejecutar importación
      const response = await importSystemData(importData, importMode);

      if (response.data.success) {
        toast.success(`✅ ${response.data.message}`, { id: 'import', duration: 4000 });

        // Recargar configuración
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(`⚠️ ${response.data.message}`, { id: 'import', duration: 4000 });
      }
    } catch (error) {
      console.error('Error al importar datos:', error);
      toast.error(error.message || 'Error al importar datos', { id: 'import' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCleanTestData = async () => {
    if (cleanConfirmText !== 'ELIMINAR DATOS DE PRUEBA') {
      toast.error('Debe escribir exactamente: ELIMINAR DATOS DE PRUEBA');
      return;
    }

    try {
      setIsCleaning(true);
      toast.loading('Limpiando datos de prueba...', { id: 'clean' });

      const response = await cleanTestData(cleanConfirmText);

      if (response.data.success) {
        const { deleted } = response.data;
        const summary = Object.entries(deleted)
          .filter(([_, count]) => count > 0)
          .map(([key, count]) => `${count} ${key}`)
          .join(', ');

        toast.success(`✅ ${response.data.message}\nEliminados: ${summary || 'ninguno'}`, { id: 'clean', duration: 5000 });
        setShowCleanConfirmModal(false);
        setCleanConfirmText('');

        // Recargar después de 2 segundos
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        toast.error(response.data.message, { id: 'clean' });
      }
    } catch (error) {
      console.error('Error al limpiar datos:', error);
      toast.error('Error al limpiar datos de prueba', { id: 'clean' });
    } finally {
      setIsCleaning(false);
    }
  };

  const [isCleaningLogs, setIsCleaningLogs] = useState(false);
  const [showLogCleanModal, setShowLogCleanModal] = useState(false);
  const [logCleanFilters, setLogCleanFilters] = useState({
    type: 'all',
    severity: 'all',
    days: ''
  });

  const handleCleanLogs = async () => {
    try {
      setIsCleaningLogs(true);
      toast.loading('Limpiando logs...', { id: 'clean-logs' });

      const response = await fetch('/api/logs/clean', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...logCleanFilters,
          all: logCleanFilters.type === 'all' && logCleanFilters.severity === 'all' && !logCleanFilters.days
        })
      });

      // Check if response has content before parsing JSON
      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Response is not JSON, might be an error from a proxy or auth issue
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Respuesta inválida del servidor. Verifica tu conexión y autenticación.');
      }

      if (response.ok) {
        toast.success(`✅ ${data.message}`, { id: 'clean-logs' });
        setShowLogCleanModal(false);
      } else {
        throw new Error(data.message || 'Error al limpiar logs');
      }
    } catch (error) {
      console.error('Error al limpiar logs:', error);
      toast.error(error.message || 'Error al limpiar logs', { id: 'clean-logs' });
    } finally {
      setIsCleaningLogs(false);
    }
  };

  const handleTestEmail = async () => {
    if (isSaving || testingEmail) return;
    if (!smtpEnabled) {
      toast.error('Activa el envío de correos para probar la conexión.');
      return;
    }

    try {
      setTestingEmail(true);

      // Primero guardar si hay cambios pendientes
      if (hasChanges) {
        toast.loading('Guardando configuración...', { id: 'saving-smtp' });
        await persistSettings();
        toast.dismiss('saving-smtp');
      }

      // Luego probar conexión
      const response = await fetch('/api/settings/smtp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        toast.success('✅ Configuración SMTP correcta. El email se puede enviar.');
      } else {
        toast.error(`❌ ${data.message || 'Error al probar conexión'}`);
      }
    } catch (error) {
      console.error('Error al probar conexión SMTP:', error);
      toast.error('Error al probar conexión SMTP');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Ya no es necesario guardar manualmente, el auto-guardado lo maneja
    // Este método solo previene el envío del formulario
  };

  const formatPhone = (value) => {
    // Formato: XXX-XXX-XXXX
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      const formatted = [match[1], match[2], match[3]].filter(Boolean).join('-');
      return formatted;
    }
    return value;
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  // Tabs de secciones
  const tabs = [
    { id: 'business', label: 'Negocio', icon: Building2, path: '/configuracion/negocio' },
    { id: 'system', label: 'Sistema', icon: Globe, path: '/configuracion/sistema' },
    { id: 'notifications', label: 'Notificaciones', icon: Bell, path: '/configuracion/notificaciones' },
    { id: 'billing', label: 'Facturación', icon: CreditCard, path: '/configuracion/facturacion' },
    { id: 'integrations', label: 'Integraciones', icon: Cloud, path: '/configuracion/integraciones' },
  ].filter(tab => !tab.developerOnly || isDeveloper);

  // Función para verificar si una sección debe mostrarse
  const shouldShowSection = (sectionId) => {
    // Removed system section blocking - admins can see Sistema section
    // They just won't see developer-specific features (Log Management, Data Export)
    if (section === 'all') return true;
    return section === sectionId;
  };


  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Configuración</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Administra la configuración general del sistema
          </p>
        </div>
        {canManageSettings && (
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                    Guardando...
                  </span>
                </>
              ) : hasChanges ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                    Guardando en 0.3s...
                  </span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                    ✨ Todo guardado
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabs de Navegación */}
      {section !== 'all' && (
        <div className="card-glass overflow-x-auto">
          <div className="flex gap-2 p-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.id}
                to={tab.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap ${isActive
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`
                }
              >
                <tab.icon className="w-4 h-4" />
                <span className="font-medium text-sm">{tab.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Alert for non-admin users */}
      {!canManageSettings && (
        <div className="card-glass p-4 border-l-4 border-yellow-500">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <p className="text-gray-700 dark:text-gray-300">
              Solo administradores o desarrolladores pueden modificar la configuración del sistema.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Information */}
        {shouldShowSection('business') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Información del Negocio
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Datos generales de la empresa
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Business Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nombre del Negocio *
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => handleChange('businessName', e.target.value)}
                  disabled={!canManageSettings}
                  className="input"
                  placeholder="MECANET"
                  required
                />
              </div>

              {/* Business Logo URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL del Logo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.businessLogoUrl}
                    onChange={(e) => handleChange('businessLogoUrl', e.target.value)}
                    disabled={!canManageSettings}
                    className="input flex-1"
                    placeholder="/logo.png"
                  />
                  <div className="relative">
                    <Info
                      className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help mt-3"
                      onMouseEnter={() => setShowTooltip('logo')}
                      onMouseLeave={() => setShowTooltip(null)}
                    />
                    {showTooltip === 'logo' && (
                      <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                        URL de la imagen del logo. Aparecerá en reportes y recibos impresos.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Business Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Teléfono
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.businessPhone}
                    onChange={(e) => handleChange('businessPhone', formatPhone(e.target.value))}
                    disabled={!canManageSettings}
                    className="input pl-10"
                    placeholder="809-555-1234"
                    maxLength={12}
                  />
                </div>
              </div>

              {/* Business Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.businessEmail}
                    onChange={(e) => handleChange('businessEmail', e.target.value)}
                    disabled={!canManageSettings}
                    className="input pl-10"
                    placeholder="contacto@autoparts.com"
                  />
                </div>
              </div>

              {/* Business Address */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dirección
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    value={formData.businessAddress}
                    onChange={(e) => handleChange('businessAddress', e.target.value)}
                    disabled={!canManageSettings}
                    className="input pl-10 min-h-[80px]"
                    placeholder="Calle Principal #123, Santo Domingo, República Dominicana"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email/SMTP Configuration */}
        {shouldShowSection('business') && (
          <div className="card-glass p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Configuración de Email (SMTP)
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configura el servidor SMTP para enviar órdenes de compra
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${smtpEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {smtpEnabled ? 'Emails activados' : 'Emails desactivados'}
                  </span>
                  <button
                    type="button"
                    onClick={toggleSmtpEnabled}
                    disabled={!canManageSettings}
                    aria-pressed={smtpEnabled}
                    className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors ${smtpEnabled ? 'bg-green-500' : 'bg-gray-400'} ${!canManageSettings ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${smtpEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
                <button
                  onClick={handleTestEmail}
                  disabled={testingEmail || !canManageSettings || !smtpEnabled}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  {testingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      Probando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Probar Conexión
                    </>
                  )}
                </button>
              </div>
            </div>

            {!smtpEnabled && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold">El envío de correos está desactivado.</p>
                  <p className="text-xs">No podrás enviar órdenes de compra ni probar la conexión hasta activarlo nuevamente.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SMTP Host */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Servidor SMTP
                </label>
                <input
                  type="text"
                  value={formData.smtp?.host || ''}
                  onChange={(e) => handleSmtpChange('host', e.target.value)}
                  disabled={!canManageSettings || !smtpEnabled}
                  className="input"
                  placeholder="smtp.gmail.com"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Gmail: smtp.gmail.com | Outlook: smtp.office365.com
                </p>
              </div>

              {/* SMTP Port */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Puerto SMTP
                </label>
                <input
                  type="number"
                  value={formData.smtp?.port || 587}
                  onChange={(e) => handleSmtpChange('port', parseInt(e.target.value))}
                  disabled={!canManageSettings || !smtpEnabled}
                  className="input"
                  placeholder="587"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  TLS: 587 | SSL: 465
                </p>
              </div>

              {/* SMTP User */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Usuario / Email
                </label>
                <input
                  type="email"
                  value={formData.smtp?.user || ''}
                  onChange={(e) => handleSmtpChange('user', e.target.value)}
                  disabled={!canManageSettings || !smtpEnabled}
                  className="input"
                  placeholder="tu-email@gmail.com"
                />
              </div>

              {/* SMTP Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contraseña de Aplicación
                </label>
                <div className="relative">
                  <input
                    type={showSmtpPassword ? "text" : "password"}
                    value={formData.smtp?.password || ''}
                    onChange={(e) => handleSmtpChange('password', e.target.value)}
                    disabled={!canManageSettings || !smtpEnabled}
                    className="input pr-10"
                    placeholder="Escribe aquí la contraseña de 16 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showSmtpPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <strong>Gmail:</strong> Genera una contraseña de aplicación de 16 caracteres. Se guarda automáticamente al escribir.
                </p>
              </div>

              {/* From Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nombre del Remitente
                </label>
                <input
                  type="text"
                  value={formData.smtp?.fromName || ''}
                  onChange={(e) => handleSmtpChange('fromName', e.target.value)}
                  disabled={!canManageSettings || !smtpEnabled}
                  className="input"
                  placeholder="Mi Negocio"
                />
              </div>

              {/* From Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email del Remitente
                </label>
                <input
                  type="email"
                  value={formData.smtp?.fromEmail || ''}
                  onChange={(e) => handleSmtpChange('fromEmail', e.target.value)}
                  disabled={!canManageSettings || !smtpEnabled}
                  className="input"
                  placeholder="noreply@minegocio.com"
                />
              </div>

              {/* Info Box */}
              <div className="md:col-span-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-semibold mb-1">📧 Cómo configurar Gmail:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                      <li>Ve a tu cuenta de Google → Seguridad</li>
                      <li>Activa la verificación en 2 pasos</li>
                      <li>En "Contraseñas de aplicaciones", genera una nueva</li>
                      <li>Copia la contraseña de 16 caracteres y pégala aquí</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Financial Settings */}
        {shouldShowSection('system') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Configuración Financiera
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Impuestos y moneda
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tax Rate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tasa de Impuesto (%)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={formData.taxRate}
                    onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
                    disabled={!canManageSettings}
                    className="input"
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                  <div className="relative">
                    <Info
                      className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help mt-3"
                      onMouseEnter={() => setShowTooltip('tax')}
                      onMouseLeave={() => setShowTooltip(null)}
                    />
                    {showTooltip === 'tax' && (
                      <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-50">
                        Porcentaje de impuesto (ITBIS) que se aplicará a las ventas. Ejemplo: 18 para 18%
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {formData.taxRate > 0 ? `Se aplicará ${formData.taxRate}% de impuesto a las ventas` : 'Sin impuestos'}
                </p>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Moneda
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  disabled={!canManageSettings}
                  className="input"
                >
                  <option value="DOP">Peso Dominicano (DOP)</option>
                  <option value="USD">Dólar Estadounidense (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Receipt Settings */}
        {shouldShowSection('billing') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Configuración de Recibos
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Personaliza los recibos impresos
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Mensaje de Pie de Recibo
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <textarea
                  value={formData.receiptFooter}
                  onChange={(e) => handleChange('receiptFooter', e.target.value)}
                  disabled={!canManageSettings}
                  className="input pl-10 min-h-[100px]"
                  placeholder="¡Gracias por su compra! Esperamos verle pronto."
                  rows={4}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Este mensaje aparecerá al final de cada recibo impreso
              </p>
            </div>
          </div>
        )}

        {/* Mis Preferencias de Notificaciones */}
        {shouldShowSection('notifications') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Mis Preferencias de Notificaciones
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Elige qué alertas deseas recibir
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Low Stock Alerts */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Alertas de Stock Bajo
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Notificaciones cuando productos estén por agotarse
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationPrefs.lowStockAlerts}
                    onChange={(e) => handleNotificationPrefChange('lowStockAlerts', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {/* Expiration Alerts */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Alertas de Vencimiento
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Notificaciones sobre productos próximos a vencer
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationPrefs.expirationAlerts}
                    onChange={(e) => handleNotificationPrefChange('expirationAlerts', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {/* Sales Alerts */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Alertas de Ventas
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Notificaciones sobre ventas importantes o hitos
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationPrefs.salesAlerts}
                    onChange={(e) => handleNotificationPrefChange('salesAlerts', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {/* Payment Reminders */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Recordatorios de Pagos
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Notificaciones sobre pagos pendientes o vencidos
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationPrefs.paymentReminders}
                    onChange={(e) => handleNotificationPrefChange('paymentReminders', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Purchase Orders Automation */}
        {shouldShowSection('system') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Órdenes de Compra Automáticas
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configuración de generación automática de órdenes
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Toggle Órdenes Automáticas */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Generación Automática de Órdenes
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Crear órdenes de compra automáticamente cuando el stock sea bajo
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.autoCreatePurchaseOrders}
                    onChange={(e) => handleChange('autoCreatePurchaseOrders', e.target.checked)}
                    disabled={!canManageSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {/* Umbral de Stock */}
              {formData.autoCreatePurchaseOrders && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Umbral de Stock para Orden Automática
                  </label>
                  <input
                    type="number"
                    value={formData.autoOrderThreshold}
                    onChange={(e) => handleChange('autoOrderThreshold', parseInt(e.target.value) || 0)}
                    disabled={!canManageSettings}
                    className="input"
                    placeholder="5"
                    min="0"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Se creará una orden automática cuando el stock llegue a este nivel
                  </p>
                  <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs text-indigo-800 dark:text-indigo-300">
                      <strong>💡 Ejemplo:</strong> Si estableces el umbral en 5, cuando un producto tenga 5 unidades o menos, el sistema generará automáticamente una orden de compra al proveedor asignado.
                    </p>
                  </div>
                </div>
              )}

              {/* Información adicional */}
              {!formData.autoCreatePurchaseOrders && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <strong>ℹ️ Nota:</strong> La generación automática de órdenes está desactivada. Las órdenes de compra deberán crearse manualmente desde el módulo de Órdenes de Compra.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {shouldShowSection('system') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Recepción de Órdenes
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Habilita o deshabilita el proceso formal de recepción
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Requerir confirmación de recepción
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Si lo desactivas, las órdenes podrán completarse sin capturar cantidades recibidas ni fecha de recepción.
                </p>
              </div>
              <label className={`relative inline-flex items-center cursor-pointer ${!canManageSettings ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={formData.requireOrderReception}
                  onChange={(e) => handleChange('requireOrderReception', e.target.checked)}
                  disabled={!canManageSettings}
                />
                <div className="w-12 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                  {formData.requireOrderReception ? 'Activado' : 'Desactivado'}
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Debug: Christmas Theme (Developer Only) */}
        {user?.role === 'desarrollador' && shouldShowSection('system') && (
          <div className="card-glass p-6 border-2 border-red-200 dark:border-red-900/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Gift className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Modo Navideño (Debug)
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Forzar la activación del tema navideño
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Activar Easter Egg Navideño
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Muestra nieve y fondo de Santa Claus sin importar la fecha
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={formData.forceChristmas || false}
                  onChange={(e) => handleChange('forceChristmas', e.target.checked)}
                  disabled={!canManageSettings}
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
              </label>
            </div>
          </div>
        )}

        {/* Weather Settings */}
        {shouldShowSection('integrations') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Widget de Clima
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Muestra el clima en la barra superior
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Mostrar Widget */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Mostrar Widget de Clima
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Activa/desactiva la visualización del clima
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showWeather}
                    onChange={(e) => handleChange('showWeather', e.target.checked)}
                    disabled={!canManageSettings}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                </label>
              </div>

              {/* Ubicación */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ubicación (Ciudad, Código de País)
                </label>
                <input
                  type="text"
                  value={formData.weatherLocation}
                  onChange={(e) => handleChange('weatherLocation', e.target.value)}
                  disabled={!canManageSettings}
                  className="input"
                  placeholder="Santo Domingo,DO"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Formato: Ciudad,CódigoPaís (ej: Santo Domingo,DO | Santiago,DO | New York,US)
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  API Key de OpenWeatherMap
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={formData.weatherApiKey}
                    onChange={(e) => handleChange('weatherApiKey', e.target.value)}
                    disabled={!canManageSettings}
                    className="input pr-12"
                    placeholder={formData.weatherApiKeyConfigured ? "Clave guardada; deje vacío para conservarla" : "Ingresa tu API key"}
                  />
                  {formData.weatherApiKey && (
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
                      title={showApiKey ? "Ocultar API key" : "Mostrar API key"}
                    >
                      {showApiKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-300 mb-2">
                    <strong>📌 Cómo obtener tu API Key gratuita:</strong>
                  </p>
                  <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
                    <li>Ve a <a href="https://openweathermap.org/api" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900 dark:hover:text-blue-200">openweathermap.org/api</a></li>
                    <li>Crea una cuenta gratuita</li>
                    <li>Genera tu API key en la sección "API keys"</li>
                    <li>Copia y pega la key aquí</li>
                  </ol>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    ⚡ El plan gratuito incluye 1,000 llamadas diarias (suficiente para este sistema)
                  </p>
                </div>
              </div>

              {/* Vista Previa del Widget de Clima */}
              {formData.showWeather && formData.weatherLocation && formData.weatherApiKeyConfigured && (
                <div className="mt-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border-2 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Vista Previa del Widget
                    </h3>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
                    <WeatherWidget
                      location={formData.weatherLocation}
                      configured={formData.weatherApiKeyConfigured}
                      detailed={true}
                    />
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Este es el widget que se mostrará en la barra superior del sistema
                  </p>
                </div>
              )}

              {/* Mensaje si el widget está desactivado */}
              {!formData.showWeather && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    El widget de clima está desactivado. Actívalo arriba para ver la vista previa.
                  </p>
                </div>
              )}

              {/* Mensaje si falta configuración */}
              {formData.showWeather && (!formData.weatherLocation || !formData.weatherApiKeyConfigured) && (
                <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-800 dark:text-orange-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Guarda la ubicación y la clave para consultar el clima.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toast Notifications Settings */}
        {shouldShowSection('notifications') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Notificaciones
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configura la posición de las notificaciones en pantalla
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Toast Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Posición de las Notificaciones
                </label>

                {/* Visual Grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { value: 'top-left', label: 'Arriba Izquierda', icon: '↖' },
                    { value: 'top-center', label: 'Arriba Centro', icon: '↑' },
                    { value: 'top-right', label: 'Arriba Derecha', icon: '↗' },
                    { value: 'bottom-left', label: 'Abajo Izquierda', icon: '↙' },
                    { value: 'bottom-center', label: 'Abajo Centro', icon: '↓' },
                    { value: 'bottom-right', label: 'Abajo Derecha', icon: '↘' },
                  ].map((position) => (
                    <button
                      key={position.value}
                      type="button"
                      onClick={() => handleChange('toastPosition', position.value)}
                      disabled={!canManageSettings}
                      className={`
                      relative p-4 rounded-xl border-2 transition-all duration-200
                      ${formData.toastPosition === position.value
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                          : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                        }
                      ${!canManageSettings ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">{position.icon}</div>
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {position.label}
                        </div>
                      </div>
                      {formData.toastPosition === position.value && (
                        <div className="absolute top-2 right-2">
                          <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Test Button */}
                <button
                  type="button"
                  onClick={() => toast.success('¡Notificación de prueba! 🎉')}
                  className="w-full btn btn-secondary flex items-center justify-center gap-2"
                >
                  <Bell className="w-4 h-4" />
                  Probar Notificación
                </button>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  💡 Haz clic en "Probar Notificación" para ver cómo se verá en la posición seleccionada
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Data Management Section - Export/Import/Clean */}
        {(section === 'all' || section === 'system') && isDeveloper && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                <Database className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Gestión de Datos
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Exportar, importar y limpiar datos del sistema
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Export Data */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileDown className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Exportar Datos
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Descarga todos los datos del sistema en formato JSON
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="btn btn-success w-full flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Exportar Datos
                    </>
                  )}
                </button>
                <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                  💾 Incluye: productos, ventas, clientes, proveedores, órdenes y configuración
                </p>
              </div>

              {/* Import Data */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Importar Datos
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Restaura datos desde un archivo JSON exportado
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Modo de Importación
                  </label>
                  <select
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value)}
                    className="input mb-2"
                  >
                    <option value="merge">Combinar (mantener datos existentes)</option>
                    <option value="replace">Reemplazar (eliminar datos existentes)</option>
                  </select>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    {importMode === 'merge'
                      ? '✓ Los datos se combinarán con los existentes'
                      : '⚠️ Se eliminarán los datos existentes antes de importar'}
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="hidden"
                  id="import-file-input"
                />
                <label
                  htmlFor="import-file-input"
                  className={`btn btn-primary w-full flex items-center justify-center gap-2 cursor-pointer ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Seleccionar Archivo JSON
                    </>
                  )}
                </label>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                  📂 Solo archivos JSON exportados desde este sistema
                </p>
              </div>

              {/* Clean Test Data */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Limpiar Datos de Prueba
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Elimina productos, clientes y proveedores de prueba
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCleanConfirmModal(true)}
                  disabled={isCleaning}
                  className="btn btn-danger w-full flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Limpiar Datos de Prueba
                </button>
                <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                  ⚠️ Elimina: productos test, clientes demo, proveedores prueba, órdenes antiguas
                </p>
              </div>

              {/* Warning Box */}
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                      ⚡ Recomendaciones Importantes
                    </p>
                    <ul className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1">
                      <li>• Exporta los datos regularmente como respaldo</li>
                      <li>• Verifica los archivos JSON antes de importar</li>
                      <li>• La limpieza NO elimina usuarios ni ventas históricas</li>
                      <li>• Haz pruebas en modo "Combinar" antes de "Reemplazar"</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Log Management Section */}
        {(section === 'all' || section === 'system') && isDeveloper && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Gestión de Logs
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Configura la retención y limpieza de logs del sistema
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Retention Settings */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                  Retención Automática (Días)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {['info', 'warning', 'error', 'critical'].map((type) => (
                    <div key={type}>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 capitalize">
                        {type}
                      </label>
                      <input
                        type="number"
                        value={formData.logRetention?.[type] || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setFormData(prev => ({
                            ...prev,
                            logRetention: {
                              ...prev.logRetention,
                              [type]: val
                            }
                          }));
                          setHasChanges(true);
                        }}
                        className="input"
                        min="1"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Los logs más antiguos que estos días se eliminarán automáticamente cada 24 horas.
                </p>
              </div>

              {/* Manual Clean Button */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      Limpieza Manual
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Eliminar logs bajo demanda con filtros específicos
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLogCleanModal(true)}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpiar Logs
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clean Confirmation Modal */}
        {showCleanConfirmModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Confirmar Limpieza
                </h3>
              </div>

              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-red-900 dark:text-red-100 mb-2">
                  <strong>⚠️ Esta acción eliminará:</strong>
                </p>
                <ul className="text-sm text-red-800 dark:text-red-200 space-y-1 list-disc list-inside">
                  <li>Productos con "test", "prueba", "demo" en el nombre</li>
                  <li>Clientes y proveedores de prueba</li>
                  <li>Órdenes de compra pendientes antiguas (+6 meses)</li>
                  <li>Retiros de caja rechazados antiguos</li>
                </ul>
                <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                  ✓ NO se eliminarán usuarios, ventas ni configuración
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Escribe exactamente: <strong>ELIMINAR DATOS DE PRUEBA</strong>
                </label>
                <input
                  type="text"
                  value={cleanConfirmText}
                  onChange={(e) => setCleanConfirmText(e.target.value)}
                  className="input"
                  placeholder="ELIMINAR DATOS DE PRUEBA"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCleanConfirmModal(false);
                    setCleanConfirmText('');
                  }}
                  className="btn btn-secondary flex-1"
                  disabled={isCleaning}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCleanTestData}
                  disabled={cleanConfirmText !== 'ELIMINAR DATOS DE PRUEBA' || isCleaning}
                  className="btn btn-danger flex-1 flex items-center justify-center gap-2"
                >
                  {isCleaning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Limpiando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Confirmar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}



        {/* Tema Automático Section */}
        {(section === 'all' || section === 'system') && (
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Tema Automático
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  El tema oscuro se activa automáticamente según la hora del día
                </p>
              </div>
            </div>

            <AutoThemeToggle />
          </div>
        )}

      </form>

      {/* Info Card */}
      {section === 'all' && (
        <div className="card-glass p-4 border-l-4 border-blue-500">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900 dark:text-white mb-1">
                Información Importante
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• Los cambios se aplicarán inmediatamente después de guardar</li>
                <li>• El nombre del negocio aparecerá en todos los reportes y recibos</li>
                <li>• La tasa de impuesto se puede modificar según la legislación vigente</li>
                <li>• El mensaje de pie de recibo admite hasta 500 caracteres</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Preview Card */}
      {(section === 'all' || section === 'business') && (
        <div className="card-glass p-6">
          <div className="flex items-center gap-3 mb-4">
            <Eye className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Vista Previa del Recibo
            </h3>
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 max-w-md mx-auto">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {formData.businessName || 'Nombre del Negocio'}
              </h3>
              {formData.businessAddress && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {formData.businessAddress}
                </p>
              )}
              {(formData.businessPhone || formData.businessEmail) && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {formData.businessPhone && `Tel: ${formData.businessPhone}`}
                  {formData.businessPhone && formData.businessEmail && ' • '}
                  {formData.businessEmail}
                </p>
              )}

              <div className="border-t border-gray-300 dark:border-gray-700 my-4" />

              <div className="text-sm text-gray-500 dark:text-gray-400">
                [Detalles de la venta]
              </div>

              <div className="border-t border-gray-300 dark:border-gray-700 my-4" />

              <p className="text-sm italic text-gray-600 dark:text-gray-400">
                {formData.receiptFooter || '¡Gracias por su compra!'}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Log Clean Modal */}
      {showLogCleanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ zIndex: 9999 }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 relative z-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-slate-600 dark:text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Limpiar Logs
              </h3>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tipo de Log
                </label>
                <select
                  value={logCleanFilters.type}
                  onChange={(e) => setLogCleanFilters({ ...logCleanFilters, type: e.target.value })}
                  className="input"
                >
                  <option value="all">Todos los tipos</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Severidad
                </label>
                <select
                  value={logCleanFilters.severity}
                  onChange={(e) => setLogCleanFilters({ ...logCleanFilters, severity: e.target.value })}
                  className="input"
                >
                  <option value="all">Todas las severidades</option>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Antigüedad (Días)
                </label>
                <input
                  type="number"
                  value={logCleanFilters.days}
                  onChange={(e) => setLogCleanFilters({ ...logCleanFilters, days: e.target.value })}
                  className="input"
                  placeholder="Ej: 30 (dejar vacío para borrar todo)"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se borrarán logs más antiguos que X días. Dejar vacío para borrar sin límite de fecha.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogCleanModal(false)}
                className="btn btn-secondary flex-1"
                disabled={isCleaningLogs}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCleanLogs}
                className="btn btn-danger flex-1 flex items-center justify-center gap-2"
                disabled={isCleaningLogs}
              >
                {isCleaningLogs ? 'Limpiando...' : 'Confirmar Limpieza'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Componente para configurar tema automático
const AutoThemeToggle = () => {
  const { autoThemeEnabled, enableAutoTheme, isDarkMode } = useThemeStore();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hour = currentTime.getHours();
  const shouldBeDark = hour >= 17 || hour < 7;

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Activar Tema Automático
            </h3>
            {autoThemeEnabled && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                Activo
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            El tema cambia automáticamente según la hora del día
          </p>
        </div>
        <button
          type="button"
          onClick={() => enableAutoTheme(!autoThemeEnabled)}
          className={`
            relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300
            ${autoThemeEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}
          `}
        >
          <span
            className={`
              inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-300
              ${autoThemeEnabled ? 'translate-x-7' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {/* Horarios */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h4 className="font-medium text-gray-900 dark:text-white">Tema Claro</h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            7:00 AM - 4:59 PM
          </p>
        </div>

        <div className="p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </div>
            <h4 className="font-medium text-gray-900 dark:text-white">Tema Oscuro</h4>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            5:00 PM - 6:59 AM
          </p>
        </div>
      </div>

      {/* Estado actual */}
      <div className={`p-4 rounded-xl border-2 ${autoThemeEnabled && isDarkMode === shouldBeDark
        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
        : 'border-gray-200 dark:border-gray-700'
        }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Hora actual: {currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {autoThemeEnabled ? (
                <>
                  Tema {shouldBeDark ? 'oscuro' : 'claro'} activado automáticamente
                  {isDarkMode === shouldBeDark ? ' ✓' : ' (cambiando...)'}
                </>
              ) : (
                'Tema manual (automático desactivado)'
              )}
            </p>
          </div>
          {autoThemeEnabled && isDarkMode === shouldBeDark && (
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-1">
              💡 Cómo funciona:
            </p>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• El sistema verifica la hora cada minuto</li>
              <li>• A las 5:00 PM se activa el tema oscuro automáticamente</li>
              <li>• A las 7:00 AM vuelve al tema claro</li>
              <li>• Si cambias el tema manualmente, el modo automático se desactiva</li>
              <li>• Reactiva esta opción para volver al modo automático</li>
            </ul>
          </div>
        </div>
      </div>


    </div >
  );
};

export default Settings;

