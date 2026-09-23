/**
 * @file AuthValidator.jsx
 * @description Componente que valida la sesión al cargar la aplicación
 * 
 * Responsabilidades:
 * - Verificar si hay token en localStorage al montar
 * - Validar el token contra el backend (GET /auth/profile)
 * - Si el token es inválido, limpiar localStorage y redirigir a login
 * - Mostrar un loader mientras se valida
 * 
 * Soluciona:
 * - Bucle infinito cuando se reinstala el sistema con tokens antiguos
 * - Tokens expirados que causan problemas de carga
 * - Caché de localStorage con datos de instalaciones anteriores
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { getProfile } from '../services/api';
import { Loader } from 'lucide-react';

const AuthValidator = ({ children }) => {
  const { token, isAuthenticated, clearAuth } = useAuthStore();
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const validateAuth = async () => {
      // Si no hay token o no está autenticado, no validar
      if (!token || !isAuthenticated) {
        setIsValidating(false);
        return;
      }

      try {
        // Intentar obtener el perfil del usuario con el token actual
        await getProfile();
        // Si la petición es exitosa, el token es válido
        setIsValidating(false);
      } catch (error) {
        // Si falla (401, 403, 500, red, etc.), limpiar autenticación
        console.warn('Token inválido o sesión expirada, limpiando localStorage...');
        
        // Limpiar TODO el localStorage
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          console.error('Error limpiando storage:', e);
        }

        // Limpiar estado de autenticación
        clearAuth();
        
        setIsValidating(false);
        
        // Forzar recarga de la página para limpiar cualquier estado en memoria
        window.location.replace('/login');
      }
    };

    validateAuth();
  }, []); // Solo ejecutar al montar el componente

  // Mostrar loader mientras se valida
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-white mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  // Si la validación terminó, renderizar la aplicación
  return children;
};

export default AuthValidator;
