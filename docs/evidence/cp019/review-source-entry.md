# CP-019 — revisión focal de entrada de la fuente

Autor: l2_ui, revisión independiente de control/SQL; autor previo de los arneses privados prepare/fixture/migrate. Corte observado 2026-10-14 03:47:25 UTC. A DEC-067/B DEC-068 limitadas a P1-L3, baseline4d1cf193000106dd20555f6c70acab3cb264fd3a7bfe0a9cf8be662eddb2b3ec. No Git, SSH, secretos, DDL ni infraestructura ejecutados por este revisor. Ownership de esta revisión: sólo este informe; fuentes congeladas sin edición.

**Resultado:** protocolo fuente coherente en revisión estática/local; un REQUIRED de presupuesto de CPU antes de runtime. La preparación/parse con sólo PG+harness no queda bloqueada por ese hallazgo. PostgreSQL real, ACL efectivas, FK/COMMIT, costes, source closure física y seis salidas L3 siguen **NOT VERIFIED**.

## Fuentes inspeccionadas

| Fuente | SHA-256 observado |
|---|---|
| tests/qa/cp019/control.mjs | 072a4d48f6234526a8ef0b07229bc636ad5a4cd0083e2777faf3b13b17f3d840 |
| tests/qa/cp019/control.test.mjs | aab17b250efdd25cbd46915d61c425ab5ab68465b4078f866841c104e23b6ddc |
| server/saas/db/migrations/006-control-recovery.sql | 9ef46a1214e69bc12138292f055728b5508072b51afec57495a0f0a696d3f7e5 |
| server/saas/db/migrations/006-tenant-recovery.sql | a6d01d8a4c0386b24294140c3092ddd2b1642a25851b4fd55388df651dca296e |
| tests/qa/cp019/prepare.mjs | 1030e415cdf781843791cd1d54d436449126a5d2eabd6f30cca8c4be72ad24cb |
| tests/qa/cp019/migrate.mjs | 598a56a46ca1a651b136b1bf20deb0cbcc94b272011d0740d2e7166da086bdc7 |
| tests/qa/cp019/host.py | ba3c06ae419765350471687984f2c625cfea9c40290b3aabbef22db9240af7b9 |
| tests/qa/cp019/ledger.mjs | 4218aa4c9be11379ab2fb166b31810ed0585876aac979ed873744d3b31f117ab |

Contraste focal con [protocolo L2](../../../server/saas/writes/coordinator.js), SQL003 de restricciones/cierre, [contratos SQL](sql-implementation.md), [plan de arneses](test-plan.md) y [.agentic/P1-L3_PLAN.md](../../../.agentic/P1-L3_PLAN.md). No segunda revisión general del proyecto.

## Hallazgo REQUIRED

**R-SOURCE-CPU-01 — máximo agregado excedido durante runtime+harness.** host.py:124…129 define PG0.35 +API1 0.20 +API2 0.20 +worker0.10 +web0.10 +harness0.25 = **1.20CPU**, sobre el máximo1CPU aprobado. La memoria declarada de ese conjunto sí suma1696MiB. El tool genérico de host.py:88 también permite0.25CPU y necesita comprobar el perfil concurrente si se ejecuta mientras el runtime está activo.

Trigger concreto: ejecutar acceptance/harness junto a las dos API, web, worker y PG. Las caps individuales permiten superar el presupuesto del proyecto aunque la muestra puntual de CPU del host sea inferior80%; esa muestra no impone el máximo aprobado. No se atribuye carga real ni daño a otros consumidores: no se ha ejecutado ese perfil.

Corrección necesaria: fijar un perfil concurrente cuyo agregado máximo sea≤1CPU, incluida la herramienta/collector, o prohibir por código esa combinación y usar otro collector que respete el total. Mantener el presupuesto aprobado y medir latencia/consumo; no declarar capacidad por reducir una cap o por aprobar pruebas locales. Resolve-before: **Environment Gate del primer runtime fuente/destino con collector**, no la preparación exclusivamente PG0.35+harness0.25=0.60CPU. Root fue notificado; al corte de este informe no hay correctivo aplicado al hash de host listado.

## Controles coherentes en el código — PASS estático limitado

- Preparación fresca sólo source r01; material/owners/passwords/UUID provienen de custodia una vez. Bundle fuente y destino separados; master/API/worker segmentados. host.material publica material.json0400 propio para prepare y no lo monta en API/worker. El código no acredita por sí solo permisos/ownership del host: la comprobación física sigue pendiente.
- seedAdmissionSource nace con barrier=true, gen/seedOwner custodiados y tick/version0; dieciséis policies/scopes sin rebajar cuotas. La modificación frente al false heredado está explícita. Importar entry/worker/prepare no carga secretos ni conecta a PG.
- Source003 inicia A/B OPEN/v1 únicamente como bootstrap técnico, sin API/worker/clientes. request_write_restriction003 verifica generación pero **no exige barrier=false**. coordinatorL2 con recovery=null cierra local exclusivamente v1→CLOSED/v2, observa esa tupla, marca close_proven después del COMMIT local y obtiene ACK mediante etapas SQL reales. TENANT nunca reabre. No INSERT manual de ACK/close_proven existe en control.closeSource.
- Correctives son004 A/B +005central, lista cerrada. Registry3/4/5 conserva source_hash y registeredSourceCommit; no modifica SQL001…005. applyRecoveryMigration verifica el prerrequisito4/5 por SHA **dentro de la TX de006** antes de ejecutarla y registra6 en esa misma TX. Sin hash correspondiente aborta; COMMIT incierto descarta cliente y no produce PASS.
- initializeNormal central exige AdmissionFence propio con barrera verdadera, roster A/B ordenado/único exacto, generación y reloj concordantes y schema2 previo. Actualiza schema3/used+4352 una vez; replay sólo acepta el binding ya registrado. Local initializeNormal no abre el fence y preserva la generación/epoch actuales. El controlador valida el fence real A OPEN/v1 y B CLOSED/v2 al observar el AFTER local, además del singleton de recuperación.
- Transferencia de reloj debe estar preparada en SQL antes del CAS. Worker recibe owner estable y transferencia explícita, no genera ni adopta owner por startup. recordClock mantiene relación `ΔclockVersion=Δtick+1` respecto al BEFORE de adquisición. ACK NORMAL exige CLOCK_ACQUIRED, roster exacto, restricciones ACK, reloj propietario concordante y barrera; COMPLETE y barrier=false se comprometen en la misma TX y el getter revalida conformidad antes de retornar.
- No SID se crea durante bootstrap; fuente sólo inicia sesión después de NORMAL COMPLETE. Source refs company siguen credentialVersion1/dataEpoch2, descriptor schema3 con run/manifest; demo queda como contexto separado de sólo catálogo schema1. Destino company version2/dataEpoch3 no vuelve a etiquetar los historiales. Verificar esas filas y las denegaciones reales pertenece a QA, no a esta revisión estática.

## Cargo4352, FK y pruebas físicas pendientes

Local006 crea singleton UNBOUND y valida el contador previo con la función de logical_usage anterior; carga4352 una vez y reemplaza logical_usage para incluir4352 constante. Registry6 y DDL están en una sola TX. Su init NORMAL cambia metadata del guard, sin segundo cargo ni apertura del fence. Central init NORMAL valida margen reservado y agrega4352 a used_bytes por company al cambiar schema2→3. Ecuación prevista después de ambos pasos: central used anterior+4352 =local counted anterior+4352 =local logical_usage nueva. Los costes de quota/fence previos usan representación fija, por lo que la evolución de versión/estado no altera por sí sola esa representación.

**Esta lectura no demuestra la ecuación en PG.** Deben observarse valores reales antes/después, filas y hashes de registry6, repetición sin segundo cargo y último byte/margen terminal. Verificar coste real de guard≤4096+256 y budget central2MiB/16MiB. Las FK centrales recovery_tenants→run/directory/restriction y la cadena restriction_tenants→writer_state están declaradas; su parse, referencias efectivas, owner/ACL y rollback no se infieren del texto. Los17 LOGIN/46 límites, ausencia de SID/clientes/procesos antes del cierreB y grants/refs después del cambio necesitan inspección propia limitada.

closeSource retorna acknowledged del coordinator real y escribe journal.after; sus unit doubles no constituyen cierre físico. Antes de ACK NORMAL/backup, root debe conservar witness posterior del join restriction/tenant-state/directorio y del fence local B (gen/epoch2/v2/CLOSED/close_proven/ACK exactos), recursos SQL/HTTP terminados y ausencia de consumidores previos. Un callback de witness con metadata estructural valida contrato, no el host. El mismo límite aplica al proofHash del reloj y a los resultados históricos.

El getter admite cero roster o todas las companies legítimamente CLOSED cuando el conjunto exacto declarado/custodiado coincide con el real. La fixture source actual tiene A/B, y control fija ese roster: **no prueba el caso cero**, ni se deben borrar empresas o simular carga fallida para obtener200. Las variantes físicas de cero/allclosed deben tener sus precondiciones, pruebas y budgets propios planificados por root; no se transforma el modelo abstracto o el mock ready=true en PASS de esas variantes.

## Presupuesto de consultas y evidencia local

Conteos estáticos sin fallo: foundation113 calls; writers128; correctives33; applyRecoveryMigration006 **10 calls por DB** (BEGIN/advisory/role/prerequisite/registry/DDL/role/registryINSERT/COMMIT/RESET),30 para central+A/B. Replay de006 con hash existente usa7 por DB y ningún DDL nuevo. SourceInitialize/local-init/clock/ACK agregan observaciones/journal, además de los getters del runtime.

Cierre inicial B sin intenciones pendientes, coordinatorL2 y pools sin probes adicionales:61 driverqueries estimadas (request4 +fetch/CLOSING/guards12 +close local4 +stageCLOSED7 +reconcile15 +APPLY8 +guards4 +ACK7). Conflictos/ROLLBACK, pruebas posteriores y callbacks suman; no se presupone que61 sea el consumo físico exacto. Evitar instrumentar dos veces un pool ya medido: control.sql cobra onCommand antes de pool.query; coordinator necesita que sus pools cuenten sus propias consultas, sin sumar otra capa al mismo call. Todo tiempo/coste del reloj y las dos API va al caso activo y acumulado global, no a un contador aparte gratuito. Los140SQL/45s por caso y3000global no quedan acreditados por estos conteos.

Ejecutadas localmente aquí: Node24.21.0/Windowsx64, `--test control.test.mjs fixture.test.mjs prepare-contract.test.mjs`:**30 PASS/0FAIL** (17 control boundary doubles +13 contratos de arneses). Prueban tuplas, durable-before/reconciliación del AFTER, rechazos de hashes/bindings/roles y guardas de entrada; no ejecutan PG ni prueban Docker/ARM64/capacidad. Ninguna prueba histórica se atribuye a este corte. No código funcional ni arnés fue cambiado por esta revisión.

Próximo paso habilitado: corregir R-SOURCE-CPU-01 para el perfil runtime; en paralelo, Environment Gate propio de PG/preparación y parse/aplicación transaccional006 con resultados reales. No cierre L3/General Ready/Integration/producción por extensión. Recursos creados o modificados por este revisor: ninguno.
