# Despliegue de Mecanet: Vercel y Coolify

Repositorio: `https://github.com/SrEdgarR/MECANET`. Utiliza exclusivamente esta cuenta y despliega el mismo commit verificado en ambos proveedores.

## Distribución

| Servicio | Plataforma | Configuración |
| --- | --- | --- |
| `mecanet.site` | Vercel, proyecto `mecanet-web` | Raíz `web`; sitio estático, sin instalación ni compilación; salida `.` |
| `app.mecanet.site` | Vercel, proyecto `mecanet-app` | Raíz `client`; Node 24; `npm ci`; `npm run build`; salida `dist` |
| `api.mecanet.site` | Coolify, aplicación `mecanet-api` | Dockerfile de la raíz; puerto interno 5000 |

Esta versión sirve un negocio por base de datos. Los usuarios los crea un administrador: no hay registro público ni cobro de suscripciones. Publicar la aplicación no incorpora aislamiento entre empresas.

## Backend en Coolify

Selecciona el repositorio y el commit o la rama que contiene este Dockerfile. Configura el dominio `https://api.mecanet.site` y el puerto expuesto `5000`. El proxy de Coolify publica HTTPS; no hace falta publicar el puerto 5000 directamente en el VPS.

Variables de ejecución, sin habilitarlas durante la compilación:

| Variable | Valor |
| --- | --- |
| `MONGODB_URI` | URI de la base de producción elegida expresamente |
| `JWT_SECRET` | Secreto exclusivo de producción, generado con 32 bytes aleatorios o más |
| `JWT_EXPIRE` | `1h` |
| `NODE_ENV` | `production` |
| `APP_MODE` | `cloud` |
| `SERVE_FRONTEND` | `false` |
| `BIND_HOST` | `0.0.0.0` |
| `PORT` | `5000` |
| `CORS_ORIGINS` | `https://app.mecanet.site` |

Si usas Atlas, autoriza la IP de salida del VPS y concede al usuario permisos únicamente sobre la base elegida. No configures un fallback hacia otra base: una incidencia de conexión debe detener el arranque, no cambiar el conjunto de datos. Conserva el mismo `JWT_SECRET` entre despliegues; cambiarlo invalida las sesiones existentes.

El contenedor se ejecuta como usuario sin privilegios y contiene las dependencias de producción, el código del backend y `curl`, que necesita la comprobación de salud de Coolify. `.dockerignore` excluye `.env`, credenciales, archivos locales y el frontend. No ejecutes `setup-client`, `seed` ni `reset-db` durante la compilación o el arranque: pueden reinicializar o modificar datos.

El `HEALTHCHECK` del Dockerfile consulta `/api/health`; devuelve `200` con `{"status":"ok"}` solo si MongoDB responde y `503` si no está disponible. No incluye credenciales ni datos del negocio. El servidor cierra sus conexiones al recibir una señal de parada.

Para agregar un administrador sin borrar datos, abre una terminal interactiva del contenedor y ejecuta `node scripts/createAdmin.js`. Ese asistente requiere que las variables de ejecución ya estén configuradas. Guarda la contraseña que muestre en un gestor de contraseñas.

### MongoDB dentro de Coolify

Crea el recurso `mecanet-mongodb` dentro del mismo proyecto y entorno que la API. Utiliza una versión compatible con el sistema del VPS: este despliegue se verificó con `mongo:7`. Conserva los volúmenes de Coolify para `/data/db` y `/data/configdb`, activa la autenticación y mantén desactivado el acceso público a MongoDB.

Las ventas requieren transacciones: MongoDB debe estar configurado como replica set. En este VPS se utiliza `mecanet-rs` con un miembro. Esto habilita transacciones, pero no aporta redundancia frente a una avería del VPS.

Para una base nueva, crea una clave aleatoria de autenticación interna en `/data/configdb/mecanet-keyfile`, propiedad del usuario `mongodb` y con permisos `400`. Configura MongoDB en Coolify con:

```yaml
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.25
replication:
  replSetName: mecanet-rs
security:
  authorization: enabled
  keyFile: /data/configdb/mecanet-keyfile
```

Después de reiniciar ese recurso, autentícate como administrador e inicializa el replica set una sola vez con el hostname interno estable del recurso de Coolify. No uses una IP temporal del contenedor. Crea un usuario `mecanet_app` con permiso `readWrite` solo sobre la base `mecanet`; la API no debe usar la cuenta raíz. Su conexión tiene esta estructura:

```text
mongodb://mecanet_app:CONTRASENA@HOST_INTERNO:27017/mecanet?authSource=mecanet&directConnection=true&replicaSet=mecanet-rs
```

Guarda esta URI únicamente como variable de ejecución de la API. Conserva respaldos de la base y de la configuración del recurso, incluida su clave interna. Un volumen persistente protege los datos al reemplazar un contenedor, pero no sustituye a una copia de seguridad fuera del VPS.

## Frontend en Vercel

Ambos proyectos se conectan a `SrEdgarR/MECANET`. Configura en `mecanet-app`:

```dotenv
VITE_API_URL=https://api.mecanet.site/api
```

Esta dirección es pública y se incorpora al compilar. Tras cambiarla, vuelve a desplegar el frontend. Nunca pongas URI de MongoDB, secretos JWT ni contraseñas en variables `VITE_*`. `mecanet-web` no requiere variables de entorno.

La aplicación conserva las rutas de React al recargar y envía las solicitudes directamente a la API. CORS permite exactamente el origen de la aplicación. Las vistas previas de Vercel no acceden al backend de producción salvo que su origen se autorice expresamente; para pruebas con datos usa una API y una base independientes.

## DNS en Hostinger

Mantén los servidores DNS actuales y los registros de correo y verificación existentes. Añade cada dominio a su proyecto antes de editar DNS:

- Para `mecanet.site` y `app.mecanet.site`, utiliza los valores que Vercel muestre para esos dominios y proyectos. No supongas una dirección genérica.
- Para `api.mecanet.site`, crea un registro A llamado `api` con la IPv4 pública del VPS.
- No agregues un registro AAAA si el VPS y su proxy no tienen IPv6 configurado.

Espera la propagación y verifica los certificados HTTPS de los tres dominios. Que Vercel reconozca la propiedad del dominio no significa que sus registros DNS ya sean correctos.

## Comprobación y reversión

Antes de publicar, ejecuta `npm run test:http`, `npm run test:security`, las pruebas del frontend y su compilación. No ejecutes las pruebas contra la base de producción.

Después del despliegue:

1. Comprueba que la web pública carga y enlaza con la aplicación.
2. Abre y recarga `https://app.mecanet.site/login`.
3. Comprueba `https://api.mecanet.site/api/health` y que las rutas privadas rechacen solicitudes sin sesión.
4. Comprueba CORS desde el dominio de la aplicación y el inicio de sesión con una cuenta autorizada, sin crear ventas ni datos de prueba en producción.
5. Revisa el estado de Coolify y los errores de la consola del navegador.

Registra el commit desplegado. Para revertir, vuelve a desplegar el commit anterior en Coolify y promueve la versión anterior en Vercel. Este cambio no ejecuta migraciones de datos. Una reversión del código no recupera datos borrados: conserva respaldos de MongoDB independientes y verifica su restauración antes de cualquier operación destructiva.
