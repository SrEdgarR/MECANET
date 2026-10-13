# Experimento local DEM-EXP-01 — fixture y frontera de cuota

Estado previo a ejecución: autorizado por ampliación CP-006 §C/D4; **no funcionalidad del producto**. Fecha 2026-10-07, base de producto fcd93a8 (código sin cambio desde f5afaa2). Responsable: coordinador.

- Pregunta: ¿un dataset fijo pequeño cubre los gráficos actuales sin gastar la cuota de acciones nuevas? ¿Qué intercalado mínimo demuestra que separar comprobar/incrementar puede superar la última plaza?
- Resultado que cambiaría diseño: gráficos vacíos o totales incoherentes exigen ajustar fixture; el contraejemplo obliga a reservar cupo y registrar resultado idempotente en la misma unidad atómica. Esto no demuestra implementación de dicha unidad en Mongo.
- Entorno/destino: Node local Windows, módulo puro con built-ins assert/fs/path/crypto/url. Sin importaciones de aplicación/dependencias, .env, red, Mongo, Docker, navegador, correo ni servicios. NODE_OPTIONS/NODE_PATH se limpian solo en el proceso de shell del ensayo; no configuración global. Versiones reales en resultado.
- Recursos: un proceso, heap máximo 128 MiB, menos de 5 s medidos; fixture de 20 productos, 5 clientes ficticios y 60 ventas precargadas de 30 días; no bucle de carga ni tiempo real. As-of fijo 2026-10-07T18:00:00Z. Importes de ejemplo en centavos DOP, sin afirmación fiscal.
- Éxito: referencias/stock/totales coherentes; días con/sin ventas y tres medios; cuotas iniciales nuevas a cero pese a precarga; contraejemplo reproduce 11 sobre límite 10; modelo atómico abstracto admite una operación y conserva reintento/expiración. Fallo/aborto: cualquier aserción, tiempo >5 s, heap/peso excesivo, ruta inesperada o necesidad de servicio externo.
- Archivos KEEP: demo-plan.md, demo-fixture.mjs, demo-fixture.json y demo-results.json en esta carpeta. Escritura solo con --write; --check compara sin mutar. El script no se importa en producto ni se copia por Dockerfile/.dockerignore; frontend compila client/, no .agentic.
- Limpieza: ningún recurso persistente de runtime; proceso termina al completar. No se eliminan archivos previos. Resultado/modelo no equivale a integración POS, aislamiento DB, carga del VPS ni UI probada.

Comandos seguros desde la raíz, tras revisar el script:

```powershell
$env:NODE_OPTIONS = $null; $env:NODE_PATH = $null
node --max-old-space-size=128 .agentic/experiments/cp006/demo-fixture.mjs --write
node --max-old-space-size=128 .agentic/experiments/cp006/demo-fixture.mjs --check
```

La ejecución medida y el hash de script/fixture se registran en demo-results.json. Plan preparado el 07; ejecución prevista desde el cambio de fecha del cliente, 2026-10-08. Las cuotas y duraciones aprobadas proceden de DEC-027; tamaño/días del fixture son elección experimental, no nuevos límites comerciales.

Resultado 2026-10-08: --write y --check PASS, Node 24.14.0 / Windows x64; siete comprobaciones, 42,706 bytes y total ficticio 18,877,500 centavos DOP. De seis intercalados posibles del contador no atómico, cuatro superan la plaza restante; el modelo atómico abstracto admite uno en ambos órdenes. Esto justifica la invariante, no acredita implementación Mongo. Datos y agregados no se han cargado en el POS ni mostrado en navegador.

Diagnóstico de entorno, un intento de lectura: Get-Command mongod,docker no encontró ejecutables en PATH (salida 1 de descubrimiento; los dos comandos Node terminaron PASS). No se infiere ausencia de toda instalación del equipo. No se inició ni instaló Mongo/Docker ni se consultó contexto remoto; restricción efectiva de credenciales Mongo y pruebas de integración quedan NOT VERIFIED por entorno local no acreditado. Hay trabajo documental/experimental independiente y no se insiste en ese bloqueo.
