/**
 * AUTHSTORE.JS - Store de autenticación con Zustand
 * 
 * Maneja el estado global de autenticación de la aplicación:
 * - Datos del usuario actual (name, email, role)
 * - Token JWT
 * - Estado de autenticación
 * 
 * Usa middleware 'persist' para guardar en localStorage automáticamente.
 * Al recargar la página, el estado se restaura desde localStorage.
 * 
 * Uso en componentes:
 * const { user, isAuthenticated, login, logout } = useAuthStore();
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // Persiste el estado en localStorage

/**
 * Hook de Zustand con persistencia
 * 
 * Estado:
 * - user: Objeto con datos del usuario (_id, name, email, role) o null
 * - token: String del token JWT o null
 * - isAuthenticated: Boolean que indica si hay usuario logueado
 * 
 * Acciones:
 * - login(user, token): Guardar usuario y token al hacer login
 * - setAuth(user, token): Alias de login, usado al verificar token existente
 * - logout(): Limpiar todo el estado y remover token
 * - clearAuth(): Limpiar autenticación sin redirección (para manejo de errores)
 * - updateUser(userData): Actualizar parcialmente los datos del usuario
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      // ===== ESTADO =====
      user: null, // Datos del usuario logueado
      token: null, // Token JWT
      isAuthenticated: false, // true si hay usuario logueado

      // ===== ACCIÓN: LOGIN =====
      // Se ejecuta al hacer login exitoso
      login: (user, token) => {
        set({ user, token, isAuthenticated: true });
        // Guardar token en localStorage para que axios lo use en los interceptors
        localStorage.setItem('token', token);
      },

      // ===== ACCIÓN: SETAUTH =====
      // Similar a login, se usa al restaurar sesión desde token existente
      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true });
        // Guardar token en localStorage
        localStorage.setItem('token', token);
      },

      // ===== ACCIÓN: LOGOUT =====
      // Limpia todo el estado de autenticación
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        localStorage.removeItem('token'); // Limpiar token para que axios no lo envíe
      },

      // ===== ACCIÓN: CLEARAUTH =====
      // Limpia la autenticación de forma silenciosa (para manejo de errores)
      clearAuth: () => {
        set({ user: null, token: null, isAuthenticated: false });
        localStorage.removeItem('token');
      },

      // ===== ACCIÓN: UPDATEUSER =====
      // Actualiza parcialmente los datos del usuario (ej: después de editar perfil)
      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData } // Merge de datos existentes con nuevos
        }));
      },
    }),
    {
      name: 'auth-storage', // Clave en localStorage donde se guarda el estado
    }
  )
);
