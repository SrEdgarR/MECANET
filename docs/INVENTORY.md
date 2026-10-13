# Inventario de adopción — base CP-001 y revisión CP-002

**Vigencia CP-012, 2026-10-12:** destino independiente de Coolify con PostgreSQL SC-005/006. El inventario anterior se conserva como historia del legado. La inspección dirigida nueva está en [CP-012-environment.json](evidence/CP-012-environment.json): solo metadatos, sin conexiones DB, secretos ni cambios remotos. PostgreSQL existente pertenece a Coolify, no a la nueva aplicación. Mecanet-EAK no identificado inequívocamente; todos los recursos existentes protegidos.

CP-002 (2026-10-07): las secciones base siguientes conservan observaciones CP-001 sobre f5afaa2. La [revisión al final](#revisión-cp-002--hosting-y-stack) distingue lo comprobado otra vez de esa evidencia histórica. Destino aprobado actualizado: frontend y backend VPS/Coolify, DEC-021; frontend todavía no migrado.

Fecha: 2026-10-07. Código inspeccionado/probado: `f5afaa23c54c968be249231f18e212b2b43a0c82`. Alcance: inventario y evaluación inicial, **no auditoría exhaustiva ni certificación de seguridad**.

## Estado real

Mecanet es un POS existente con modo local Windows y modo web. La landing es estática; la aplicación ya es dinámica, autenticada y conectada a MongoDB. El objetivo nuevo es hacerlo multiempresa y comercializar suscripciones.

| Área | Observación / clasificación | Fuente |
|---|---|---|
| Repositorio | DETECTED: 211 archivos versionados al inicio; cuenta activa SrEdgarR; único remote SrEdgarR/MECANET | E-01 |
| Backend | DETECTED: monolito Express ESM, entrada server.js, 17 módulos de rutas, 14 modelos Mongoose | E-02 |
| Frontend | DETECTED: React/Vite, 19 archivos de páginas, Tailwind, Zustand y axios | E-02 |
| Dominio | DETECTED: ventas, inventario, clientes, proveedores, compras, cotizaciones, devoluciones, caja, reportes, usuarios | modelos/controladores/páginas |
| Conexión | DETECTED: `mongoose.connect()` global; un `MONGODB_URI`; pool máximo configurado por defecto en 20 | config/db.js |
| Aislamiento | DETECTED: modelos globales y ausencia de tenant/organization/company scope en búsqueda focalizada | E-03 |
| Configuración | DETECTED: singleton Settings; `findOne()` sin ámbito; accesos por rol también globales | models/Settings.js:214; models/RoleSectionAccess.js:4 |
| Identidad | DETECTED: email global único, roles admin/desarrollador/cajero, JWT HS256 con issuer/audience/tokenVersion, almacenamiento en localStorage | models/User.js; middleware/authMiddleware.js; client/src/store/authStore.js |
| Transacciones | DETECTED: ventas, compras, cotizaciones y devoluciones usan sesiones globales de Mongoose | controllers/*Controller.js |
| Exportar/importar | DETECTED: exportación global; replace elimina colecciones de negocio sin ámbito de empresa | controllers/settingsController.js:345,409 |
| Suscripciones | DETECTED: no aparecen modelos/rutas de Tenant, Membership, Plan, Subscription, checkout ni webhooks en los directorios inspeccionados | E-03 |
| Observabilidad | DETECTED: logs/auditoría en MongoDB y Monitoring.jsx; sin SDK Sentry en manifests ni código revisado | services/logService.js; routes/logRoutes.js; package*.json |
| Métricas | DETECTED: memoria del proceso/host; contador y tiempo de queries quedan a cero en performanceMonitor (instrumentación comentada); muestreo de peticiones | middleware/performanceMiddleware.js:8-27,43-62 |
| Fiscalidad heredada | DETECTED: Settings tiene taxRate=0 como default, DOP como moneda; setup-client usa 18%. No inferir tributación SaaS a partir del POS | models/Settings.js; scripts/setup-client.js |

El nombre `client/src/pages/Billing.jsx` corresponde a la facturación/venta del POS, **no** a cobros de suscripciones SaaS.

## Entorno y dependencias

| Entorno / componente | Versión observada | Evidencia / límite |
|---|---|---|
| Equipo de trabajo | Windows x64; Node 24.14.0; npm 11.9.0 | LOCAL; ejecutó pruebas aisladas |
| Lock backend | Express 4.22.3; Mongoose 8.24.4; jsonwebtoken 9.0.2 | LOCAL package-lock.json |
| Lock frontend | React 18.3.1; Vite 6.4.3; Vitest 4.1.11; Tailwind 3.4.18 | LOCAL client/package-lock.json |
| VPS | Linux 7.0.0-1011-oracle; aarch64; 2 CPU; 11925 MiB RAM; sin swap | REMOTE E-05 |
| Contenedor API | Node 24.21.0; imagen identificada con f5afaa2; healthy | REMOTE E-05 |
| MongoDB | 7.0.43; imagen mongo:7; límite 1 GiB; healthy; puerto interno | REMOTE E-05 |
| Plataforma | Docker 29.8.1; Coolify 4.3.23; proxy Traefik v3.6 | REMOTE E-05 |

No se actualizó ningún runtime. Un tag de imagen móvil (`mongo:7`, Node 24) no es un digest reproducible. El funcionamiento observado no acredita soporte oficial de toda la combinación kernel/CPU/DB. Pinning, revisión de proveedores y dependencias quedan antes de Development/Production Gate según riesgo.

## Infraestructura compartida y recursos

| Recurso | Clasificación | Estado / acción en CP-001 |
|---|---|---|
| Vercel mecanet-web → mecanet.site | CANONICAL | Conservado; navegación de lectura |
| Vercel mecanet-app → app.mecanet.site | CANONICAL | Conservado; sesión existente y dashboard comprobados |
| Coolify proyecto Mecanet / mecanet-api | CANONICAL | Healthy; inspección SSH de lectura |
| Coolify mecanet-mongodb | CANONICAL | Healthy; sin puertos Mongo públicos; lectura de versión/estadísticas |
| Backups diarios en VPS y copia inicial local | CANONICAL / REPORTED | Configuración/primer backup del despliegue previo; no restore nuevo ni prueba RPO/RTO |
| Nexora y demás apps/bases del VPS | OUT OF SCOPE | Inventariados por consumo; no cambios |
| Proxy, Coolify, Postgres, Redis, realtime, sentinel | OUT OF SCOPE para cambios | Compartidos; consumidores a preservar |
| Atlas de la instalación local | OUT OF SCOPE | `.env` no leído ni cambiado; no base QA |
| Staging/QA SaaS | STAGING / pendiente | No creado; requiere Environment Gate |
| Vista local del mapa | TEMP / KEEP durante revisión | Solo documentación, sin publicación ni conexión a API de producción |

Snapshot del VPS: unos 8344 MiB disponibles; disco raíz 145 GiB, 132 GiB disponibles. API ~73 MiB, Mongo Mecanet ~91 MiB; otras dos bases ~1.23 GiB y ~675 MiB. Son mediciones puntuales sin tráfico representativo: no demuestran capacidad para 20 empresas ni aislamiento de recursos. Antes de modificar el host: presupuesto por servicio, umbrales de abort, consumidores, carga reproducible y rollback.

Topología `mecanet-rs` de un miembro y backup diario: **REPORTED** por el despliegue anterior y DEPLOYMENT.md. No se vuelve a consultar una URI ni se repite la configuración. Un miembro permite transacciones pero no demuestra alta disponibilidad ni tolerancia a pérdida del VPS.

## Git y trabajo preservado

- Rama de inicio/remota: `codex/deploy-vercel-coolify`, HEAD `f5afaa23c54c968be249231f18e212b2b43a0c82`.
- `origin/develop` remoto observado: `010aab670c638d168c971df3e3e53b97e72ff443`.
- PR #1 abierto, draft, destino develop; merge_sha=null. Checks de Vercel SUCCESS; no workflows CI propios versionados.
- Rama de adopción: `codex/saas-discovery`, creada desde el código publicado. Sin rama remota nueva ni push.
- Un archivo ajeno/preexistente no versionado: adjunto `Metodologia_Desarrollo_Software_Agentes_IA_v2.md`; preservado byte a byte. Copia exacta para trazabilidad en docs/methodology.
- Worktree previo `.kilo/worktrees/majestic-chiller` en `010aab6`, detached: conservado; no se inspecciona/modifica su trabajo.
- `.gitignore` excluía todo docs/. Se retiró solo esa exclusión para poder registrar el expediente exigido. No había docs preexistentes que destapar en este checkout.
- `.gitattributes` ya normalizaba Markdown/JSON/HTML a LF; se añadió LF para scripts del visor y una excepción `-text` para preservar la copia del Prompt byte a byte, también en Git.
- AGENTS.md, docs, .agentic y tasks no existían. No se sobrescribió planificación previa.

## Pruebas y UI

29 pruebas Node y 61 frontend (9 archivos) PASS, con DB simulada/API mock y sin iniciar la aplicación local. Se conservan salidas en E-04. E2E, pruebas de carga, migración, aislamiento de tenants y restore: NOT VERIFIED. Build del despliegue anterior: REPORTED; no nuevo build en CP-001.

UI real capturada el 2026-10-07: landing y dashboard de producción con sesión existente, sin errores/warnings de consola en esa carga. Capturas E-06. El dashboard vacío es un negocio existente, no administración SaaS. Su pantalla no certifica todos los módulos, mobile, contraste, lector de pantalla ni reduced motion; estos criterios quedan NOT VERIFIED para el producto.

## Registro de evidencia

| ID | Evidencia | Provenance | Entorno / SHA / fecha |
|---|---|---|---|
| E-01 | status, log, branch, worktree, remote, ls-remote y PR #1 vía gh autenticado SrEdgarR | LOCAL + PLATFORM-CONFIRMATION | GitHub/local; f5afaa2 y develop 010aab6; 2026-10-07 |
| E-02 | Archivos versionados, manifests/locks y lecturas de código; 14 modelos, 17 rutas, 19 páginas | LOCAL | f5afaa2; 2026-10-07 |
| E-03 | Búsqueda `tenant\|Tenant\|subscription\|Subscription\|stripe\|sentry\|Sentry\|organizationId\|businessId\|companyId` y lectura de auth/settings/transacciones | LOCAL | f5afaa2; 2026-10-07; alcance delimitado, no prueba exhaustiva de ausencia |
| E-04 | [Node](evidence/CP-001-root-tests.txt) / [Frontend](evidence/CP-001-client-tests.txt) | LOCAL | f5afaa2; Windows/Node 24.14.0; 2026-10-07 |
| E-05 | [Snapshot VPS](evidence/CP-001-vps.txt) | REMOTE | API f5afaa2; Linux aarch64; 2026-10-07 |
| E-06 | [Landing real](evidence/ui/current-public.jpg) / [Dashboard real](evidence/ui/current-app.jpg) | REMOTE | Navegador IAB; 2026-10-07 ~13:18 America/La_Paz; asociación con despliegue previo f5afaa2, el navegador no prueba por sí solo el SHA |
| E-07 | [Fuentes primarias](evidence/SOURCES.md) | VENDOR-DOCUMENTATION | Consultadas 2026-10-07; no equivalen a prueba de integración |
| E-08 | Respuestas del usuario en esta conversación; formalizadas en DECISIONS | HUMAN-ASSISTED | 2026-10-07; decisiones de producto, no resultados técnicos |
| E-09 | [Pruebas del mapa](evidence/CP-001-browser-checks.md), capturas móvil/escritorio | LOCAL | Visor documental CP-001; IAB; 2026-10-07; independiente de UI del producto |
| E-10 | [Índices de schemas](evidence/CP-001-index-inventory.json) | LOCAL | f5afaa2; sin conectar a DB (readyState=0); 2026-10-07; proyección, no capacidad medida |
| E-11 | [Revisión documental](evidence/CP-001-document-checks.md) y [manifiesto de hashes](evidence/SHA256SUMS.json) | LOCAL | Checkpoint documental, 2026-10-07; no reemplaza pruebas de producto |

Consulta riesgos y resolve-before en TECH_DEBT; el detalle del siguiente gate vive en ROADMAP y CHECKPOINTS.

## Revisión CP-002 — hosting y stack

- **LOCAL:** HEAD inicial real 614a74ce000dc43f1bb539f1a69a6db4c51364d7 en codex/saas-discovery; CP-001 existe con ese SHA. Único archivo previo sin versionar: Prompt original, conservado; worktree .kilo sin cambios. Único remote SrEdgarR/MECANET. Sin diferencias funcionales entre f5afaa2 y 614a74c.
- **LOCAL + REPORTED:** salidas anteriores de 29 tests Node y 61 Vitest presentes y asociadas a f5afaa2; no se ejecutan otra vez en CP-002. Ese tested_code_sha permanece, separado de base/checkpoint documental. Estado remoto de PR/CI/develop de CP-001 no se presenta como consulta nueva.
- **LOCAL:** web/ es HTML/CSS/SVG sin build ni package.json. client/package.json usa vite build, vite.config.js produce dist; Axios usa VITE_API_URL o /api. Dockerfile es API-only y .dockerignore excluye client/web; cambiar SERVE_FRONTEND no basta para empaquetarlos. Express tiene entrega estática opcional con fallback después de /api, pero detrás de limiter/logging global. JWT issuer/audience no dependen de Vercel.
- **LOCAL:** dependencias de proveedor concretas: client/vercel.json (build, rewrites, headers/noindex, caché assets), web/vercel.json (Static/headers/CSP), referencias VERCEL en autodetección/protección de scripts y documentación. VITE_API_URL es configuración genérica pública, no dependencia de Vercel. No aparecen SDK/Functions/Edge/Blob Vercel en manifiestos/consumidores revisados. No se leen .vercel ni secretos para inferir un inventario cloud nuevo.
- **REMOTE nuevo:** [CP-002-vps.json](evidence/CP-002-vps.json), 2026-10-07 18:07:48 UTC / 14:07:48 America/La_Paz. 11 contenedores healthy, API imagen f5afaa2, 2 CPU/aarch64, 11925 MiB totales/unos 8351 disponibles, sin swap, ~131 GiB de disco libre. API sin límites CPU/RAM explícitos, Mongo Mecanet limitado a 1 GiB. Todos en red coolify; separación entre proyectos no equivale a aislamiento de red. Metadatos filtrados, sin valores de variables ni contenido de DB.
- **REMOTE nuevo:** Node API 24.21.0, Mongo 7.0.43, kernel 7.0.0-1011-oracle, Docker 29.8.1, imagen Coolify 4.3.23. Solo observación de binarios/metadatos, no garantía de soporte total. Primer intento sin sudo no tenía acceso al socket Docker; se repitió con sudo -n de lectura. Sin cambios de permisos.
- **NOT VERIFIED:** build y frontend arm64, carga/picos/reemplazo, máximo efectivo de conexiones, aislamiento de redes, TLS/routing del nuevo destino, restore/copia externa/RPO-RTO. Snapshot de reposo no prueba estos criterios.
- **HUMAN-ASSISTED:** DEC-021/SC-001 aprueba destino; DEC-022/023 son mecanismos propuestos. No elimina Vercel existente ni altera Nexora. Topología Mongo y planes no aprobados por extensión.

Fuentes nuevas SRC-11…20 y revalidaciones en SOURCES. Diseño y reverse-impact en ARCHITECTURE_OPTIONS, sin duplicar una baseline definitiva. Recursos cloud creados/modificados por CP-002: **ninguno**. Visor local reutiliza la herramienta documental de CP-001; no es un despliegue nuevo del producto.
