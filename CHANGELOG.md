# 📝 Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/),
y este proyecto adhiere al [Versionado Semántico](https://semver.org/lang/es/).

---

## [1.4.10] - 2025-11-20

### ✨ Agregado
- **Modal de Versión:** Ahora muestra automáticamente el contenido del CHANGELOG.md en lugar de texto genérico
- **Debug:** Endpoint `/api/debug/returns` para diagnosticar problemas con devoluciones

### 🐛 Corregido
- **Changelog:** El modal de "Acerca de" ahora lee y muestra las notas de release desde CHANGELOG.md

## [1.4.9] - 2025-11-20

### 🐛 Corregido (Debug)
- Agregados logs detallados para diagnosticar por qué las devoluciones no restan correctamente
- Logs muestran: fechas de filtrado, todas las devoluciones aprobadas, fechas de ventas originales

## [1.4.8] - 2025-11-20

### 🐛 Corregido
- **Dashboard:** Simplificado el cálculo de devoluciones para diagnosticar problemas de estadísticas
- **Debug:** Agregados logs detallados para identificar inconsistencias en el cálculo de ventas netas
- **Estadísticas:** Removido temporalmente el cálculo de beneficio en devoluciones para aislar el problema
- **Monitoreo:** Agregado facet de debug que muestra las primeras 5 devoluciones en consola para verificación

### 🔧 Técnico
- Simplificada la agregación de MongoDB para devoluciones
- Mejorado el logging en `getDashboardStats` para troubleshooting
- Agregado campo `saleDate` en pipeline de agregación de devoluciones

## [1.4.7] - 2025-11-20

### ✨ Agregado
- **Estadísticas:** Las devoluciones ahora afectan la fecha de la venta original, no la fecha de devolución
- **Dashboard:** Estadísticas diarias ahora muestran el rendimiento real del día de la venta

### 🐛 Corregido
- **Lógica de Negocio:** Corregido cálculo de estadísticas - las devoluciones procesadas HOY de ventas de AYER ya no afectan las estadísticas de HOY
- **Reportes:** Los reportes de múltiples días ahora incluyen correctamente las devoluciones del período

### 💡 Ejemplo
- Lunes: Venta de $1,000 → Dashboard muestra $1,000
- Martes: Devolución de $500 de la venta del lunes → Dashboard del Lunes ahora muestra $500, Dashboard del Martes muestra $0

## [1.4.6] - 2025-11-20

## [1.4.5] - 2025-11-20

### ✨ Agregado
- **Beneficios:** Implementado cálculo real de beneficios/ganancias considerando devoluciones
- **Modelo Sale:** Agregado campo `purchasePriceAtSale` para almacenar costo de productos al momento de venta

### 🔧 Técnico
- Dashboard ahora calcula: Beneficio = (Precio Venta - Precio Compra) × Cantidad
- Las devoluciones restan el beneficio perdido del total
- Nuevo campo `profit` en respuesta de `/api/dashboard/stats`

## [1.4.4] - 2025-11-20

### ✨ Agregado
- **Dashboard:** Las devoluciones aprobadas ahora se restan de las estadísticas de ventas
- **Estadísticas:** Agregados campos `returns` y `returnsAmount` en respuesta del dashboard

### 🐛 Corregido
- **Cálculos:** Total mostrado ahora es neto (Ventas - Devoluciones)
- **Reportes:** Gráficas de ventas por día reflejan devoluciones correctamente

## [1.4.2] - 2025-11-20

### 🐛 Corregido
- **Modal de Pago:** Corrección definitiva del cálculo de cambio/vuelto
- **Descuentos:** El cambio ahora considera correctamente los descuentos globales aplicados
- **UX:** Cálculo del cambio se realiza en tiempo real dentro del modal usando `useMemo`

## [1.4.1] - 2025-11-20

### 🐛 Corregido
- **Modal de Pago:** Corregido cálculo de cambio cuando se aplican descuentos
- **Actualizaciones:** Las actualizaciones locales ahora compilan correctamente el frontend después de descargar código fuente

### 🔧 Técnico
- Script `iniciar-servidor.bat` ahora ejecuta `npm run build` en carpeta client después de actualizar
- Soporte para compilación con Node.js portable y global

## [1.1.6] - 2025-11-20

Corrección error 500 al iniciar

## [1.1.3] - 2025-11-19

### ✨ Agregado
- **Actualización Inteligente:** Implementado nuevo sistema de actualización basado en código fuente (`sourceUpdateService`). Ahora el sistema descarga directamente la última versión de la rama `main` de GitHub, eliminando la dependencia de archivos ZIP en los Releases.
- **Scripts:** Nuevo script `scripts/smart-startup.js` que gestiona la detección y aplicación de actualizaciones al iniciar el sistema.
- **Configuración:** Nueva opción `autoUpdate` en la configuración del sistema para activar/desactivar actualizaciones automáticas.

### 🐛 Corregido
- **Core:** Reescritura completa de `performanceMiddleware.js` y `logMiddleware.js` para eliminar el "monkey-patching" de `res.json` y `res.send`. Ahora usan eventos estándar (`res.on('finish')`), eliminando definitivamente los errores 500 y desbordamientos de pila al servir archivos estáticos o respuestas no-JSON.
- **Instalación:** El script `CONFIGURAR-INICIAL.bat` ahora incluye un `pause` al final para evitar que la ventana se cierre inesperadamente tras la instalación.

### 🐛 Corregido
- **Core:** Corregido un error crítico en `performanceMiddleware.js` que podía causar un desbordamiento de pila (Stack Overflow) y errores 500 al interceptar consultas de base de datos repetidamente.
- **Instalación:** El script `CONFIGURAR-INICIAL.ps1` ahora instala automáticamente las dependencias (`npm install`) si no existen, antes de intentar verificar la conexión a la base de datos. Esto soluciona el error `ERR_MODULE_NOT_FOUND` en instalaciones limpias.
- **Instalación:** El script `CONFIGURAR-INICIAL.ps1` ahora crea automáticamente `.env.example` si falta, evitando errores en instalaciones nuevas.
- **Instalación:** Mejorada la verificación de conexión a MongoDB. Ahora muestra errores detallados (IP no permitida, credenciales, etc.) en lugar de un error genérico.
- **Release:** Corregido el script `automated-release.js` para detectar automáticamente la rama actual y hacer push correctamente.
- **Distribución:** Agregadas validaciones en scripts de empaquetado para asegurar que `.env.example` se incluya en el ZIP.

## [1.0.0] - 2025-10-07

### 🎉 Primera Versión Estable

Esta es la primera versión estable del sistema MECANET, con todas las funcionalidades principales implementadas.

### ✨ Agregado

#### Sistema Principal
- Sistema de Punto de Venta (POS) completo
- Dashboard interactivo con KPIs en tiempo real
- Módulo de facturación con cálculo automático de impuestos
- Historial de ventas con filtros avanzados
- Sistema de devoluciones

#### Gestión de Inventario
- CRUD completo de productos
- Categorías y clasificación de productos
- Alertas de stock bajo
- Órdenes de compra a proveedores
- Cálculo automático de precios (costo + margen)

#### Gestión de Contactos
- CRUD de clientes con historial de compras
- CRUD de proveedores con historial de órdenes
- Búsqueda y filtrado avanzado

#### Caja y Finanzas
- Apertura y cierre de caja por turno
- Registro de retiros de caja con autorización
- Cuadre automático de caja
- Reportes financieros

#### Sistema de Auditoría (NUEVO)
- 📋 Registro automático de todas las acciones de usuarios
- 🔍 Visualización detallada de logs de auditoría
- 👤 Seguimiento por usuario, módulo y acción
- 📊 Estadísticas de auditoría
- 🔒 Protección de integridad de logs

#### Sistema de Logs Técnicos (NUEVO)
- 📝 Clasificación de logs por módulo y severidad
- 🚨 Niveles: info, warning, error, critical
- 📈 Estadísticas de logs por periodo
- 🔍 Búsqueda y filtrado avanzado
- 🧹 Limpieza automática de logs antiguos

#### Monitoreo en Tiempo Real (NUEVO)
- 📊 Monitoreo de rendimiento del sistema
- 🔄 Actualización automática cada 30 segundos
- 📈 Métricas de API, base de datos y memoria
- 📊 Historial de métricas de rendimiento

#### Interfaz de Usuario
- Diseño moderno con efectos glassmorphism
- Modo oscuro con toggle
- Sidebar con secciones expandibles
- Animaciones suaves y microinteracciones
- 🕐 Widget de reloj en tiempo real
- 🌤️ Widget de clima integrado
- ⌨️ Atajos de teclado (ver Ctrl+K)
- Responsive design para todos los dispositivos

#### Administración
- Gestión de usuarios y roles (Admin/Cajero)
- Configuración del negocio (nombre, logo, impuestos)
- Configuración de sistema (idioma, moneda, zona horaria)
- Configuración de notificaciones
- Reportes avanzados

#### Autenticación y Seguridad
- Sistema de login con JWT
- Protección de rutas según rol
- Sesión persistente
- Middleware de autorización

#### Flujo de Trabajo Git (NUEVO)
- 🌿 Estrategia de ramas: main (producción) y develop (desarrollo)
- 📦 Sistema de versionado semántico automático
- 🚀 Scripts de release automatizados
- 📚 Documentación completa del flujo de trabajo
- 🏷️ Etiquetado automático de versiones

### 🛠️ Tecnologías

#### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT para autenticación
- Express Validator
- Sistema de logs centralizado

#### Frontend
- React 18.2
- Vite para build rápido
- React Router para navegación
- Zustand para state management
- Tailwind CSS para estilos
- Lucide React para iconos
- Chart.js para gráficos

### 📚 Documentación

- README completo con instrucciones
- Documentación de API endpoints
- Guía de instalación y configuración
- Documentación del flujo de trabajo Git
- Documentación del sistema de auditoría
- Documentación del sistema de logs

### 🔧 Scripts NPM

```json
{
  "start": "Iniciar servidor en producción",
  "dev": "Iniciar servidor con nodemon",
  "seed": "Poblar base de datos con datos de ejemplo",
  "create-admin": "Crear usuario administrador",
  "release:patch": "Publicar versión de corrección (x.x.X)",
  "release:minor": "Publicar versión con nuevas funcionalidades (x.X.0)",
  "release:major": "Publicar versión con cambios importantes (X.0.0)"
}
```

### 📋 Notas de la Versión

Esta versión marca el lanzamiento oficial del sistema MECANET como una solución completa y profesional para la gestión de tiendas de repuestos automotrices. Todas las funcionalidades principales han sido implementadas y probadas.

El sistema incluye ahora un robusto sistema de auditoría y monitoreo que permite rastrear todas las acciones de los usuarios y supervisar el rendimiento del sistema en tiempo real.

### 🎯 Próximas Funcionalidades

- Sistema de notificaciones en tiempo real
- Integración con servicios de terceros (pasarelas de pago)
- Generación de reportes PDF
- Sistema de backup automático
- App móvil

---

## Leyenda de Cambios

- ✨ `Agregado` - Nuevas funcionalidades
- 🔧 `Modificado` - Cambios en funcionalidades existentes
- 🐛 `Corregido` - Corrección de errores
- 🗑️ `Eliminado` - Funcionalidades removidas
- 🔒 `Seguridad` - Correcciones de seguridad
- 📚 `Documentación` - Cambios en documentación
- 🎨 `Estilo` - Cambios que no afectan funcionalidad
- ⚡ `Rendimiento` - Mejoras de rendimiento
- ♻️ `Refactor` - Reestructuración de código

---

## Formato de Versiones

Este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/):

- **MAJOR** (X.0.0): Cambios incompatibles con versiones anteriores
- **MINOR** (0.X.0): Nuevas funcionalidades compatibles
- **PATCH** (0.0.X): Correcciones de errores compatibles

---

**Nota**: Las versiones no liberadas se marcarán como `[Unreleased]` en la parte superior del changelog.
