import RoleSectionAccess from '../models/RoleSectionAccess.js';

export const SECTIONS = [
  ['dashboard', 'Dashboard'],
  ['facturacion', 'Nueva factura'],
  ['historial-ventas', 'Historial de ventas'],
  ['cotizaciones', 'Cotizaciones'],
  ['devoluciones', 'Devoluciones'],
  ['inventario', 'Productos'],
  ['ordenes-compra', 'Órdenes de compra'],
  ['clientes', 'Clientes'],
  ['proveedores', 'Proveedores'],
  ['cierre-caja', 'Cierre de caja'],
  ['retiros-caja', 'Retiros de caja'],
  ['reportes', 'Reportes'],
  ['usuarios', 'Usuarios'],
  ['configuracion/negocio', 'Configuración · Negocio'],
  ['configuracion/sistema', 'Configuración · Sistema'],
  ['configuracion/notificaciones', 'Configuración · Notificaciones'],
  ['configuracion/facturacion', 'Configuración · Facturación'],
  ['configuracion/integraciones', 'Configuración · Integraciones'],
  ['logs', 'Logs técnicos'],
  ['auditoria', 'Auditoría de usuario'],
  ['monitoreo', 'Monitoreo']
];

export const SECTION_KEYS = SECTIONS.map(([key]) => key);
const technical = new Set(['logs', 'auditoria', 'monitoreo']);
const administrative = new Set(['usuarios', 'reportes', ...SECTION_KEYS.filter(key => key.startsWith('configuracion/'))]);
export const DEFAULT_ROLE_SECTIONS = {
  admin: SECTION_KEYS.filter(key => !technical.has(key)),
  cajero: SECTION_KEYS.filter(key => !technical.has(key) && !administrative.has(key))
};

export const validSections = sections => Array.isArray(sections) &&
  sections.every(key => typeof key === 'string' && SECTION_KEYS.includes(key)) &&
  new Set(sections).size === sections.length;

export async function getRoleSections(role) {
  if (role === 'desarrollador') return SECTION_KEYS;
  const saved = await RoleSectionAccess.findOne({ role }).lean();
  return saved ? saved.sections : (DEFAULT_ROLE_SECTIONS[role] || []);
}

export async function getEffectiveSections(user) {
  if (user.role === 'desarrollador') return SECTION_KEYS;
  const sections = new Set(await getRoleSections(user.role));
  for (const key of user.sectionOverrides?.disabled || []) sections.delete(key);
  for (const key of user.sectionOverrides?.enabled || []) sections.add(key);
  return SECTION_KEYS.filter(key => sections.has(key));
}

export async function hasAnySection(user, keys) {
  const sections = await getEffectiveSections(user);
  return keys.some(key => sections.includes(key));
}
