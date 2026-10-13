# QA-EXP-02 — Acreditación local dirigida de réplica Mongo y aislamiento básico

Estado: **prerregistro CP-010, 2026-10-08**, antes de iniciar la instancia temporal. Autoridad: petición humana adjunta65a09515-e7d6-477b-b4bf-79cba4986b17 §6. Base/HEAD de producto **f72bd2393e26eeaf97f6962baf520a71e50e356b**. No implementación de Mecanet ni cierre de Environment Gate global.

## Incertidumbre y evidencia previa

CP-006 solo comprobó mongod/docker en PATH; no acreditó una réplica. Nueva comprobación dirigida CP-010: existe MongoDB8.3.11 Community Windows amd64 en C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe, fuera de PATH; mongosh2.12.0 y driver Node mongodb6.20.0 ya disponibles. Servicio MongoDB/PID5100 existente **OUT OF SCOPE**, no conectar, parar, consultar sus opciones/configuración, reutilizar su dbpath o cambiarlo. Docker/Podman no encontrados en PATH ni ubicaciones comprobadas; WSL informa no instalado. Windows11Pro10.0.26300 x64, Node24.14.0/npm11.9.0,16procesadores lógicos/31,89GiB RAM; instantánea17,25GiB libres y329,91GiB disco, no capacidad productiva.

Pregunta concreta: ¿puede el usuario actual iniciar una réplica temporal con autenticación, transacciones y credenciales separadas que nieguen acceso cruzado? Un PASS acredita solo ese motor/OS/versión y arnés. No acredita Mongo7.0.43 del destino, Linux/ARM64, dos API, contenedores, restore ni aplicación.

## Destinos, recursos y límites

- **TEMP→DELETE:** un proceso mongod propio no registrado como servicio; bind127.0.0.1, puerto libre asignado por sistema y verificado mediante PID del listener antes de conectarse. Réplica de un miembro anunciada como localhost; validar resolución loopback, nombre de set y PID del servidor. URI se construye internamente, no acepta argumentos/variables externas.
- **TEMP→DELETE:** carpeta .runtime-UUID bajo esta carpeta exacta, dbpath/log/keyfile propios; clave aleatoria y contraseñas efímeras solo en memoria/archivo temporal restringido. Sin secretos/credenciales en resultados, línea de comandos o repositorio. No .env habitual ni importación de servidor/controladores/configuración del producto.
- Driver ya instalado6.20.0; built-ins Node. NODE_OPTIONS/NODE_PATH se vacían únicamente en proceso de ejecución. Mongo arranca con entorno mínimo del SO, sin variables de aplicación.
- WiredTiger cache256MiB, oplog16MiB, máximo10documentos ficticios pequeños; una instancia y clientes/pools≤2 cada uno. Node heap128MiB. Sin bucle de carga; pruebas secuenciales.
- Vigilancia cada≈2s: abortar si RSS mongod>1GiB, CPU acumulada>30s, carpeta>768MiB, tiempo total>180s, proceso/listener/ruta inesperados o intento no local. Son abortos observados, no cgroup ni cota dura del host. La caché WiredTiger no limita toda la memoria del proceso.
- Ninguna descarga/instalación, privilegio elevado, firewall/kernel/servicio/DNS, conexión externa, Atlas o VPS. Ejecución sin ventana mediante spawn windowsHide.

## Recorrido mínimo y criterio

1. Confirmar ruta/versiones, resolución local y puerto sin dueño; iniciar solo proceso propio. Acreditar listener127.0.0.1/PID antes de usar cliente.
2. Con excepción localhost y acceso por keyfile iniciar réplica única; crear administrador temporal local, cerrar bootstrap y autenticar. Verificar PRIMARY, versión, PID y opciones efectivas.
3. Crear A/B/control ficticios y usuarios readWrite limitados a A o B. Probar lectura/escritura propia y canarios distintos con mismo ID.
4. Probar rechazo13 de lectura/escritura cruzada A↔B y A→control, intento administrativo no autorizado y lectura sin credenciales. Un error de red no cuenta como rechazo de autorización.
5. Transacción real en A: commit de dos cambios y rollback voluntario de otros dos, verificados desde sesión independiente. No test de caja, cuotas, pago ni resolver de Mecanet.
6. Cerrar clientes; shutdown autenticado de instancia propia o terminación del PID hijo exacto si falla. Verificar proceso terminado, puerto liberado y eliminar únicamente .runtime-UUID tras resolver ruta absoluta bajo directorio permitido, rechazando enlaces/reparse/ruta ajena. Servicio previo preservado.
7. Guardar resultado sanitizado con versión/fecha/base/hash del script, resultados por garantía, picos/tiempo/cleanup. Un fallo se registra como tal, sin relajar controles para conseguir PASS.

Fuentes técnicas focales nuevas: MongoDB [keyfile/replica set](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/) y [excepción localhost](https://www.mongodb.com/docs/manual/core/localhost-exception/). Son patrón de bootstrap de un entorno de prueba; no selección de autenticación productiva ni prueba de compatibilidad del motor objetivo.

## Ejecución y conservación

Archivos KEEP: este plan, qa-local.cjs y qa-results.json. Ningún dato Mongo/log/keyfile temporal debe quedar al finalizar. Si cleanup no confirma desaparición del proceso/puerto, detener la ejecución y reportarlo; no eliminar directorios activos ni matar servicios por nombre.

Comando reproducible, revisado antes de ejecutar:

```powershell
$env:NODE_OPTIONS=$null
$env:NODE_PATH=$null
node --max-old-space-size=128 .agentic/experiments/cp010/qa-local.cjs
```

El arnés no se importa en producto ni configura su despliegue. Repetir exige nueva necesidad y validación de destino; este plan autoriza la evidencia mínima solicitada, no una búsqueda o prueba indefinidas.

Resultado CP-010: ocho comprobaciones PASS el2026-10-08T17:11:10Z,4,593s; muestras165,19MiB RSS/0,89sCPU/200,72MiBdirectorio. PID14736/puerto53670loopback propios eliminados y liberados; servicio MongoDB/PID5100 sigue Running sin conexión. Script SHA256ec8ce121964fecabba47b07abac5e930f24db0c5cefbee33bf2f9ff323bbae64; resultado conserva versiones/hash de binario y alcance. No restore, aplicación o compatibilidad objetivo acreditados.

Reproducción controlada: el arnés exige exactamente HEAD/basef72bd239; tras el checkpoint se debe usar un checkout aislado de esa base y copiar el arnés exacto versionado de CP-010, con dependencias locales verificadas y destinos nuevamente acreditados. Nunca resetear el workspace actual para repetirlo. Su negativa ante otro HEAD ocurre antes de crear Mongo; no repetir sin necesidad/autorización de evidencia. La línea anterior de ejecución asume ese prerrequisito.
