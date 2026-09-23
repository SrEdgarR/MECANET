/**
 * @file themeStore.js
 * @description Store del tema claro/oscuro con Zustand
 * 
 * Maneja el estado del tema visual de la aplicación:
 * - isDarkMode: Boolean que indica si el modo oscuro está activo
 * 
 * Acciones:
 * - toggleTheme(): Alternar entre claro/oscuro
 * - setDarkMode(isDark): Establecer tema específico
 * 
 * Persistencia:
 * - Usa middleware 'persist' para guardar en localStorage
 * - Clave: 'theme-storage'
 * - Al recargar la página, se restaura el tema guardado
 * 
 * Uso en App.jsx:
 * const { isDarkMode } = useThemeStore();
 * return <div className={isDarkMode ? 'dark' : ''}> // Tailwind dark mode
 * 
 * Uso en componentes:
 * const { isDarkMode, toggleTheme } = useThemeStore();
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Verificar si es hora de activar modo oscuro automático
 * Se activa a las 5:00 PM (17:00) y se desactiva a las 7:00 AM
 */
const shouldBeInDarkMode = () => {
  const now = new Date();
  const hour = now.getHours();
  
  // Modo oscuro entre 17:00 (5 PM) y 07:00 (7 AM)
  return hour >= 17 || hour < 7;
};

export const useThemeStore = create(
  persist(
    (set, get) => ({
      isDarkMode: false,
      autoThemeEnabled: true, // Activar tema automático por defecto

      toggleTheme: () => {
        set((state) => ({ 
          isDarkMode: !state.isDarkMode,
          // Desactivar auto-theme cuando el usuario cambia manualmente
          autoThemeEnabled: false
        }));
      },

      setDarkMode: (isDark) => {
        set({ 
          isDarkMode: isDark,
          autoThemeEnabled: false // Desactivar auto-theme en cambio manual
        });
      },

      enableAutoTheme: (enabled) => {
        set({ autoThemeEnabled: enabled });
        if (enabled) {
          // Aplicar tema automático inmediatamente
          const shouldBeDark = shouldBeInDarkMode();
          set({ isDarkMode: shouldBeDark });
        }
      },

      checkAutoTheme: () => {
        const state = get();
        if (state.autoThemeEnabled) {
          const shouldBeDark = shouldBeInDarkMode();
          if (state.isDarkMode !== shouldBeDark) {
            set({ isDarkMode: shouldBeDark });
            console.log(`🌓 Tema cambiado automáticamente a: ${shouldBeDark ? 'oscuro' : 'claro'}`);
          }
        }
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);
