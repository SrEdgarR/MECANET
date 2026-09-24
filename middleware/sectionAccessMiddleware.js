import { getEffectiveSections } from '../services/sectionAccess.js';
import { protect } from './authMiddleware.js';

export const developerOnly = (req, res, next) => req.user?.role === 'desarrollador'
  ? next()
  : res.status(403).json({ message: 'Solo el desarrollador puede configurar accesos' });

export const requireSection = (...keys) => async (req, res, next) => {
  try {
    const sections = req.effectiveSections || await getEffectiveSections(req.user);
    if (!keys.some(key => sections.includes(key))) {
      return res.status(403).json({ message: 'No tienes acceso a esta sección' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Las consultas compartidas pueden servir a varias pantallas. Las escrituras
// siempre se asignan a la sección que modifica la entidad.
function sectionsForRequest(req) {
  const path = req.path;
  const write = !['GET', 'HEAD'].includes(req.method);
  if (path.startsWith('/users')) return ['usuarios'];
  if (path.startsWith('/products')) return write ? ['inventario'] : ['inventario', 'facturacion', 'ordenes-compra', 'cotizaciones', 'devoluciones', 'reportes'];
  if (path.startsWith('/sales')) {
    if (path === '/sales/close-register') return ['cierre-caja'];
    if (write) return req.method === 'POST' ? ['facturacion'] : ['historial-ventas'];
    return ['facturacion', 'historial-ventas', 'devoluciones', 'cierre-caja', 'reportes'];
  }
  if (path.startsWith('/customers')) return write ? ['clientes'] : ['clientes', 'facturacion', 'cotizaciones', 'devoluciones', 'reportes'];
  if (path.startsWith('/suppliers')) return write ? ['proveedores'] : ['proveedores', 'ordenes-compra'];
  if (path.startsWith('/purchase-orders')) return ['ordenes-compra'];
  if (path.startsWith('/returns')) return ['devoluciones'];
  if (path.startsWith('/cash-withdrawals')) return write ? ['retiros-caja'] : ['retiros-caja', 'cierre-caja'];
  if (path.startsWith('/quotations')) return ['cotizaciones'];
  if (path === '/dashboard/products-with-profit') return ['reportes'];
  if (path.startsWith('/dashboard')) return ['dashboard', 'reportes'];
  if (path.startsWith('/audit-logs')) return ['auditoria'];
  if (path.startsWith('/logs/monitoring') || ['/logs/performance', '/logs/errors', '/logs/alerts'].includes(path) || /^\/logs\/[^/]+\/resolve$/.test(path)) return ['monitoreo'];
  if (path.startsWith('/logs')) return ['logs'];
  if (path.startsWith('/system')) return ['configuracion/sistema'];
  if (path.startsWith('/settings')) {
    if (path === '/settings/export') return ['configuracion/sistema'];
    if (!write || path === '/settings/notifications') return null;
    if (path === '/settings/company') return ['configuracion/negocio'];
    if (path.startsWith('/settings/smtp')) return ['configuracion/integraciones'];
    if (['/settings/export', '/settings/import', '/settings/clean-test-data'].includes(path)) return ['configuracion/sistema'];
    return ['configuracion/negocio', 'configuracion/sistema', 'configuracion/notificaciones', 'configuracion/facturacion', 'configuracion/integraciones'];
  }
  if (path.startsWith('/debug')) return ['monitoreo'];
  return null;
}

export const sectionAccessGate = (req, res, next) => {
  if (req.path.startsWith('/proxy') ||
      (req.method === 'GET' && ['/settings/public', '/settings/company'].includes(req.path))) return next();
  const required = sectionsForRequest(req);
  if (!required) return next();
  protect(req, res, async () => {
    try {
      req.effectiveSections = await getEffectiveSections(req.user);
      if (!required.some(key => req.effectiveSections.includes(key))) {
        return res.status(403).json({ message: 'No tienes acceso a esta sección' });
      }
      next();
    } catch (error) {
      next(error);
    }
  });
};
