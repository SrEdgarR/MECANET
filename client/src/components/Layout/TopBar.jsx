/**
 * @file TopBar.jsx
 * @description Barra superior con widgets, tema y menú de usuario
 * 
 * Responsabilidades:
 * - Mostrar nombre del negocio (businessName desde settings)
 * - ClockWidget: Reloj en tiempo real con fecha
 * - WeatherWidget: Clima actual si está habilitado (settings.showWeather)
 * - Botón de tema: Alternar entre claro/oscuro (toggleTheme)
 * - Menú de usuario: Nombre, email, rol, botón de logout
 * 
 * Menú de Usuario:
 * - Se posiciona con createPortal (render fuera del DOM padre)
 * - Usa menuPosition calculado desde buttonRef.getBoundingClientRect()
 * - Cierra al hacer click fuera (useEffect con evento mousedown)
 * 
 * Estilos:
 * - Glassmorphism (glass-strong)
 * - Animaciones de hover y transiciones suaves
 * - Badge con rol del usuario (admin=rojo, cajero=azul)
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Moon, Sun, LogOut, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { updateProfile } from '../../services/api';
import ClockWidget from '../ClockWidget';
import WeatherWidget from '../WeatherWidget';

const TopBar = () => {
  const navigate = useNavigate();
  const { user, logout, setAuth, updateUser } = useAuthStore();
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [updatingShortcuts, setUpdatingShortcuts] = useState(false);
  const buttonRef = useRef(null);
  const shortcutsActive = user?.shortcutsEnabled !== false;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleToggleMenu = () => {
    if (!showUserMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setShowUserMenu(!showUserMenu);
  };

  const handleShortcutToggle = async () => {
    if (!user) return;
    const nextValue = !shortcutsActive;
    try {
      setUpdatingShortcuts(true);
      const response = await updateProfile({ shortcutsEnabled: nextValue });
      const { token, ...profile } = response.data;
      if (token) {
        setAuth(profile, token);
      } else {
        updateUser(profile);
      }
      toast.success(nextValue ? 'Atajos activados' : 'Atajos desactivados');
    } catch (error) {
      console.error('Error al actualizar atajos:', error);
      const message = error.response?.data?.message || 'No se pudo actualizar la preferencia';
      toast.error(message);
    } finally {
      setUpdatingShortcuts(false);
    }
  };

  return (
    <header className="glass-strong border-b border-gray-200 dark:border-gray-700 px-3 lg:px-6 py-2 lg:py-4">
      <div className="flex items-center justify-between">
        {/* Business Name */}
        <div>
          <h2 className="text-lg lg:text-2xl font-bold text-gray-900 dark:text-white whitespace-nowrap">
            {settings.businessName || 'MECANET'}
          </h2>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-1.5 lg:gap-3">
          {/* Clock Widget */}
          <ClockWidget />
          
          {/* Weather Widget */}
          {settings.showWeather && settings.weatherApiKeyConfigured && (
            <WeatherWidget 
              location={settings.weatherLocation || 'Santo Domingo,DO'}
              configured={settings.weatherApiKeyConfigured}
            />
          )}
          
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 lg:p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
            aria-label="Toggle theme"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 lg:w-5 lg:h-5 text-yellow-500" />
            ) : (
              <Moon className="w-4 h-4 lg:w-5 lg:h-5 text-gray-700" />
            )}
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              ref={buttonRef}
              onClick={handleToggleMenu}
              className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1.5 lg:py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
            >
              <div className="w-7 h-7 lg:w-8 lg:h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-xs lg:text-sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-xs lg:text-sm font-medium text-gray-900 dark:text-white hidden sm:inline">
                {user?.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-gray-500" />
            </button>

            {/* Dropdown Portal */}
            {showUserMenu && createPortal(
              <>
                <div
                  className="fixed inset-0"
                  style={{ zIndex: 99998 }}
                  onClick={() => setShowUserMenu(false)}
                />
                <div 
                  className="fixed w-56 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2"
                  style={{ 
                    top: `${menuPosition.top}px`, 
                    right: `${menuPosition.right}px`,
                    zIndex: 99999
                  }}
                >
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user?.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user?.email}
                    </p>
                  </div>
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Atajos de teclado</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Activa o desactiva los atajos globales</p>
                      </div>
                      <label className={`relative inline-flex items-center cursor-pointer ${updatingShortcuts ? 'opacity-60 cursor-not-allowed' : ''}`}>
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={shortcutsActive}
                          onChange={handleShortcutToggle}
                          disabled={updatingShortcuts}
                        />
                        <div className="w-10 h-5 bg-gray-300 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-200"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// Helper to get page title from current route
const getPageTitle = () => {
  const path = window.location.pathname;
  const titles = {
    '/': 'Dashboard',
    '/facturacion': 'Facturación',
    '/inventario': 'Inventario',
    '/clientes': 'Clientes',
    '/cierre-caja': 'Cierre de Caja',
    '/usuarios': 'Gestión de Usuarios',
    '/reportes': 'Reportes',
    '/configuracion': 'Configuración',
  };
  return titles[path] || 'MECANET';
};

export default TopBar;
