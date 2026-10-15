# SC-011 — sustitución acotada del entorno inicial abortado

2026-10-14 / **CONFIRMED / APPROVED**, DEC-069. Fuente humana directa actual: «Apruebo SC-011», objeto exacto propuesto en82569344118307d0165912f11ddc94bd93d9ee2d. El PROPOSED anterior se conserva en CP-019/Git. No constituye otra aprobación A/B de P1-L3 ni modifica su snapshot protegido. El contrato funcional aprobado4d1cf193… y DEC-067/068 siguen vigentes.

## Hecho y límite exactos

[Ensayo real](../docs/evidence/cp019/remote-run.json): source/artefacto `f715cf86ce3874eb1f740e1ef16bc4fc6234edb5`/`sha256:c0505c1e63a90be9b25c72cbe544b0cc0f8420bf5bdbcc0039dbc89baeb6d110`, VPS ARM64,2026-10-14T06:16:49…58Z. Bootstrap/staging/publicación única del material PASS; generación TLS FAIL127 por ausencia del ejecutable OpenSSL en la imagen Node fijada. PostgreSQL, SQL, HTTP y restauración no iniciados. Cleanup PASS, un contenedor propio detenido y26 anteriores intactos. Roots/material/ledger/evidencia KEEP privados. No se acreditó insuficiencia de CPU/RAM/disco.

El caso `host-config-source` tiene límite45s desde su primer cargo y ya venció durante el diagnóstico. No se reinicia el caso, su reloj, sus contadores, ni se elimina o regenera el material final. La baseline§6 fija destinos exclusivos `r01/r01-target`; las variantes fresh§8 son de TARGET del mismo respaldo, aún inexistente. `protocol`/`custody` tienen whitelist cerrada de esa identidad. Un segundo origen requiere un cambio explícito de esos destinos; no es corrección de una representación factual ni una prueba ya ejecutada.

## Cambio aprobado — alcance exacto

1. Conservar `mecanet-qa-p1l3-r01`, `mecanet-qa-p1l3-r01-target`, sus dos raíces, material, ledger y evidencias originales como STOPPED/KEEP. Ninguna reutilización como prueba de recuperación ni como fuente del segundo intento; no copiar sus secretos.
2. Autorizar exactamente un nuevo origen `mecanet-qa-p1l3-r02` y destino `mecanet-qa-p1l3-r02-target`, raíces `/opt/mecanet-qa-p1l3-r02` y `/opt/mecanet-qa-p1l3-r02-target`. Sin selector arbitrario, regex ampliada o fallback a recursos existentes. Es una cohorte independiente, no un retry del material r01.
3. Mantener todas las cotas por escenario/cohorte:45s/140SQL/80HTTP; total30min/3000SQL/300HTTP/1000journal/2000artefactos; source/copy/target≤2GiB; agregado activo≤1CPU/2048MiB/60 conexiones. Publicar nuevo registro cerrado ANTES de crear recursos. El expediente conserva los1061 cargos de archivos del intento anterior; no se trasladan ni desaparecen. El consumo almacenado anterior se suma al footprint del host, aunque sus procesos estén detenidos.
4. Material r02 nuevo, generado una sola vez, con referencias/generaciones/credenciales propias. Ninguna apertura/pago/dato real ni modificación de restricciones de otra cohorte. Los reintentos de r02 conservan identidad y contadores; un nuevo aborto no autoriza otra cohorte por extensión.
5. Preparar TLS fuera del VPS, usando el helper corregido y un bundle privado ligado al namespace exacto. En el VPS el input propio debe ser root UID0/archivos0400/directorios0700, con cadena/SAN/pares de claves y hashes verificados antes de mkdir de QA. No instalar OpenSSL, cambiar imágenes, utilizar secretos ajenos ni hacer un build en el host. Revalidar con Python real del VPS antes de confiar en este preflight; las11 pruebas actuales son Windows/crypto local.
6. Repetir únicamente el intento L3 fallido y sus pruebas nuevas, usando código/artefacto corregidos y provenance propia. L1/L2, CP017 y sus29/29 productos no se reensayan ni alteran. Registrar el nuevo Environment Gate y las salidas físicas; ningún PASS procede de la aprobación de este cambio.

## Impacto y reversión

| Área | Cambio necesario después de aprobación | Garantía conservada |
|---|---|---|
| Baseline/estado | Enmienda de ejecución SC-011 en wrapper protegido; original hash4d1cf193… intacto | A/B integral L3 no se repite ni extiende a P2 |
| `server/saas/recovery/protocol.js`, `custody.js` | Identidad cerrada r02 y su binding exacto; conservar rechazo de otras cohortes | No adoptar r01, secreto o versión actual de SQL |
| QA `host`, ledger/registry, prepare/fixture/entry/worker, source/target/control/acceptance/copy/TLS | Reemplazo coherente del namespace de ejecución; hashes/configs/manifest ligados entre sí | Sin alias de escenarios/reset/perfiles nuevos/puertos públicos |
| Artefacto/CI/tests | Nuevo artefacto cerrado por Git blobs y build L3; negativas oldnamespace/mixedcohort | Auditorías completas estrictas, no defaults ni PASS físicos inventados |
| VPS | Preflight de raíces/redes/subredes/pins/CPU/RAM/disco/conexiones/consumidores y TLS antes de cada efecto | r01+26previos preservados; no Coolify/proxy/Nexora/EAK/DNS |
| Fases anteriores y futuras | Reverse-impact: L1/L2 intactos; P2 sigue pendiente de salida L3 y A/B propias; P3…P6 no cambian | No pagos/fiscalidad/operador/producción por extensión |

Aborto: detener sólo los CID propios positivamente identificados, conservar material/ledger/SQL/resultados/journal, sin borrar datos o restaurar encima del origen. No trasladar la aceptación a otra cohorte o bajar límites. La eliminación del contenedor fallido r01 no es requisito para r02; puede conservarse detenido.

## Gate y autorización necesarios

Q-32: aprobación SC-011/DEC-069 recibida; Quality/Environment/preflight frescos siguen necesarios antes del recurso. Q-35: completar seis criterios y review/rollback antes de Integration. No push/PR/CI remoto/merge mientras falten las salidas. El código r02 y los recursos se verifican por sus fuentes actuales; esta aprobación no acredita su creación o salida.

Razón explícita: [Prompt§5.1](../docs/methodology/Prompt_Maestro_v2.0.md) define SPEC CHANGE como cambio de una decisión aprobada y exige «solicita una aprobación explícita» antes de actualizar protegidos/implementar. La revisión independiente focal confirmó que sustituir el origen exclusivo y su whitelist cambia esa decisión; no se basa en un rótulo histórico SUGGESTED ni exige otra B por corrección del código L3.
