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
 * - Sidebar: Menú de navegación lateral (siempre visible)
 * - TopBar: Barra superior con widgets (reloj, clima, usuario, tema)
 * - Outlet: Renderiza la ruta actual (Dashboard, Billing, etc.)
 * 
 * Nota:
 * - Este componente se monta en la ruta "/" (protegida)
 * - Al cargar, hace fetch de /api/settings y actualiza settingsStore
 */

import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AnimatedBackground from '../AnimatedBackground';
import { useSettingsStore } from '../../store/settingsStore';
import { getSettings } from '../../services/api';

const Layout = () => {
  const { setSettings } = useSettingsStore();

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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 relative">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Top Bar */}
        <TopBar />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
