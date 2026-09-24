/**
 * @file Layout.jsx
 * @description Layout principal de la aplicación con sidebar, topbar y contenido
 * 
 * Responsabilidades:
 * - Cargar configuración desde backend al montar (useEffect)
 * - Renderizar estructura general: Sidebar + TopBar + Outlet (contenido)
 * - Mostrar AnimatedBackground decorativo
 * 
 * Estructura:
 * - Sidebar: Menú de navegación lateral (se puede ocultar)
 * - TopBar: Barra superior con widgets (reloj, clima, tema)
 * - Outlet: Renderiza la ruta actual (Dashboard, Billing, etc.)
 * 
 * Nota:
 * - Este componente se monta en la ruta "/" (protegida)
 * - Al cargar, hace fetch de /api/settings y actualiza settingsStore
 */

import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AnimatedBackground from '../AnimatedBackground';
import { useSettingsStore } from '../../store/settingsStore';
import { getSettings, getProfile } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const Layout = () => {
  const { setSettings } = useSettingsStore();
  const { updateUser } = useAuthStore();
  const [sidebarVisible, setSidebarVisible] = useState(() => localStorage.getItem('mecanet-sidebar-visible') !== 'false');
  const toggleSidebar = () => setSidebarVisible(value => {
    localStorage.setItem('mecanet-sidebar-visible', String(!value));
    return !value;
  });

  // Cargar settings al montar el componente
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await getSettings();
        setSettings(response.data);
      } catch (error) {
        console.error('Error al cargar configuración:', error);
      }
    };

    loadSettings();
  }, [setSettings]);

  useEffect(() => {
    const refreshAccess = async () => {
      try {
        const { data } = await getProfile();
        updateUser(data);
      } catch (error) {
        console.warn('No se pudo actualizar el perfil:', error.message);
      }
    };
    window.addEventListener('focus', refreshAccess);
    return () => window.removeEventListener('focus', refreshAccess);
  }, [updateUser]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 relative">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Sidebar */}
      {sidebarVisible && <Sidebar />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Top Bar */}
        <TopBar sidebarVisible={sidebarVisible} onToggleSidebar={toggleSidebar} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
