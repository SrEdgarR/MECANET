# SC-013 — límite acumulado de artefactos de r02

Versión v0.1-CP021, 2026-10-15. **SUGGESTED / NOT APPROVED.** DEC-071. No se aplica al código, no permite crear recursos ni sustituye un gate. SC-012/DEC-070 continúa aprobada y aplicada exclusivamente a SQL; A/B y SC-011 no se reabren.

## Cambio exacto propuesto

| Magnitud | Vigente | Propuesta |
|---|---:|---:|
| Nuevos artefactos acumulados de la pareja r02/r02-target, incluidas sus variantes | 2000 | **8192** |
| Artefactos por caso | 2000 | **2000, sin cambio** |

Es una única ampliación acumulada del ensayo sintético. No cambia el número de escenarios (135), sus nombres o sus scopes; ningún retry devuelve cargos ni abre alias. El contador incluye las creaciones reales actuales, también publicaciones temporales del mailbox, locks y referencias, aunque posteriormente se retiren.

Se conservan 8192 SQL/caso y 200000 SQL acumuladas; 45s/caso y 1800s acumulados; 80 HTTP/caso y 300 acumulados; 1000 registros de journal; 1 CPU, 2048MiB y 60 conexiones agregados; dos leases por escenario; copia offline120s y drenaje30s sin sustituir FIN; datos, copia y destino agregado de todas las variantes, cada ámbito con su límite original de2GiB; índice4MiB/10000archivos y journal1MiB. Permanecen las cadencias del reloj, autenticación, TLS, aislamiento, pins, integridad, aborto y conservación de evidencia. No aumenta la capacidad de negocio ni altera el contrato de recuperación.

## Evidencia y fundamento

[Conteo reproducido sobre el programa real](../docs/evidence/cp021/artifact-budget-review.md) y [fuentes, hashes, fórmulas y omisiones](../docs/evidence/cp021/artifact-budget-review.json). En el snapshot contado, cuatro programas de42efectos y un prefijo de35 dan203efectos TARGET: sólo sus before/after y plan/head requieren812artefactos. La cota inferior inicial acreditada es2020; al añadir otras familias obligatorias aumenta a2414, todavía incompleta. Un segundo revisor reproduce esa derivación. Estas cifras no son ejecuciones PostgreSQL ni un máximo de consumo.

Las dos reducciones puntuales evaluadas, aún no aplicadas, ahorrarían como máximo53archivos de test/examples de dependencias y39configs de primera invocación: incluso descontándolas quedan2322antes de otras creaciones. Suprimir también96cargos conservadores de directorios dejaría2226; tampoco cerraría la cota. No se omiten cargos ni se eliminan pruebas para obtener PASS.

8192 es una **propuesta de margen operativo**, no una capacidad ni una suficiencia demostradas: una envolvente ilustrativa de la cadencia actual0,5s durante1800s da3600publicaciones. No es un máximo formal: faltan redondeos y reinicios por job, otros productores y materializaciones omitidas. Sumadas a las2414creaciones conocidas dan6014, pero el subtotal fijo todavía omite familias. El resto del margen se propone para esas familias y contingencias, sin garantía de cobertura; cada creación seguirá cargándose y un agotamiento abortará. No se afirma una cota superior cerrada ni un ensayo garantizado. Una revisión del programa y una proyección por familia deben acompañar la autorización, antes de iniciar r02.

El número de archivos no concede espacio adicional: el límite agregado de destino sigue siendo2GiB, incluidos los datos y la metadata de las variantes y negativas KEEP. El tamaño de inputs/manifiestos, muestras físicas, límites de contenedores y monitorización deben acreditarse separadamente. La lectura preliminar del VPS no demuestra throughput SQL ni ausencia de interferencia futura.

## Impacto y revisión inversa

- Afectados si se aprueba: wrapper de `docs/specs/P1-L3.md`, DEC-071, plan/estado/mapa; `budget-limits.json`, su hash fijado por host, loaders y consumidores de la cota acumulada; pruebas de desbordamiento y registros prospectivos. El valor por caso permanece2000. El snapshot aprobado byte exacto no se reescribe.
- P1-L1/L2 y sus evidencias no cambian. No se repiten sus ensayos físicos. P1-L3 conserva sus seis criterios; ninguna salida física ni Integration Gate se aprueba mediante esta propuesta.
- P2 y fases posteriores no reciben presupuesto o autorización de implementación por extensión. No hay recursos, gastos, DNS, redes compartidas, cambios de Coolify/Traefik, Nexora, EAK, producción o datos reales autorizados aquí.
- Más artefactos pueden consumir más almacenamiento y operaciones de filesystem: siguen sujetos a límites independientes, medición y aborto. No se promete gratuidad, rendimiento o capacidad por aprobar un contador.

## Alternativas y reversión

Mantener2000 obliga a detener la entrada QA del flujo contado. Otra alternativa es rediseñar materializaciones reales y acreditar, por revisión y pruebas, que un recorrido íntegro cabe en2000; no se ha demostrado una reducción suficiente y no se presenta como un arreglo puntual. Compactar o cambiar el journal y sus garantías requiere su propia revisión de impacto; no se introduce silenciosamente.

Antes del inicio no existe ledger/material/recurso r02 que revertir. Después de un eventual inicio, nunca se reduce ni reinicia un contador, se regenera material confirmado o se usa una tercera cohorte: ante límite o anomalía se detienen sólo los escritores propios con identidad acreditada, se verifica FIN cuando sea posible y se conserva todo en KEEP. Una prueba incompleta no se declara PASS.

## Condición de continuación

Hace falta aprobación humana explícita de **SC-013/DEC-071:8192artefactos acumulados y2000por caso**, exclusivamente. Después corresponde aplicar coherentemente ese cambio y sus negativas, completar el controlador integral, Quality y el Environment/preflight físico fresco. La aprobación no equivale a dar estos gates por satisfechos ni autoriza publicar la rama antes de seis salidas y condiciones de integración.
