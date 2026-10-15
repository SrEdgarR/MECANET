# Estado del proyecto — Mecanet SaaS

**CP-022 — PARCIAL, 2026-10-15. P1 única fase EN CURSO; L1/L2 TERMINAL, L3 EN CURSO.** SC014/DEC072 exacta APPROVED/aplicada a r03/r03-target; A/B y demás SC vigentes. Runtime7f5986f: **PostgreSQL18.6 ARM64 sí arrancó**; aborto posterior de recursos/CPU antes del esquema SaaS. Cleanup PASS, PG EXITED0/PID0/KEEP sin puertos;28 anteriores preservados, incluido r02 CREATED/UNKNOWN histórico. Ledger seq44:639 artefactos/0SQL del arnés/0HTTP/0journal; initdb interno se distingue de esas cifras. A1 PASS documental/local; A2…A6 e Integration NOT VERIFIED. Quality local PASS:415 Node fresh67f9c44 y395 Python por unión393−29+31. Correctivo del monitor sólo local, sin alterar la evidencia física. Environment entrada PASS/ejecución FAIL.72 DEC,14 pendientes: Q32/Q35 BLOCKING y12 FUTURE. Q32: falta contrato de reentrada tras vencer el caso START45s; no reset/alias/r04. Q35: faltan salidas físicas. Sin push/PR/CI/merge, P2 funcional o cambios productivos/compartidos. [Auditoría CP-022](audit/CP-022.md), [matriz](evidence/cp022/matrix.md) y [causa raíz/continuación](evidence/cp022/root-cause-and-continuation.md).

Antecedente CP-021 — resultado parcial, 2026-10-15: P1 única fase activa y L1/L2 TERMINAL conservados. A/B DEC-067/068 y SC-011/012/013 APPROVED. Presupuestos aplicados: SQL8192/caso y200000 global; artefactos2000/caso y8192 global;135 escenarios y demás límites intactos. Controlador integral/proveedor de variantes implementados y verificados localmente; [Quality local](evidence/cp021/local-quality-close.json) PASS por unión trazada, sin aceptación física. r02 abortó antes de START de PostgreSQL: primer CREATE incompatible con CLI; continuación externa con mismo material/ledger/reloj falló al interpretar tmpfs en estado CREATED. Cero SQL/HTTP/restore/navegador de la aplicación. Un PG propio CREATED/INACTIVE/KEEP sin puertos ni referencia final; cleanup FAIL/UNKNOWN1 conservado.27 consumidores previos intactos. Ventanas originales agotadas, sin reset o tercera cohorte creada. SC-014/DEC-072 sólo SUGGESTED para r03, pendiente de aprobación específica. A1 PASS documental/local, A2…A6 e Integration NOT VERIFIED; Q32/Q35 BLOCKING y12 FUTURE. Sin push/PR/CI remoto/merge, P2 funcional o cambios en producción/servicios compartidos. [Auditoría CP-021](audit/CP-021.md).

Antecedente CP-020 — resultado parcial, 2026-10-15: P1 única fase activa; L1/L2 TERMINAL conservados. P1-L3 A/B DEC-067/068 y SC-011/DEC-069 APPROVED; sin nueva A/B por corte. **Quality local PASS por unión trazada**, código dd7dc0d303e0bacff354c8e6b70a8df1c2b191c2; corrida completa600/600 Node en e6ac802 y deltas21/21 Node/25/25 target-host sobre el código final, con FAIL inicial preservado. Nueve imports Git pasivos PASS,3assets/28inputs exactos y auditorías completas/runtime SaaS/backend0. **Environment FAIL por inviabilidad SQL140/3000**: mínimo principal3298 y caso679 antes del fondo. SC-012/DEC-070 **SUGGESTED / NOT APPROVED**,8192/caso y200000 global; no aplicado. r02 NO INICIADA/0recursos/0ledger; sin PG/HTTP/GUI/restore r02. A1 PASS documental/local; A2…A6 e Integration NOT VERIFIED, L3 EN CURSO. Q-32/Q-35 BLOCKING y12FUTURE;70DEC. Producción/compartidos/Nexora/EAK/DNS/Prompt/CP017 preservados; no push/PR/CI remoto/merge. Proveedor físico de variantes y publishers pendientes antes QA; no controlador integral listo. [Auditoría CP-020](audit/CP-020.md).

Antecedente CP-019 — resultado parcial, 2026-10-14: **A DEC-067/B DEC-068 APPROVED** exactas de P1-L3 v0.2-CP018/hash4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec/cace66cd34dbad31d480bef8f902bd71effbc0b1; no otra A/B por corte. SC-010/DEC-065/066 aprobadas en ese alcance. P1 única activa; L1/L2 TERMINAL, P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. Código SQL006/runtime/protocolo/custodia/journal y controladores privados implementados y en verificación local; **A1 PASS documental/local, A2…A6 NOT VERIFIED de salida**. QA r01 real abortó TLS127 antes de PostgreSQL por OpenSSL ausente en el Node fijado; bootstrap/staging/material PASS, Environment global **FAIL**. Cero SQL/HTTP/browser/restore; dos raíces/dos tools creados, uno retirado tras FIN positivo y uno STOPPED/KEEP;26 consumidores anteriores intactos. TLS corregido localmente, ningún reset/secret nuevo/reintento remoto. Q44/Q45 resueltas;14 pendientes únicos:2 BLOCKING(Q32/35),12 FUTURE. SC-011/DEC-069 **PROPOSED**, pareja sucesora r02 con mismos límites y conservación del intento, aprobación pendiente por identidad exacta protegida. No push/PR/CI remoto/merge; base canónica86985fe7589032f202ebf0cb057a9b1384217151 revalidada en GitHub. Producción/compartidos/Nexora/EAK/DNS/Prompt/CP017 intactos. Próximo gate: cambio QA acotado + Quality/Environment frescos y salidas físicas; no apertura o P2 funcional.


Antecedente CP-018 — preparación de P1-L3, 2026-10-13: base canónica real `86985fe7589032f202ebf0cb057a9b1384217151` verificada local/remoto, PR #3/#4 MERGED y CI final SUCCESS. P1 única fase activa; L1/L2 TERMINAL conservados, P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. [Candidato único L3](../.agentic/P1-L3_CANDIDATE.md) v0.2-CP018 SUGGESTED/NOT APPROVED; A y B pendientes. Design/F14 PASS documental limitado; seis salidas funcionales NOT VERIFIED. Sólo documentos y modelo puro local: ningún código funcional, recurso QA L3, nueva restauración o cambio compartido. Próximo paso: aprobar A exacta/B diferenciada del candidato revisado; Development/Environment y preflight antes de código/recurso. [Expediente CP-018](audit/CP-018.md).

Antecedente CP-017 — cierre del mismo checkpoint, 2026-10-13: **P1-L2 TERMINAL**, doce criterios PASS e Integration Gate PASS; P1-L1 TERMINAL conservado. P1 única fase EN CURSO, P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. Baseline completa v0.2-CP016/DEC-061 y B diferenciada DEC-062, snapshot ca975dc822c0bd5e872d3debe824abc536f662007513170f327727878ff3ac71; base de implementación L2 a0098178fc27467bf4c12da0e97723e0b80ce683. Cierre documental en codex/cp017-close sobre develop7ff9a6c41060e186c8e8c6ce475957c53d40de38. Catorce pendientes FUTURE, cero BLOCKING; Q-35 conserva sólo garantías posteriores/reapertura fuera de L2. P1-L3 SUGGESTED/NOT APPROVED, sin A/B ni implementación. Sin lanzamiento público, datos reales o cambios compartidos.

[Integración acreditada](evidence/cp017/integration.json): [PR #3](https://github.com/SrEdgarR/MECANET/pull/3), head `df9219a202542fca173ffba25fe8d523b40e54cb`, merge/develop `7ff9a6c41060e186c8e8c6ce475957c53d40de38`, fusionado2026-10-13T23:05:36Z. [CI push](https://github.com/SrEdgarR/MECANET/actions/runs/38481922405), [CI PR](https://github.com/SrEdgarR/MECANET/actions/runs/38481927763) y [CI canónica](https://github.com/SrEdgarR/MECANET/actions/runs/38482079889) SUCCESS. Checkout real push df9219a202542fca173ffba25fe8d523b40e54cb, PR synthetic merge3bd4dcbe6b44fc78ede161c5b82fc9d640400198 con tree igual al head df9219a, canónica7ff9a6c41060e186c8e8c6ce475957c53d40de38; no se atribuye el checkout del PR directamente al head. Primer checkpoint de aceptación `c7335f9bc24b68b578c2a165bbab341962fa6854`; cierre posterior dentro de CP-017, SHA documental final identificada externamente, sin autorreferencia. [Corrección CI](evidence/cp017/ci-correction.json) conserva primeras ejecuciones255PASS/3FAIL y checkout limpio RED12/15→GREEN15/15; sólo fixture mkdtemp/tmpdir, sin cambiar producto8199 ni helpers/runtime QA2b0. Suite completa258PASS y peer de fixture0 REQUIRED; no se reetiquetan los FAIL iniciales.

Registro histórico CP-017:14 pendientes únicos FUTURE,0 BLOCKING; Q-35 resuelve salida e Integration Gate L2 y conserva sólo garantías posteriores, sin otra A/B genérica. Canonicalización de2b0 PASS acotada:14 HTTP/79 SQL, B preservado/readiness global503 esperada. Restore de tres fases PASS:20 resultados antes/después,40 writers antiguos/6 sesiones antiguas/18 credenciales antiguas rechazados y18 nuevas verificadas; generación90d78c7c-9efd-437e-844a-a134ce84e514 CLOSED, sin reapertura. Doce criterios e Integration Gate PASS; P1-L2 TERMINAL limitado, sin declarar SaaS general listo.

[Cleanup CP017](evidence/cp017/cleanup.json) PASS:6 contenedores propios STOPPED,20 consumidores ajenos intactos, datos/copias/journal KEEP, túnel propio4312 detenido y18443 cerrado. P1-L3 sólo [candidato](../.agentic/P1-L3_CANDIDATE.md) SUGGESTED/NOT APPROVED; ninguna A/B o implementación siguiente.

[Matriz final](evidence/cp017/matrix.md), SHA-256 `930d208a8f64f8a344251fb271bc2df89595204b8a29823d29184b000a423d0d`, registra doce PASS de aceptación limitada e Integration Gate PASS por fuentes separadas. [Review consolidado](evidence/cp017/review-consolidated.json):0 críticos/0 REQUIRED abiertos. [Quality local](evidence/cp017/quality-local.json) PASS:258 contratos/134 sintaxis/55 UI/3 sanitizador/4 preload, auditorías completas SaaS/backend0 y assets idénticos; cleanup PASS. Esta unión conserva cada fuente y los FAIL históricos; no acredita SaaS general o reapertura; CI remota acreditada separadamente en integration.json por checkout real.

Revisión CP-016, 2026-10-13: P1-L1 TERMINAL, ocho salidas PASS y Integration Gate PASS con [PR #2](https://github.com/SrEdgarR/MECANET/pull/2), head `04c5d41299bffc15e201c168677079809feb6a0f`, merge/develop `a0098178fc27467bf4c12da0e97723e0b80ce683`; [CI push](https://github.com/SrEdgarR/MECANET/actions/runs/38440714202), [CI PR](https://github.com/SrEdgarR/MECANET/actions/runs/38440720838) y [CI develop](https://github.com/SrEdgarR/MECANET/actions/runs/38441611717) PASS. Código local probado `0d8285cef117d6174a6053f18ceaac180f8aa1c5`; evidencia remota por sus SHA propios. Q-42/Q-43 resueltas para la lane aprobada; legacy audit FAIL/TD-21 conservado. P1 única fase EN CURSO; P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. P1-L2 v0.2 candidato revisado, A/B pendientes y doce salidas funcionales NOT VERIFIED. Sin despliegues o recursos de infraestructura modificados.

## Estado global

| Campo | Valor |
|---|---|
| project | Mecanet SaaS |
| active_phase | P1 |
| active_phase_name | Fundación aislada y operable |
| status | EN CURSO |
| last_updated | 2026-10-15 |
| next_gate | Q-32: contrato seguro de reentrada tras aborto CPU/caso host-pg-start vencido y nuevo Environment pertinente; Q-35: seis salidas físicas; luego integración condicional antes de TERMINAL |
| readiness_scope | L1/L2 TERMINAL; L3 APPROVED v0.2-CP018 limitado, implementación en curso; SaaS general NOT APPROVED |
| progress_basis | Estado cualitativo, sin porcentaje. P1-L1 TERMINAL/ocho PASS e Integration PASS; P1-L2 TERMINAL/doce PASS e Integration PASS. P1 general EN CURSO, SaaS general NOT APPROVED |
| implementation | CP022: bindings cerrados SC014/r03, preflight/CREATE/tmpfs/CID y controlador QA verificados; PostgreSQL inició físicamente. Correctivo posterior del resumen del monitor sólo local; SHA67f9c448a3e56b7040e3f937a4e1b17588373d97 con415 Node nuevos/31 monitor, separado del runtime7f5986f |
| current_checkpoint | CP-022 PARCIAL: Quality local PASS; entrada Environment acotada PASS, ejecución r03 FAIL por RESOURCE_CPU_LIMIT tras iniciar PG; A1 documental PASS/A2…A6 NV; checkpoint final identificado externamente |
| hosting_target | CONFIRMED DEC-021/SC-005: VPS existente, operación propia independiente de Coolify; PostgreSQL DEC-054. Dominio futuro mecanet.app DEC-059/SC-007 |
| hosting_execution | r03: raíces/material propios, una red Source-data interna y un PostgreSQL EXITED0/PID0/KEEP sin puertos tras cleanup PASS;639 artefactos/seq44/0SQL del arnés/0HTTP/0journal;28 anteriores intactos. r02 CREATED/UNKNOWN conservado; ninguna infraestructura compartida modificada |

## Readiness

| ID | Gate | Estado | Evidencia / pendiente |
|---|---|---|---|
| R-01 | READY FOR SPECIFICATION | PASS | Adopción y dirección registradas; no cierre de especificación general |
| R-02 | Specification Gate del lote | PASS | Baseline L3 exacta DEC067/068 y SC011/012/013/014 APPROVED en su alcance exacto; snapshot intacto y SaaS general no aprobado |
| R-03 | Design Gates del lote | PASS | Diseño/F14 CP018 del objeto exacto conservados. SC014 aprobada sólo para r03; diseño no acredita salidas físicas y Q-32 mantiene el contrato de reentrada pendiente |
| R-04 | READY FOR DEVELOPMENT L2 histórico | PASS | DEC-062 autorizó B/QA propia; doce criterios e Integration PASS, P1-L2 TERMINAL. Evidencia L2 conservada, sin transferirla a L3 ni producción |
| R-05 | READY FOR PRODUCTION | NOT VERIFIED | No producto SaaS completo, pagos/fiscalidad, capacidad, custodia externa, operación ni autorización de corte públicos |
| R-06 | F14/Design Gate documental P1-L3 | PASS | Objeto4d1cf193… completo/review CP018; A exacta DEC-067 recibida. Ningún PASS físico por aprobación |
| R-07 | Development Gate local P1-L3 | PASS | Baseline protegida DEC-067/B DEC-068, worktree/Node24.21/npm11.9/locks propios conocidos; entorno suficiente para código/contratos locales. Environment QA separado por recurso |
| R-08 | Environment QA P1-L3 | FAIL | CP022: entrada acotada PASS, PostgreSQL r03 inició; ejecución FAIL RESOURCE_CPU_LIMIT, cleanup PASS/28 previos intactos. Caso host-pg-start vencido; reentrada segura NOT VERIFIED, sin reset o nueva cohorte |

## Trazabilidad

| Campo | Valor |
|---|---|
| base_sha | 86985fe7589032f202ebf0cb057a9b1384217151 — canónica develop, revalidada sólo lectura15octubre CP020; base del alcance L3 |
| research_head_sha | 2a3ca97a5353b078bfd6494c00479ea3e02d8d9c — entrada CP022 conservada; no nuevo descubrimiento general |
| tested_code_sha | 7f5986f01c1cce8c35ba3e9635d9001523da0bc8 —415 Node/393 Python locales y ejecución física hasta PG START/aborto CPU. Correctivo posterior del monitor31 pruebas locales, unión395 Python; SHA local posterior67f9c448a3e56b7040e3f937a4e1b17588373d97,415 Node nuevos, sin reatribuirle la ejecución física |
| historical_tested_code_sha | 0d8285cef117d6174a6053f18ceaac180f8aa1c5 — SC-008/L1 local; código/QA de CP-013…016 conservan sus propios SHA |
| qa_artifact_sha | 7f5986f01c1cce8c35ba3e9635d9001523da0bc8 — runtime/controlador r03 sellados; no sustituidos tras aborto. ca15ed9/79fab18 de r02 conservan fuentes históricas en CP021 |
| qa_artifact_digest | Consultar evidencia cp022/upload.json e índice Git de cp022/git-artifact-smoke.json por sus hashes exactos; artefacto r03 de7f5986f. El índice490abc1b…/tar d39dca11… son exclusivamente r02 histórico |
| qa_controller_sha256 | Consultar plan/hash de publicación en cp022/upload.json; helpers r03 de7f5986f. Plan ca6b57c0… y extensión571c19d4… pertenecen exclusivamente a r02 y permanecen intactos |
| historical_qa_controller_sha | 409880a513bee1eff909caf68d23325af55e9be4 — cierre QA CP-014, sin reatribuirlo a CP017 |
| experimental_test_reference | CP-006/010 históricos no repetidos ni atribuidos a PostgreSQL; las90 pruebas Mongo f5afaa2 no prueban este lote |
| HEAD | Resolver git rev-parse HEAD en cada worktree; checkpoint final no se escribe en su propio commit |
| checkpoint_sha | CP022 documental final identificado externamente después del commit; no autorreferencia. Snapshot aprobado cace66cd34dbad31d480bef8f902bd71effbc0b1 intacto |
| approved_head_sha | cace66cd34dbad31d480bef8f902bd71effbc0b1 — objeto P1-L3 completo v0.2-CP018/hash4d1cf193… A DEC-067; B DEC-068 diferenciada. L1/L2 snapshots intactos |
| historical_approved_head_sha | 3b387b38784907b67e2209a35c3d5f400d70742e — solamente S-18/manifiestoL-01/ocho cortes L1 por DEC-058 |
| merge_sha | 7ff9a6c41060e186c8e8c6ce475957c53d40de38 — PR #3/L2,2026-10-13T23:05:36Z |
| current_main_baseline_sha | 86985fe7589032f202ebf0cb057a9b1384217151 — PR #4/cierre L2 y CI develop38483733526 SUCCESS, verificado CP018 |
| next_phase_base_sha | 86985fe7589032f202ebf0cb057a9b1384217151 — canónica de entrada; CP018 documental conservado, CP019 local pendiente integración |
| local_branch | codex/p1-l3, worktree p1l1-integration aislado desde checkpoint cace66cd34dbad31d480bef8f902bd71effbc0b1 sobre develop86985fe; primario preservado |
| remote_branch | codex/p1-l3 no publicada todavía; develop86985fe canónico. PR/CI/merge condicionados a salidas y ausencia de despliegues accidentales |
| worktree | Primario fuente/planning y C:/Users/thede/.codex/worktrees/p1l1-integration/MECANET-develop; .kilo/worktrees/majestic-chiller conservado |
| integration_target | develop; [PR #3](https://github.com/SrEdgarR/MECANET/pull/3) MERGED head df9219a202542fca173ffba25fe8d523b40e54cb→merge7ff9a6c41060e186c8e8c6ce475957c53d40de38, head/merge tree iguales; CI canónica SUCCESS. L1 [PR #2](https://github.com/SrEdgarR/MECANET/pull/2) conserva su evidencia histórica |
| CI | CP022 sin CI remota/push/PR/merge: matriz de seis salidas aún incompleta. Quality local por sus SHA; historial CP016/017 conserva checkouts propios |

## Quality local histórica CP021

[Unión local final](evidence/cp021/local-quality-close.json): pruebas QA Node/Python con entradas y commits explícitos; pruebas de temporales/modelos, sin PostgreSQL/HTTP/restore reales. Las correcciones del controlador posteriores a r02 no se publicaron en el VPS. Tres assets y28 entradas UI/locks conservados; auditorías anteriores propias0 se reutilizan sólo por identidad de archivos, legacyTD21 conserva FAIL. [Preservación](evidence/cp021/preservation-local-final.json) acredita snapshots, Prompt, primary y .kilo.

## Quality local histórica CP019

Quality local por unión trazada: 496/496 contratos Node y 184 sintaxis en1770261c815d36e3c3575dfc29637adfa504b59d; controles afectados del correctivo `64e647e3b3e95f5559d32ed9bb84bfe962e08496` PASS, con reuso por hashes. 59 host/11 TLS reutilizados y 5 artifact Python reejecutados; seis fuentes Python cubiertas por original+delta. Backend full/runtime audit0 reutilizados con locks intactos. UI59/sanitizador3/guard4/full y runtime audit0 del build canónico nuevo. Ningún PASS PostgreSQL/HTTP/browser/restore. [Reporte](evidence/cp019/local-final.json). Quality integral/salidas L3 siguen NOT VERIFIED; wiring de host incompleto y Environment FAIL.

## UI actual

CP019: GET histórico propio mantiene result.dataEpoch original bajo envelope/contexto vigente. Regresión focal19PASS, frontend59/sanitizador3/guard4/auditorías0 y build propio porhashes en evidence/cp019/ui-canonical-assets.json. Browser de recuperación, responsive/a11y/reducedmotion y capturas de esos assets **NOT VERIFIED**; no reutilizar como PASS las pruebas CP017 sobre otrosbytes.

CP-017: [navegador privado](evidence/cp017/browser.md) sobre producto `252b089343ccb5d91c0cd111471c69c4371c8924` obtuvo20 checks/56 HTTP y seis escenarios320/768/1440×100/200%. Alta sin precio, recepción, historial, clave/ACK perdido, permisos y foco se verifican sólo en ese recorrido. Assets finales: HTML `c7687b27d7359c17eb49d1ea13ba54c46228152d48cfda32e9e16447157bd4b2`, JS `bd0a3ceeeb89aa8bc145432269820613b907eb97f35221be94183f21a1e78d9d` y CSS `ad6fe416fc0d157c3b762c9ff580c962178d3ddeb5cc2e5c3af6d516bbe0ca27`; no auditoría global ni reensayo completo sobre 2b0.

| ID | Módulo | Fidelidad | Verificación | Preview | Evidencia |
|---|---|---|---|---|---|
| UI-01 | Landing pública existente | IMPLEMENTED | VERIFIED: carga y contenido; no auditoría responsive/a11y completa | evidence/ui/current-public.jpg | E-06 · REMOTE · 2026-10-07 |
| UI-02 | Dashboard POS de un negocio | IMPLEMENTED | VERIFIED: sesión existente y carga sin errores; no prueba de todos los flujos | evidence/ui/current-app.jpg | E-06 · REMOTE · 2026-10-07 |
| UI-03 | Resto de módulos POS | IMPLEMENTED | NOT VERIFIED de extremo a extremo en CP-001 | — | E-02 código; tests aislados E-04 |
| UI-04 | Landing con planes y checkout | PENDING | NOT VERIFIED; no implementada | — | SAAS_DISCOVERY |
| UI-05 | Panel operador multiempresa | PENDING | NOT VERIFIED; no implementado | — | SAAS_DISCOVERY |
| UI-06 | Suscripción/autoservicio | PENDING | NOT VERIFIED; no implementado | — | SAAS_DISCOVERY |
| UI-07 | Demo gratuita limitada | PENDING | NOT VERIFIED; registro/email/1activa/3inicios24h/30min/10-5-10 confirmados; mecanismo comercial no implementado | — | DEC-025/027; SAAS_DISCOVERY |
| UI-08 | Login, empresa y catálogo QA ficticio | IMPLEMENTED | VERIFIED limitado: browser15 en CP-014/C, 320/768/1440, teclado/foco, radio0, tema, texto200% y reduced-motion; reintentos/deadlines con regresión local, sin auditoría a11y completa | evidence/cp014/catalog-1440.png | CP-014 · LOCAL + REMOTE · Ce25a9f3; frontend idéntico D/E/F |

Objetivo CONFIRMED DEC-055: UI totalmente cuadrada, sin bordes redondeados; NCF/e-CF CONFIRMED DEC-056 en el alcance SaaS. UI privadas L1/L2 implementadas dentro de sus baselines; NCF/e-CF fuera del lote. Sistema visual heredado DETECTED: landing CSS estático; POS React/Tailwind, estilos glass y temas claro/oscuro. El resto de UI Q-31 permanece candidato sin aprobación global. Responsive/foco y demás comprobaciones se limitan a UI-08 y al recorrido L2 del párrafo previo por sus propias fuentes; accesibilidad completa y resto del producto NOT VERIFIED. El mapa documental tiene verificación separada de la UI del producto.

## Resultado histórico CP-011

**RG-001/DEC-053 APPROVED y aplicado**, fuente humana directa adjunto51b8e835-d246-41a7-8f4c-f54901984f96/Texto pegado.txt. Acepta orden limitado y riesgo de ajustes comerciales posteriores; no baseline/implementación/paquetes completos/proveedores/políticas/gastos. Q-40 resuelta sin otra DEC.53decisiones:48APPROVED,2PROPOSED,3SUPERSEDED.

**Candidato limitado listo para revisión:** [S-18 P1-L1 v0.1-CP011](../.agentic/SPECIFICATION_CANDIDATE.md#s-18--candidato-limitado-p1-l1-v01-cp011), dentro del contenedor general v0.11-CP011, ambos NOT APPROVED. Manifiesto selectivo contra Git4b2f272, sin incorporación transitiva del resto del SaaS. Ocho cortes conservados: identidad→empresa→catálogo ficticio, conexiones/admisión entre dosAPI/observación local/rutas/restore sintético. Sin pagos/fiscalidad/escritoresPOS/servicios reales ni bypass para empresas reales.

**F14-L1 de coherencia PASS y Quality Gate PASS:** candidato limitado listo para presentar A/B. F14 global sigue PARCIAL. A aprueba únicamente versión/fragments del lote; B autoriza implementación futura solo con gates/entorno del corte satisfechos. Ninguna registrada por anticipado. No se exige antes de implementar que funciones aún inexistentes pasen sus pruebas.

**Entorno CP-011 LOCAL:** comprobación dirigida2026-10-08: wsl.exe está presente pero --status informa no instalado(exit1); Docker no encontrado en PATH/ubicacionesProgramFiles/usuario, sin procesos/servicio. No endpointLinux efectivo acreditado ni daemon externo contactado. Acción humana mínima: habilitar/instalar WSL2 y Docker Desktop Linux, aceptar condiciones y completar reinicio si corresponde; agente valida endpointlocal/engine/versiones/recursos después. Sin instalación, aceptación, reinicio ni experimento nuevo ahora.

**Historia reutilizada:** QA-EXP-02 CP-010, Mongo8.3.11Windowsx64/Node24.14/driver6.20,8PASS ycleanup. No targetMongo7.0.43/Node24.21/LinuxARM64, integraciónMecanet/dosAPI/restore demostrados.90tests f5afaa2 yCP-006 no se repitieron. Sin nuevo tested_code_sha.

**14pendientes:5BLOCKING de entrada L1 y9FUTURE con límites;5humanas/4diseños/3evidencias/2externas.** Q02/11/31 pertinentes quedan dentro de decisiónA, Q36 separaA/B yQ32 entorno. Q33 global conserva revisión futura, con lote evaluado separadamente. Q03/38 antes de código/publicación dependientes, Q18 posibleP2, Q08/39 antes de egreso, Q23 antes de gasto, Q34/35 medición y salidas por fase. Ninguno se convierte enNOTAPPLICABLE por estar fuera deL1.

Recursos/infraestructura creados o modificados: **ninguno**, tampoco instancia temporal nueva. Sin código funcional/configuración ejecutable/dependencias/secretos/datos reales, cambiosremotos, gasto, cuenta/contacto/envío,push/merge/CI/despliegue. Producción/Nexora/otrasapps/worktreeprevio yPrompt conservados.

Siguiente paso: revisar el checkpoint limitado y resolver juntas pero diferenciadas **A**(especificación exacta) y **B**(implementación condicionada); acreditar entorno antes del trabajo dependiente. No repetir cuestionario comercial o diagnóstico/prueba ya resueltos sin cambio concreto.

## Resultado histórico CP-012

SC-005/DEC-021 elimina a Coolify de la administración de Mecanet; SC-006/DEC-054 sustituye motor por PostgreSQL conservando separación/mínimo privilegio de DEC-012. DEC-055/056 confirman UI cuadrada y NCF/e-CF con fuente humana actual, sin fecha histórica inventada. DEC-057 registra B condicional y posible QA aislada; A del diseño adaptado no concedida. 57 decisiones:52APPROVED/2PROPOSED/3SUPERSEDED; Compose/origen propuestos.

[S-18 P1-L1 v0.2-CP012](../.agentic/SPECIFICATION_CANDIDATE.md#s-18--candidato-limitado-p1-l1-v02-cp012), contenedor v0.12, reemplaza la propuesta Mongo. Ocho cortes preservados. Diseño relacional/recuperación/operación propia concretos; ningún PASS de Mongo o Coolify transferido. F14-L1 de coherencia PASS en12criterios tras revisión independiente y QG, separado de A, entorno y readiness global.

[Entorno CP-012](evidence/CP-012-environment.json): VPS Ubuntu24.04.5/ARM64, Docker29.8.1/Compose5.5.1,2CPU,11925MiB RAM,8397MiB disponible y133GiB libres en snapshot. Diez contenedores existentes; Traefik3.6 ocupa80/443, PostgreSQL15 corresponde a Coolify y no se reutiliza. Recursos casi todos sin cuotas; snapshot no acredita capacidad. Firewall leído: UFW ausente, cadenas Docker y políticas IPv4/IPv6 separadas; NSG/alcance externo/aislamiento QA no verificados. Volúmenes/reinicio/persistencia observados; backups no leídos ni recuperación probada. Ningún recurso Mecanet-EAK inequívocamente identificado: todos preservados.

Local: Docker/psql no disponibles en búsqueda dirigida, WSL no instalado, Node24.14. QA remoto privado es alternativa autorizada bajo gates; no se impone instalación Windows ni se usa el PostgreSQL compartido como sustituto. Propuesta QA por127.0.0.1:18443/túnelSSH/TLSpropio, redes/volúmenes/credenciales propios. HTTPS de dominio futuro exige integración específica con proxy y permiso aparte, no la administración de deployments por Coolify.

15 pendientes:5BLOCKING/10FUTURE. Q36 conserva solo A como aprobación de entrada pendiente; B condicional documentada. Q41 localiza permiso/integración HTTPS compartida antes de modificarla, no bloqueo del QA por túnel. Q02/11/31 quedan en A, Q32 acredita entorno por corte. Q18 conserva NCF/e-CF en alcance y debe resolver detalles antes del primer código fiscal; demás comerciales/externos mantienen sus límites.

Código realmente implementado: ninguno. Pruebas PostgreSQL/integración/build/restore: ninguna; solo diagnóstico y revisión documental nuevos. Instalación QA: no realizada por falta de A y preflight efectivo. Recursos de infraestructura creados/modificados: ninguno. Producción/Nexora/Mecanet-EAK, secretos/datos y Prompt intactos. Próximo paso: aprobar candidato exacto; B ya recibida permite avanzar al preflight y corte cuando gates se acrediten. No repetir descubrimiento ni pedir de nuevo decisiones de producto.

## Resultado histórico CP-013

**Ocho cortes implementados; tres salidas verificadas y cinco parciales.** P1 única activa; P0 general PARCIAL, SaaS general NOT APPROVED. Los conteos de tests no sustituyen contratos de salida. [Auditoría completa](audit/CP-013.md) y [operación QA](../tests/qa/README.md).

| Corte | Implementación | Verificación de salida | Evidencia / límite |
|---|---|---|---|
| L1.1 | Implementada | PASS acotado | Fixture exclusiva/preflight/roles/canarios/cleanup propio; datos sintéticos preservados explícitamente |
| L1.2 | Implementada | NOT VERIFIED / PARCIAL | SQL11 y HTTPlogout pasan; faltan carreras logout/rotación/save tardío entre dos API y fallo registro/store/cookie |
| L1.3 | Implementada | PASS acotado | Dos procesos reales,4conexiones TLS medidas, límites/préstamos/evicción/rotación de descriptor; cambio real de clave probado en restore |
| L1.4 | Implementada | NOT VERIFIED / PARCIAL | Lectura/DTO/A-B/UI pasan; demo/operador denegados en autoridad SQL pero falta HTTP con cookie/store estándar válidos por propósito |
| L1.5 | Implementada | NOT VERIFIED / PARCIAL | Tick601/deadlock/snapshot/reducción/CAS/ACK perdido probados; falta último cupo/ledger controlado ligado a ambos procesos HTTP reales; incidente de reloj por diagnosticar |
| L1.6 | Implementada y corregida | NOT VERIFIED / PARCIAL | Productor/grants SQL pasan; delta de generación/discontinuidad tiene8unitariasPASS y no integración del worker/PG posterior |
| L1.7 | Implementada | NOT VERIFIED / PARCIAL | TLS/CSRF/API/SPA/UI/ARM64/readiness pasan; faltan asset ausente404, drenaje acotado con trabajo en vuelo y reversión de release compatible. No se exige OCI propia por inferencia |
| L1.8 | Implementada | PASS acotado | Copia física/WAL/verify, segundo destino, cohorte/replay/canarios/credenciales/sesiones/barrera/cleanup pasan; no reapertura HTTP ni RPO/RTO externo |

QA Compose independiente:5contenedores propios, dos redes aisladas, límite runtime0,95CPU/1568MiB; sin TCP remoto/publish PostgreSQL ni acceso a redes ajenas en sondeos finitos. Dos API, web y worker se detuvieron antes de copiar. pg_basebackup/pg_verifybackup18.6:73.911.359bytes,2.285archivos,7,197s del paso backup/verificación, no RTO. Restauración en nueva red/almacenamiento con origen detenido; cohorte, dos canarios posteriores, cuatro sesiones antiguas, credenciales y epochs verificados. Barrera permanece cerrada. Contenedor/red destino retirados;5contenedores origen detenidos y datos/copia/journal privados preservados; túnel local cerrado. **No URL QA activa ni servicio público nuevo.**

Evidencia por versión:86a31ef (local46/PG33/UI19/build/HTTP8/browser15 iniciales);1a4e578 (timeout corregido, HTTP8 repetido/pools5; boundary2 por archivo idéntico);b7ed0bf (local50 y recuperación real);2cd4494 (delta observación,8unitarias, sin integración remota). No atribuir pruebas antiguas al último HEAD ni duplicar conteos. La implementación UI no cambió tras el build.

Revisión detectó y corrigió la propiedad de la respuesta en timeout HTTP, custodia previa de claves y orden de parada del mantenimiento. El worker salió tras COMMIT incierto durante pausa humana: readiness503 confirmado, relevo verificado y browser15PASS; causa del fallo de reconciliación no diagnosticada. Un status HTTP previo sin captura sigue desconocido. No se inventa corrección por rerun.

14pendientes únicos:1BLOCKING(Q35 salida) y13FUTURE. No decisión humana nueva imprescindible para continuar L1. Preparar pruebas faltantes/cohorte privada revisada es el próximo trabajo habilitado. No P2, pago, NCF/e-CF, Sentry externo, producción, DNS/proxy, Nexora/Mecanet-EAK, gasto/push/merge. Prompt Maestro intacto.

## Resultado histórico CP-014

**P1-L1 COMPLETADA: ocho salidas PASS acotadas.** [Auditoría CP-014](audit/CP-014.md) registra pruebas, fallos y correcciones por SHA/artefacto/entorno. P1 sigue EN CURSO como única fase activa, P0 general PARCIAL bajo RG-001 y SaaS general NOT APPROVED. No se aprueban otros módulos ni se cierra toda P1.

| Corte | Verificación de salida | Evidencia y límite |
|---|---|---|
| L1.1 | PASS acotado | Fixture/preflight/roles sintéticos CP-013 reutilizados; cohorte CP-014 nueva y exclusiva, sin reabrir la fuente cerrada |
| L1.2 | PASS acotado | HTTP real B/C/D: cookies/stores estándar, logout y rotación concurrentes, save tardío, fallos de emisión/contabilidad, respuesta perdida y SID revocado tras reinicio |
| L1.3 | PASS acotado | Roles/cotas/dos procesos CP-013 conservados; deadline monotónico por fase corregido y regresión de préstamos tardíos, rotación y cierre; lectura real D/E |
| L1.4 | PASS acotado | HTTP D: empresa/demo/operador con sesiones válidas, solicitudes falsificadas denegadas antes del pool y sin datos ajenos; catálogo sintético, sin escritores POS |
| L1.5 | PASS acotado | D/E: último cupo y QH/QC/Qt en cuatro ámbitos, conflicto SERIALIZABLE real, timeout/respuesta perdida conservan UNCERTAIN; prueba de fin runner/SQL/respuesta antes de reconciliar, reinicio de API y relevo de worker sin reset |
| L1.6 | PASS acotado | C: proyección real, fuente/generación/discontinuidad inicial CPU/RSS, calidad/asOf, buffers finitos y mínimos privilegios; reinicio real PG/worker; sin Sentry externo ni CPU exacta por empresa |
| L1.7 | PASS acotado | D: asset404/API JSON404 y drenajes0,929/0,945s con trabajo en vuelo; F→A→F por digest conserva sesión/datos/generación y PostgreSQL; entrada propia privada, no lanzamiento |
| L1.8 | PASS acotado | Restore físico sintético cerrado CP-013 conservado con sus SHA/cohorte/canarios/barrera; no repetido ni atribuido a F, sin RPO/RTO externo acreditado |

La configuración y los arneses evolucionaron entre artefactos; el código funcional D es idéntico en E/F. La evidencia B/C/D/E conserva su provenance y no se presenta como una ejecución completa nueva de F. Se corrigieron emisión implícita de cookie tras fallo, aceptación tardía al deadline, cota de pool por fase, resolución de upstream/IP propios y comparación de consumo compartido. El incidente histórico del worker CP-013 sigue sin causa acreditada: nuevos diagnósticos y relevo correcto no prueban retrospectivamente su causa.

**Integration Gate preparado en local**, con matriz y revisión del lote. PR, CI PR, merge, CI canónica y baseline siguiente siguen NOT VERIFIED; push/merge/CI remoto están prohibidos en esta ejecución. Próximo trabajo habilitado: revisión del checkpoint local y del paquete de integración, sin iniciar P2 ni otro lote.

Registro único: **14 pendientes,0 BLOCKING y14 FUTURE**, manteniendo4diseños/3evidencias/5decisiones humanas/2dependencias externas. Q-35 resuelve únicamente la salida L1 y conserva garantías de fases posteriores. Antes del primer handler sensible del operador/P4 DG-ADMIN debe implementarse y verificarse la reautenticación5min de DEC-045; las negativas por propósito de L1 no la acreditan. Ningún egreso, dominio público, producción, pago, fiscalidad funcional o permiso compartido se autoriza por este cierre.

## Vigencia histórica CP-015 — integración local y continuación independiente

P1-L1 mantiene ocho salidas PASS; **Integration Gate NOT VERIFIED y lote no TERMINAL**. Autorización humana actual admite Git/CI bajo condiciones, sin despliegues. Se traslada a rama limpia desde develop, excluyendo los dos commits del PR #1, con código/arnés idénticos y baseline aprobada preservada mediante SE-002. Dos patches de dependencias cliente (DOMPurify3.4.16 y source-map-js1.2.2) se verifican con regresión y hashes de bundle; no se cambia el producto SaaS ni se instala en QA.

Bloqueo localizado: conector Vercel no expone triggers Git y navegador requiere login; Coolify antiguo tiene auto/preview desactivados. No hay prueba de push/PR/merge seguros. Full audit mantiene5high/2moderate en tooling frontend heredado; no major de Tailwind por efecto lateral ni waiver silenciosa. Runtime backend/client0avisos. Q-42/43 bloquean únicamente integración/remoto, no diseño local.

Siguiente candidato **P1-L2 v0.1-CP015**, en .agentic/NEXT_LOT_CANDIDATE.md de la rama fuente: writers aislados por alta+recepción ficticias, idempotencia/revocación/crecimiento/migración/restore/UI; ajuste P1/P2 SUGGESTED, no A/B ni implementación. Doce salidas futuras NOT VERIFIED. NCF/e-CF mantienen contrato antes del primer código fiscal. QA CP-013/014 conserva STOPPED/KEEP según evidenciaCP014; no se despertó ni reensayó. [Auditoría CP-015](audit/CP-015.md).

Registro vigente:16pendientes,2BLOCKING/14FUTURE;4diseños/5evidencias/5decisiones humanas/2externas. P1únicaactiva, P0PARCIAL, SaaSgeneralNOTAPPROVED. No nueva fase/baseline canónica por copia, tests locales o aprobación funcional histórica.

## Resultado CP-016 — gates locales y candidato siguiente

CP-016, 2026-10-13: P1-L1 TERMINAL, ocho salidas PASS y Integration Gate PASS con [PR #2](https://github.com/SrEdgarR/MECANET/pull/2), head `04c5d41299bffc15e201c168677079809feb6a0f`, merge/develop `a0098178fc27467bf4c12da0e97723e0b80ce683`; [CI push](https://github.com/SrEdgarR/MECANET/actions/runs/38440714202), [CI PR](https://github.com/SrEdgarR/MECANET/actions/runs/38440720838) y [CI develop](https://github.com/SrEdgarR/MECANET/actions/runs/38441611717) PASS. Código local probado `0d8285cef117d6174a6053f18ceaac180f8aa1c5`; evidencia remota por sus SHA propios. Q-42/Q-43 resueltas para la lane aprobada; legacy audit FAIL/TD-21 conservado. P1 única fase EN CURSO; P0 PARCIAL/RG-001 y SaaS general NOT APPROVED. P1-L2 v0.2 candidato revisado, A/B pendientes y doce salidas funcionales NOT VERIFIED. Sin despliegues o recursos de infraestructura modificados.

Próximo paso: Decisión A exacta P1-L2 v0.2/ajuste P1-P2 y B diferenciada; después Design/Development/Environment del lote antes de código/recursos. No P2 o lanzamiento por extensión
