/**
 * @file ClockWidget.jsx
 * @description Widget de reloj en tiempo real con fecha
 * 
 * Responsabilidades:
 * - Mostrar hora actual actualizada cada segundo (HH:MM:SS AM/PM)
 * - Mostrar fecha actual en formato largo (día, mes, año)
 * - Usar locale 'es-DO' para formato dominicano
 * 
 * Funcionalidad:
 * - useEffect con setInterval de 1 segundo actualiza el estado
 * - Cleanup: clearInterval al desmontar componente
 * - formatTime: formato 12 horas con AM/PM
 * - formatDate: día de semana + fecha completa capitalizada
 * 
 * Uso:
 * - Renderizado en TopBar.jsx
 * - Usa icono Clock de lucide-react
 * - Estilos: glassmorphism con bg-gray-100 dark:bg-gray-800
 */

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const ClockWidget = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('es-DO', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('es-DO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <Clock className="w-4 h-4 lg:w-5 lg:h-5 text-primary-600 dark:text-primary-400" />
      <div className="flex flex-col">
        <span className="text-base lg:text-lg font-bold text-gray-900 dark:text-white tabular-nums">
          {formatTime(time)}
        </span>
        <span className="text-[10px] lg:text-xs text-gray-500 dark:text-gray-400 capitalize leading-tight">
          {formatDate(time)}
        </span>
      </div>
    </div>
  );
};

export default ClockWidget;
