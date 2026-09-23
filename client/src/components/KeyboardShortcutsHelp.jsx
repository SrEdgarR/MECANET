/**
 * KeyboardShortcutsHelp - Modal para mostrar atajos de teclado disponibles
 * 
 * Se abre con "?" y muestra todos los shortcuts disponibles
 */

import { useState, useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

const KeyboardShortcutsHelp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);

    document.addEventListener('open-shortcuts-help', handleOpen);
    document.addEventListener('close-modal', handleClose);

    return () => {
      document.removeEventListener('open-shortcuts-help', handleOpen);
      document.removeEventListener('close-modal', handleClose);
    };
  }, []);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: `${modKey} + B`, description: 'Ir a Facturación (Billing)' },
    { keys: `${modKey} + I`, description: 'Ir a Inventario' },
    { keys: `${modKey} + H`, description: 'Ir a Historial de Ventas' },
    { keys: `${modKey} + L`, description: 'Ir a Clientes' },
    { keys: `${modKey} + R`, description: 'Ir a Reportes' },
    { keys: `${modKey} + ,`, description: 'Ir a Configuración' },
    { keys: `${modKey} + K`, description: 'Búsqueda rápida' },
    { keys: '?', description: 'Mostrar esta ayuda' },
    { keys: 'Esc', description: 'Cerrar modal/diálogo' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Atajos de Teclado
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Usa estos atajos para navegar más rápido en el sistema
          </p>

          <div className="space-y-3">
            {shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="text-gray-900 dark:text-white font-medium">
                  {shortcut.description}
                </span>
                <kbd className="px-3 py-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>

          {/* Footer tip */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              💡 <strong>Tip:</strong> Presiona <kbd className="px-2 py-1 text-xs font-semibold bg-blue-100 dark:bg-blue-800 rounded">?</kbd> en cualquier momento para ver esta ayuda
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;
