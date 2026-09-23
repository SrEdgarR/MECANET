import toast from 'react-hot-toast';

// Almacén para rastrear notificaciones activas
const activeToasts = new Map();

/**
 * Muestra una notificación toast agrupada.
 * Si ya existe una notificación idéntica activa, actualiza su contador en lugar de crear una nueva.
 * 
 * @param {string} message - El mensaje a mostrar
 * @param {object} options - Opciones adicionales para el toast (type, duration, etc.)
 */
export const showGroupedToast = (message, options = {}) => {
    const { type = 'success', duration = 3000 } = options;
    const key = `${type}:${message}`;

    const existingToast = activeToasts.get(key);

    if (existingToast) {
        // Incrementar contador
        existingToast.count += 1;

        // Actualizar el toast existente
        toast.success(`${message} (x${existingToast.count})`, {
            id: existingToast.id,
            duration: duration, // Reiniciar duración
        });

        // Reiniciar el timer de limpieza
        clearTimeout(existingToast.timer);
        existingToast.timer = setTimeout(() => {
            activeToasts.delete(key);
        }, duration);

    } else {
        // Crear nuevo toast
        const toastId = toast[type](message, {
            duration: duration,
        });

        // Guardar referencia
        const timer = setTimeout(() => {
            activeToasts.delete(key);
        }, duration);

        activeToasts.set(key, {
            id: toastId,
            count: 1,
            timer: timer
        });
    }
};
