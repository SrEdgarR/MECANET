/**
 * ShortcutTooltip - Componente para mostrar atajos de teclado en botones
 * 
 * Uso:
 * <ShortcutTooltip shortcut="Ctrl + S" position="bottom">
 *   <button>Guardar</button>
 * </ShortcutTooltip>
 */

import { useState } from 'react';

const ShortcutTooltip = ({ children, shortcut, position = 'bottom', description = '' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const displayShortcut = shortcut.replace(/Ctrl/g, isMac ? '⌘' : 'Ctrl');

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      
      {isVisible && shortcut && (
        <div
          className={`absolute ${positionClasses[position]} left-1/2 transform -translate-x-1/2 z-50 pointer-events-none`}
        >
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg shadow-lg px-3 py-2 whitespace-nowrap">
            {description && (
              <div className="text-xs text-gray-300 mb-1">{description}</div>
            )}
            <kbd className="px-2 py-1 text-xs font-semibold bg-gray-800 dark:bg-gray-600 rounded border border-gray-700">
              {displayShortcut}
            </kbd>
            {/* Arrow */}
            <div
              className={`absolute left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45 ${
                position === 'bottom' ? '-top-1' : position === 'top' ? '-bottom-1' : ''
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ShortcutTooltip;
