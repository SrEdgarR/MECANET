/**
 * @file TopBar.jsx
 * @description Barra superior con widgets, tema y control de la barra lateral
 * 
 * Responsabilidades:
 * - Mostrar nombre del negocio (businessName desde settings)
 * - ClockWidget: Reloj en tiempo real con fecha
 * - WeatherWidget: Clima actual si está habilitado (settings.showWeather)
 * - Botón de tema: Alternar entre claro/oscuro (toggleTheme)
 * - Permite ocultar y mostrar la barra lateral
 */

import { useThemeStore } from '../../store/themeStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Moon, Sun, Menu, PanelLeftClose } from 'lucide-react';
import ClockWidget from '../ClockWidget';
import WeatherWidget from '../WeatherWidget';

const TopBar = ({ sidebarVisible, onToggleSidebar }) => {
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();

  return (
    <header className="glass-strong border-b border-gray-200 dark:border-gray-700 px-3 lg:px-6 py-2 lg:py-4">
      <div className="flex items-center justify-between">
        {/* Business Name */}
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onToggleSidebar}
            aria-label={sidebarVisible ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
            title={sidebarVisible ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
            {sidebarVisible ? <PanelLeftClose className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
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

        </div>
      </div>
    </header>
  );
};

export default TopBar;
