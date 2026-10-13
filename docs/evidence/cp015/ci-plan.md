# CP-015 — CI de contratos locales y frontend

**2026-10-13. DETECTED / implementación de CI local; ejecución GitHub NOT VERIFIED.**
El alcance autorizado en CP-015 permite tests, build y análisis sin despliegue. La
integración remota conserva su preflight separado: este workflow no demuestra que
las integraciones externas del repositorio sean inocuas ni permite activar QA.

## Archivos y límite

- [Workflow](../../../.github/workflows/p1-l1-verify.yml): `pull_request` hacia
  `develop` y `push` a `develop`/`codex/integrate-p1-l1`; `contents: read`, runner
  `ubuntu-24.04`, timeout diez minutos, checkout sin credenciales persistidas,
  sin secretos de producto, deploy, SSH, Docker, servicios externos o base de datos.
- [Runner](../../../scripts/ci/p1-l1.mjs): Node exacto24.21.0, lista explícita de
  quince archivos locales, ambiente hijo limitado a soporte del proceso y valores
  de prueba. No transmite variables de conexiones/secretos ni carga `.env`.
  Los tests usan `NODE_ENV=test`; el build fuerza `NODE_ENV=production`.
- [Configuración aislada del sanitizador](../../../scripts/ci/safe-documents.vitest.config.mjs):
  solo el test existente `safeDocuments.test.js`, jsdom y PostCSS sin plugins;
  `envDir:false`, sin setup heredado ni assets públicos. No cambia el sanitizador.

Acciones oficiales por SHA, referencias verificadas en la API pública del proveedor
el13oct2026: [checkout v6.1.0](https://github.com/actions/checkout/releases/tag/v6.1.0),
`d23441a48e516b6c34aea4fa41551a30e30af803`;
[setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0),
`949feb2413d6458794dcd2491c4babbbce0c15c1`. Ambas usan el runtime de acción Node24.
El workflow comprueba también npm11.9.0 y desactiva la caché automática.

## Evidencia local de esta ejecución

Entorno: Windows x64, Node24.21.0 portátil y npm11.9.0 ya acreditados. Worktree
propio de integración con checkout inicial `010aab670c638d168c971df3e3e53b97e72ff443`
y cambios aún sin commit al ejecutar. Fuente SaaS copiada de CP-014
`9fcdd9540848edbbdef1cfc94667491c9ab2ba92`; las correcciones selectivas del lock
realizadas por el agente principal se distinguen de esa fuente histórica. **No
atribuir estas pruebas al SHA inicial de develop como si contuviera el código.**
El runner de provenance informa checkout y limpieza; el commit probado se acreditará
separadamente después del commit y su verificación por el agente principal.

| Comprobación ejecutada | Resultado | Evidencia y límite |
|---|---|---|
| `npm ci --prefix server/saas --ignore-scripts --no-audit --no-fund` | PASS | 89 paquetes, sin lifecycle scripts |
| `npm ci --prefix client --ignore-scripts --no-audit --no-fund` | PASS | 391 paquetes; repetido tras el cambio selectivo del lock |
| `node scripts/ci/p1-l1.mjs test` | PASS | 73tests/15archivos,0fallos,17.9393543s; SQL/issuer/admisión dobles y HTTP loopback; no PG real |
| `node scripts/ci/p1-l1.mjs frontend` después del nuevo lock | PASS | 29tests/4archivos; buildproduction31módulos, sin `.env`; no navegador real |
| `node scripts/ci/p1-l1.mjs sanitizer` después del nuevo lock | PASS | 3tests existentes: markup escapado, contenido ejecutable eliminado/opener desconectado, CSV protegido |
| `python -X utf8 tests/qa/cp014/host-regression.py` | PASS | Tres comprobaciones puras AST/proyección, sin Docker, red o secretos |
| `node scripts/ci/p1-l1.mjs syntax` | PASS | 64archivos JS/MJS; JSX analizado por el build; no equivale a ESLint ni typecheck |
| `npm audit --prefix server/saas --omit=dev --json` | PASS | 0vulnerabilidades,89dependencias de backend; sin devDependencies en este paquete |
| `npm audit --prefix client --omit=dev --json` después del nuevo lock | PASS | 0vulnerabilidades en runtime; no cubre tooling |
| `npm audit --prefix client --json` después del nuevo lock | FAIL | 7paquetes afectados:5high/2moderate; no se silencia ni se eleva umbral |
| Workflow YAML/expresiones/actions, validador local | PASS | actionlint1.7.12 Windowsamd64, release/checksum oficial verificados; [workflow-check.json](workflow-check.json). Shellcheck/pyflakes no disponibles y excluidos explícitamente; no ejecución GitHub |
| Ejecución en GitHub/runner Linux | NOT VERIFIED | No push, PR, CI remoto ni merge efectuados por este agente |

El primer build del runner CI heredó accidentalmente `NODE_ENV=test` y produjo React
development; se detectó al comparar hashes y se corrigió únicamente el runner.
Los resultados finales de producción siguientes sustituyen esa salida errónea.

## Integridad del bundle después de la corrección selectiva

DOMPurify instalado3.4.16 y source-map-js instalado1.2.2 tras `npm ci`. Los tres
archivos resultantes son **byteidénticos** a `client/dist-saas` del checkout principal
conservado de CP-014; comparación local antes y después del patch:

| Archivo | SHA-256 final |
|---|---|
| `assets/saas-DsjAOXZI.js` | `846991792b1506d97706bca144f265874f79d17bba91d930dec4d45c3b7bbf04` |
| `assets/saas-DclqrR_W.css` | `cdb3b3885a4aea0c72204e0c7952eb8ebd7522c2767529eb824b487582d54159` |
| `saas.html` | `ab3c357852ca07b8f4689fb5b23a8ddb093ab2bb4e0aa2d75ba98012b132ee51` |

Lock backend SHA-256: `ee71de65fed14da54be916f00d239388d32cca896d6577870db619ad17bb80e0`.
Lock cliente tras corrección SHA-256: `c9b7676314befdd8857fb0272dd5c488805b82e2975f6e51ef60536ba8d7fdc3`.

Diagnóstico local Rollup con `build.write:false`, configuración SaaS y producción:
31módulos. DOMPurify, Tailwind, braces, chokidar, fast-glob, micromatch,
postcss-nested, postcss-selector-parser y source-map-js están ausentes del grafo
runtime emitido. Esta observación **no demuestra que los paquetes vulnerables de
tooling nunca se ejecuten**, ni es una excepción de audit; su evaluación sigue
pendiente. El builddiagnóstico no escribió ni publicó artefactos.

## Vulnerabilidades y gate

El primer audit completo encontró9paquetes afectados(6high/2moderate/1low). El agente
principal corrigió únicamente DOMPurify3.4.15→3.4.16 y source-map-js1.2.1→1.2.2 en
el lock; este agente no alteró package.json/locks ni aplicó `audit fix`.

Los advisories oficiales de DOMPurify
[GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p) y
[GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) afectan hasta
3.4.15 y fijan3.4.16 como primera versión corregida; el primero comienza en3.4.13.
La regresión del sanitizador verifica su uso real existente después del patch,
sin afirmar cobertura exhaustiva del advisory ni del POS.

El audit completo restante mantiene:

- **High:** braces/chokidar/micromatch/fast-glob/Tailwind,
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  braces≤3.0.3. No parche directo de braces acreditado; npm propone migrar Tailwind
  a4.3.3, cambio major que no se aplica silenciosamente.
- **Moderate:** postcss-selector-parser/postcss-nested,
  [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf),
  parser<7.1.6. La ruta Tailwind3 requiere una revisión distinta; no se fuerza major.

La superficie runtime y la de herramientas se informan separadamente. El workflow
ejecuta ambos audits y conserva el completo como **estricto**; `if:!cancelled()`
permite informar sus errores aunque falle un paso anterior, sin
`continue-on-error`. El conjunto no puede recibir PASS mientras quede ese FAIL sin
resolver o sin un triage/excepción explícitos y acreditados según§12. La ausencia
en el bundle y la configuración PostCSS inline son evidencia acotada, no un claim
de seguridad universal ni una aprobación del agente.

## Garantías que este CI no repite

No incluye PostgreSQL genérico del runner como sustituto de la fixture TLS/HBA/roles
18.6ARM64 acreditada. Las negativas de dosAPI, concurrencia durable, navegador real,
ciclo y recuperación física sintética permanecen en
[CP-014](../../audit/CP-014.md) y el [manifiesto](../cp014/runtime-manifest.json), con
los SHA originales y las comparaciones de componentes que verifique la integración.
El CI no puede atribuirse esos PASS históricos ni afirmar un reensayo completo del
artefacto F. No se cargan `/run/qa-secrets`, `.env`legacy o conexiones productivas.

QA del VPS, puertos, bases, proxy, DNS y demás aplicaciones: **ninguno creado,
arrancado ni modificado por este agente**. El bloqueo de audit y la seguridad de las
integraciones remotas no impiden revisar/testear documentación y candidato del
siguiente lote; tampoco autorizan su implementación.
