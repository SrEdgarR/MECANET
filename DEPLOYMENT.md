# Operación independiente de Mecanet SaaS

El objetivo aprobado DEC-021/054/058 es React, Express y PostgreSQL propios en el VPS, junto a Coolify, sin que Coolify administre Mecanet. Esta integración incorpora únicamente la fundación privada P1-L1, sus pruebas y documentación. No es un lanzamiento público ni una migración de datos reales.

## QA sintética verificada

El [runbook QA](tests/qa/README.md) identifica las cohortes, artefactos, presupuestos, preflight, reanudación y cleanup. Ambas cohortes CP-013/014 permanecen STOPPED/KEEP. La entrada ensayada utiliza HTTPS loopback, túnel SSH y socket UNIX propio; no requiere cambios en Traefik, DNS, puertos públicos o recursos de Coolify. No ejecutar `compose up` general ni reutilizar secretos de otro entorno.

La [auditoría CP-014](docs/audit/CP-014.md) contiene versiones, digests, garantías y límites de cada ensayo. Actualización, drenaje y rollback compatibles se realizan exclusivamente sobre el proyecto Compose propio; el rollback de código no revierte PostgreSQL ni los datos. Restore requiere el procedimiento de barrera y el destino aislado del [runbook de recuperación](tests/qa/recovery/README.md).

## Integración Git y entrada pública futura

La [preparación del Integration Gate](.agentic/P1-L1_INTEGRATION.md) distingue el código probado, checkpoint, PR, CI, merge y base siguiente. Publicar una rama no autoriza previews o despliegues externos: verificar primero los triggers de Vercel/Coolify y las políticas de GitHub. El workflow de verificación propio no contiene despliegue ni secretos productivos.

`mecanet.app` es el destino público futuro confirmado DEC-059; distribución landing/app/API y conexión HTTPS compartida siguen condicionadas a sus gates y permisos específicos. Conservar `mecanet.site`, sus subdominios, Nexora, Mecanet-EAK y todos los recursos existentes. El [diseño DEP-IND](.agentic/ARCHITECTURE_OPTIONS.md#dep-ind--despliegue-independiente-propuesto-cp-012) conserva la propuesta de entrada y sus límites; no ejecutar su integración pública por extensión.

Los archivos heredados de despliegue presentes en `develop` permanecen intactos. Los cambios de Vercel/Coolify del PR #1 se conservan únicamente en su rama histórica; no forman parte de esta integración SaaS.

## Construcción SaaS separada, SC-008

Con Node24.21.0/npm11.9.0 acreditados, `node scripts/ci/saas-toolchain.mjs verify` materializa una lista cerrada de fuentes en un directorio temporal propio, instala su lock sin lifecycle, verifica aislamiento/pruebas/build y ejecuta auditoría nativa completa y runtime. Solo después promueve los tres assets a `client/dist-saas` y limpia su staging. El manifiesto está en `scripts/ci/saas-toolchain`; no se usa `client/node_modules` heredado ni se carga .env.

Este comando no empaqueta, transfiere, publica o reinicia servicios. Cada recurso/release conserva sus gates y preflight; el artefacto QA histórico no se actualiza por un build local. La auditoría legacy FAIL sigue pendiente antes de utilizar su tooling. Revertir SC-008 vuelve a bloquear Q-43, sin rollback de datos. [DEC-060](docs/DECISIONS.md#dec-060--cadena-de-compilación-y-verificación-saas-propia) y [baseline](docs/specs/P1-L1.md#sc-008--cadena-saas-independiente-cp-016) fijan el alcance aprobado.
