# CP-020 — entrada QA y límites de la verificación local

**r02 NO INICIADA.** La verificación local no ofrece un controlador físico integral listo para ejecutar ni seis salidas PASS. El Environment Gate permanece **FAIL** por presupuesto SQL incompatible. SC-011/DEC-069 está aprobada; SC-012/DEC-070 es una propuesta distinta y pendiente, sin repetir A/B funcionales.

| Condición | Evidencia actual | Estado / resolve-before |
|---|---|---|
| Identidad cerrada r02/r02-target | DEC-069; protocol/custody/fixtures rechazan r01, mezclas y una tercera cohorte | PASS local; preflight físico antes de recursos |
| Presupuesto SQL | Modelo de módulos reales:97 por admisión; principal mínimo3298; un caso de siete GET679 | FAIL bajo140/3000; aprobar SC-012 y aplicar coherentemente antes del primer efecto |
| TLS de entrada | Cuatro pares verificados localmente y MemoryBIO Linux ARM64; dos CA independientes; archivos privados custodiados | PASS acotado a TLS sin PostgreSQL. No repetir/regenerar material confirmado; autenticación real pendiente |
| Copia/journal negativos | Helpers contra copias temporales propias y vistas alteradas; fuente canónica RO; cotas de disco/dataset y FIN explícitos | Modelos/archivos locales; ejecución con entrada real, huellas y ledger pendiente |
| Schema y cliente antiguo | Fallos dentro de transacción006 con dobles; componente pools L2 archivado byte exacto | No PostgreSQL físico ni binario HTTP antiguo ejecutado. Publisher host de `schema-fault-probe.json`/recibo y llamada pre/post pendientes |
| Runtime principal y navegador | Drivers, hot mailbox, FIN, custodia, driver GUI y postcheck SQL con contratos/modelos locales | No HTTP, GUI, captura, SQL o restauración física r02; integrar llamadas/publishers y ensayar después de gates |
| Variantes de destino | Contexto de lineage separa fuente original/destino efectivo y preserva IDs ya confirmados | Contrato local; **proveedor host NO IMPLEMENTADO**, no recursos creados |
| Readiness cero empresas / todas cerradas | Diseño aprobado; contextos de variantes definidos | Preparador físico independiente y sus publishers pendientes; no reutilizar main como si fuera esas variantes |
| Interrupción COMMIT, promoción parcial, restricciones A5 | Adaptadores y casos locales para reintento/guardas | Hook de interrupción, custodia prospectiva y orquestación física de cada variante pendientes |
| Propiedad de variantes STOPPED/KEEP | Requiere referencias Root400 por servicio/CID/owner/pin y como máximo un PG/runtime activo | Ampliación cerrada del guard/provider pendiente. No confiar sólo en labels ni borrar/reutilizar el target principal |
| Registro de casos | Registro cerrado conserva cotas vigentes; nuevas negativas se registran antes de efectos, sin alias de retry | Las fases de variantes aún sin proveedor no están habilitadas. No generar un ledger hasta completar registro/review/caps coherentes |
| Recursos/consumidores | Snapshot14octubre:26 anteriores intactos, failed-tool r01 STOPPED/KEEP, cero recursos r02 | Evidencia histórica de ese instante, no capacidad ni preflight actual. Nueva lectura acotada y preflight antes de recursos |
| Integración Git | develop86985fe; rama local sin publicar | Seis salidas, review, Quality y ausencia de auto-deploy antes de push/PR/CI/merge |

Las lagunas del proveedor y de los publishers son tareas de implementación QA dentro de B ya autorizada, **no nuevas decisiones de producto**. La única aprobación humana nueva propuesta es SC-012 exacta. Su aprobación por sí sola no habilita arrancar un controlador incompleto ni sustituye Environment/preflight. No hay que reabrir L1/L2 o cambiar recursos compartidos para resolver estas tareas.

Las pruebas locales de `schema-fault-probe`, `target-runtime`, `target-witness`, lineage, copia, journal, credenciales, navegador y guards pueden ser PASS sin que un PostgreSQL o un navegador real haya ejecutado su flujo. Cada fuente conserva su entorno, SHA, fecha y alcance en el informe de Quality. La corrección del registro de casos se verifica separadamente con el registro real y el dispatcher de host.
