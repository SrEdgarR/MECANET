# Revisión documental — CP-001

Fecha: 2026-10-07. Provenance LOCAL. Alcance: expediente/visor, sin cambio de código del producto frente a f5afaa2.

- Generación y `node docs/project-map/build.mjs --check`: PASS; 8 fases, 20 decisiones, 17 criterios; una sola fase EN CURSO. 14 decisiones APPROVED y 6 PROPOSED.
- Sintaxis de build.mjs/serve.mjs: PASS. No instalación nueva ni cambios en manifests/locks.
- Verificación de enlaces locales del expediente (excluye el adjunto inmutable y URLs externas): PASS, sin destinos inexistentes.
- HEAD HTTP local de mapa, auditoría, propuesta, índice, datos, documentos de fases, DEPLOYMENT y previews: 12 rutas únicas con 200.
- Rutas no documentales `/.env`, `/server.js`, `/package.json`, `/docs/project-map/serve.mjs`: 404. Comprobación mediante HEAD; no se leyeron secretos. Visor en loopback.
- Original/copia del Prompt: SHA-256 idéntico `d2dafd5f75df32aae33e421953fab6e99e723aa88744b918b555562c7b6a550d`. Se protege la copia contra normalización Git; revisar también el blob staged al guardar checkpoint.
- Escaneo acotado de nuevos documentos/visor/evidencia para claves privadas, URI Mongo con credenciales y tokens GitHub: sin coincidencias. No es una certificación exhaustiva de ausencia de secretos.
- Revisión de diff: solo expediente, protocolo y atributos/ignore documentales. Sin app, manifests/locks, DNS, contenedores ni datos. `git diff --cached --check` completo señaló cinco finales de línea con espacios: cuatro saltos Markdown del Prompt original y un campo TSV vacío al final de una línea del snapshot VPS. Se conservan como evidencia literal; no se edita el Prompt ni la salida remota para ocultarlos. La comprobación de whitespace sobre los archivos redactados, excluyendo esos dos artefactos literales, PASS. No se cambia la configuración global del chequeo.
- Últimas respuestas conciliadas: solo SaaS (Q-09 resuelta), presupuesto por definir y propuesta solicitada. No se repite una pregunta ya resuelta ni se transforma la propuesta en aprobación.

Evidencia del navegador en CP-001-browser-checks.md. Manifiesto SHA256SUMS.json cubre evidencia y copia del Prompt; excluye su propio contenido y los documentos/mapa derivados para evitar dependencias circulares. Los hashes del estado/roadmap/decisiones se incluyen directamente en PROJECT_MAP_DATA.json.

Límites: no prueba de integración SaaS, capacidad, seguridad completa, suficiencia legal ni segunda auditoría F14. Las páginas de proveedores se registran con fecha y alcance en SOURCES, sin afirmar contratación/capacidad a partir de ellas.
