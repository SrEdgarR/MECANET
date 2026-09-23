import { Outlet, NavLink } from 'react-router-dom';
import { Building2, Globe, Bell, CreditCard, Cloud } from 'lucide-react';

const SettingsLayout = () => {
  const sections = [
    { path: '/configuracion/negocio', icon: Building2, label: 'Negocio', description: 'Información de la empresa' },
    { path: '/configuracion/sistema', icon: Globe, label: 'Sistema', description: 'Preferencias generales' },
    { path: '/configuracion/notificaciones', icon: Bell, label: 'Notificaciones', description: 'Alertas y avisos' },
    { path: '/configuracion/facturacion', icon: CreditCard, label: 'Facturación', description: 'Recibos y documentos' },
    { path: '/configuracion/integraciones', icon: Cloud, label: 'Integraciones', description: 'APIs y servicios externos' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Administra la configuración general del sistema
        </p>
      </div>

      {/* Tabs de Navegación */}
      <div className="card-glass overflow-x-auto">
        <div className="flex gap-2 p-2 min-w-max">
          {sections.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`
              }
            >
              <section.icon className="w-5 h-5" />
              <div>
                <div className="font-medium">{section.label}</div>
                <div className="text-xs opacity-75">{section.description}</div>
              </div>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Contenido de la sección */}
      <Outlet />
    </div>
  );
};

export default SettingsLayout;
