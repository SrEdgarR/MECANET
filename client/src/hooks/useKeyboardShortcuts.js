/**
 * useKeyboardShortcuts - Hook para atajos de teclado globales
 * 
 * Implementa shortcuts para power users:
 * - Ctrl/Cmd + K: Búsqueda rápida
 * - Ctrl/Cmd + B: Ir a Facturación
 * - Ctrl/Cmd + I: Ir a Inventario
 * - Ctrl/Cmd + H: Ir a Historial de Ventas
 * - Ctrl/Cmd + L: Ir a Clientes
 * - Ctrl/Cmd + R: Ir a Reportes
 * - Ctrl/Cmd + ,: Ir a Configuración
 * - Esc: Cerrar modal/diálogo
 * - ?: Mostrar ayuda de atajos
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const shortcutsEnabled = user?.shortcutsEnabled !== false;

  useEffect(() => {
    if (!shortcutsEnabled) {
      return;
    }

    const handleKeyDown = (event) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      // Ignorar si está escribiendo en un input/textarea
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      
      // Atajos con Ctrl/Cmd
      if (modKey && !isTyping) {
        switch (event.key.toLowerCase()) {
          case 'b':
            event.preventDefault();
            navigate('/facturacion');
            break;
          case 'i':
            event.preventDefault();
            navigate('/inventario');
            break;
          case 'h':
            event.preventDefault();
            navigate('/historial-ventas');
            break;
          case 'l':
            event.preventDefault();
            navigate('/clientes');
            break;
          case 'r':
            event.preventDefault();
            navigate('/reportes');
            break;
          case ',':
            event.preventDefault();
            navigate('/configuracion/negocio');
            break;
          case 'k':
            event.preventDefault();
            // Trigger global search
            document.dispatchEvent(new CustomEvent('open-search'));
            break;
          default:
            break;
        }
      }

      // Atajo sin modificador: ? para ayuda
      if (event.key === '?' && !isTyping) {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('open-shortcuts-help'));
      }

      // Esc para cerrar modales
      if (event.key === 'Escape') {
        document.dispatchEvent(new CustomEvent('close-modal'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate, shortcutsEnabled]);
};

export default useKeyboardShortcuts;
