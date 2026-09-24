/**
 * @file App.jsx
 * @description Componente raÃ­z de la aplicaciÃ³n con configuraciÃ³n de rutas
 * 
 * Responsabilidades:
 * - Configurar React Router con todas las rutas de la aplicaciÃ³n
 * - Implementar ProtectedRoute para rutas privadas y de admin
 * - Configurar Toaster global para notificaciones
 * - Aplicar tema claro/oscuro desde themeStore
 * 
 * Rutas:
 * - /login: PÃ¡gina de autenticaciÃ³n (pÃºblica)
 * - /: Layout principal (protegido) con subrutas:
 *   - Dashboard, FacturaciÃ³n, Inventario, Clientes, etc.
 *   - Rutas de admin: Usuarios, Reportes, ConfiguraciÃ³n
 * 
 * ProtectedRoute:
 * - Verifica isAuthenticated, redirige a /login si no hay sesiÃ³n
 * - adminOnly=true verifica roles privilegiados (admin/desarrollador), redirige a / si no tiene permisos
 */

import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useSettingsStore } from './store/settingsStore';
import { hasSection, firstAllowedPath } from './utils/sectionAccess';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import CashRegister from './pages/CashRegister';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import Returns from './pages/Returns';
import SalesHistory from './pages/SalesHistory';
import CashWithdrawals from './pages/CashWithdrawals';
import Quotations from './pages/Quotations';
import Logs from './pages/Logs';
import AuditLogs from './pages/AuditLogs';
import Monitoring from './pages/Monitoring';

// Layout
import Layout from './components/Layout/Layout';

// Auth Validator
import AuthValidator from './components/AuthValidator';

// Keyboard Shortcuts
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';

// Christmas Easter Egg
import ChristmasSnow from './components/ChristmasSnow';

// Protected Route Component
const ProtectedRoute = ({ children, section }) => {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (section && !hasSection(user, section)) {
    const destination = firstAllowedPath(user);
    return destination ? <Navigate to={destination} replace /> : <div className="p-8">No tienes secciones habilitadas. Contacta al desarrollador.</div>;
  }

  return children;
};

// Export AppRoutes separately for testing
export const AppRoutes = () => {
  const { isDarkMode, autoThemeEnabled, checkAutoTheme } = useThemeStore();
  const { settings } = useSettingsStore();

  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  // Verificar tema automÃ¡tico cada minuto
  useEffect(() => {
    // Verificar inmediatamente al cargar
    checkAutoTheme();

    // Verificar cada minuto si debe cambiar el tema
    const interval = setInterval(() => {
      checkAutoTheme();
    }, 60000); // 60 segundos

    return () => clearInterval(interval);
  }, [checkAutoTheme, autoThemeEnabled]);

  // Actualizar favicon dinÃ¡micamente con el logo del sistema
  useEffect(() => {
    if (settings?.businessLogoUrl) {
      const link = document.querySelector("link[rel~='icon']");
      if (link) {
        link.href = settings.businessLogoUrl;
      }
    }
  }, [settings?.businessLogoUrl]);

  // Aplicar clase dark al documentElement para que funcione con portals
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className={isDarkMode ? 'dark' : ''}>
      <KeyboardShortcutsHelp />
      <ChristmasSnow />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ProtectedRoute section="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="facturacion" element={<ProtectedRoute section="facturacion"><Billing /></ProtectedRoute>} />
          <Route path="inventario" element={<ProtectedRoute section="inventario"><Inventory /></ProtectedRoute>} />
          <Route path="clientes" element={<ProtectedRoute section="clientes"><Customers /></ProtectedRoute>} />
          <Route path="proveedores" element={<ProtectedRoute section="proveedores"><Suppliers /></ProtectedRoute>} />
          <Route path="ordenes-compra" element={<ProtectedRoute section="ordenes-compra"><PurchaseOrders /></ProtectedRoute>} />
          <Route path="devoluciones" element={<ProtectedRoute section="devoluciones"><Returns /></ProtectedRoute>} />
          <Route path="historial-ventas" element={<ProtectedRoute section="historial-ventas"><SalesHistory /></ProtectedRoute>} />
          <Route path="cotizaciones" element={<ProtectedRoute section="cotizaciones"><Quotations /></ProtectedRoute>} />
          <Route path="cierre-caja" element={<ProtectedRoute section="cierre-caja"><CashRegister /></ProtectedRoute>} />
          <Route path="retiros-caja" element={<ProtectedRoute section="retiros-caja"><CashWithdrawals /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route
            path="usuarios"
            element={
              <ProtectedRoute section="usuarios">
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="reportes"
            element={
              <ProtectedRoute section="reportes">
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route path="configuracion" element={<Navigate to="/configuracion/negocio" replace />} />
          <Route path="configuracion/negocio" element={<ProtectedRoute section="configuracion/negocio"><Settings section="business" /></ProtectedRoute>} />
          <Route path="configuracion/sistema" element={<ProtectedRoute section="configuracion/sistema"><Settings section="system" /></ProtectedRoute>} />
          <Route path="configuracion/notificaciones" element={<ProtectedRoute section="configuracion/notificaciones"><Settings section="notifications" /></ProtectedRoute>} />
          <Route path="configuracion/facturacion" element={<ProtectedRoute section="configuracion/facturacion"><Settings section="billing" /></ProtectedRoute>} />
          <Route path="configuracion/integraciones" element={<ProtectedRoute section="configuracion/integraciones"><Settings section="integrations" /></ProtectedRoute>} />
          <Route path="logs" element={<ProtectedRoute section="logs"><Logs /></ProtectedRoute>} />
          <Route path="auditoria" element={<ProtectedRoute section="auditoria"><AuditLogs /></ProtectedRoute>} />
          <Route path="monitoreo" element={<ProtectedRoute section="monitoreo"><Monitoring /></ProtectedRoute>} />
        </Route>
      </Routes>

      <Toaster
        position={settings.toastPosition || 'top-center'}
        containerStyle={{
          zIndex: 999999,
        }}
        toastOptions={{
          duration: 3000,
          style: {
            background: isDarkMode ? '#1f2937' : '#ffffff',
            color: isDarkMode ? '#f3f4f6' : '#111827',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            zIndex: 999999,
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthValidator>
        <AppRoutes />
      </AuthValidator>
    </Router>
  );
}

export default App;
