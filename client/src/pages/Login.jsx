/**
 * @file Login.jsx
 * @description Página de autenticación (inicio de sesión)
 * 
 * Responsabilidades:
 * - Formulario de login con email + password
 * - Validar credenciales contra backend (POST /api/auth/login)
 * - Guardar token y user en authStore al autenticar exitosamente
 * - Redireccionar a / (Dashboard) después de login
 * - Mostrar logo del negocio (desde settings)
 * - Toggle para mostrar/ocultar password
 * 
 * Estados:
 * - formData: { email, password }
 * - showPassword: Boolean para toggle de visibilidad
 * - isLoading: Boolean durante petición API
 * 
 * Flujo:
 * 1. Usuario ingresa email + password
 * 2. handleSubmit previene default + valida campos
 * 3. Llama loginAPI(formData) -> POST /api/auth/login
 * 4. Backend retorna { token, _id, name, email, role }
 * 5. setAuth(user, token) guarda en authStore + localStorage
 * 6. Redirect a / con navigate('/')
 * 
 * Validaciones:
 * - useEffect redirige a / si isAuthenticated (usuario ya logueado)
 * - Validación de campos vacíos antes de submit
 * 
 * UI:
 * - AnimatedBackground decorativo
 * - Glassmorphism en el card de login
 * - Botón con spinner (Loader) durante isLoading
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { login as loginAPI } from '../services/api';
import toast from 'react-hot-toast';
import { LogIn, Eye, EyeOff, Loader } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import useIsChristmas from '../hooks/useIsChristmas';

const Login = () => {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();
  const { settings } = useSettingsStore();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isChristmas = useIsChristmas();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error('Por favor complete todos los campos');
      return;
    }

    setIsLoading(true);

    try {
      const response = await loginAPI(formData);
      const { token, ...user } = response.data;

      setAuth(user, token);
      toast.success(`¡Bienvenido, ${user.name}!`);
      navigate('/');
    } catch (error) {
      console.error('Login error:', error);
      const message = error.response?.data?.message || 'Error al iniciar sesión';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500">
      {/* Fondo animado con formas geométricas o Fondo Navideño */}
      {isChristmas ? (
        <div
          className="absolute inset-0 bg-cover bg-center z-0"
          style={{
            backgroundImage: 'url(/assets/images/santa-login-bg.jpg)',
          }}
        >
          {/* Overlay oscuro para legibilidad */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
        </div>
      ) : (
        <div className="absolute inset-0 overflow-hidden">
          {/* Gradiente base animado */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500 animate-gradient"></div>

          {/* Círculos decorativos con blur */}
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

          {/* Grid pattern sutil */}
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:50px_50px]"></div>

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/20"></div>
        </div>
      )}

      {/* Animated Background */}
      <AnimatedBackground />

      {/* Login Card */}
      <div className="relative w-full max-w-md z-10">
        <div className="backdrop-blur-xl bg-white/95 dark:bg-gray-800/95 border-2 border-white/30 dark:border-gray-700/60 rounded-2xl shadow-2xl p-8 animate-scale-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg overflow-hidden">
              {settings.businessLogoUrl && settings.businessLogoUrl !== '/logo.png' && settings.businessLogoUrl !== '/default-logo.png' ? (
                <img
                  src={settings.businessLogoUrl}
                  alt={settings.businessName || 'Logo'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
              ) : null}
              <svg
                className="w-10 h-10 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                style={{ display: (settings.businessLogoUrl && settings.businessLogoUrl !== '/logo.png' && settings.businessLogoUrl !== '/default-logo.png') ? 'none' : 'block' }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {settings.businessName || 'MECANET'}
            </h1>
            <p className="text-gray-600 dark:text-primary-100">Sistema de Punto de Venta</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
              >
                Correo Electrónico
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
                placeholder="usuario@ejemplo.com"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="input pr-12"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-white text-primary-600 font-semibold py-3 px-4 rounded-lg hover:bg-primary-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Iniciando sesión...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Iniciar Sesión</span>
                </>
              )}
            </button>
          </form>

        </div>

        {/* Footer */}
        <p className="text-center text-white dark:text-white/80 text-sm mt-6 font-medium drop-shadow-md">
          © 2025 MECANET. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
};

export default Login;
