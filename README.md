# 🚀 MECANET

Sistema de punto de venta (POS) para talleres mecánicos y tiendas de autopartes. Incluye facturación, inventario, clientes, proveedores, caja, cotizaciones, devoluciones, compras, reportes y administración de usuarios.

## ✨ Características

- 💰 **Punto de venta y caja** con descuentos, impuestos y varios métodos de pago
- 📦 **Inventario** con categorías, marcas, códigos de barras y alertas de stock
- 👥 **Clientes, proveedores y usuarios** con roles y permisos
- 🧾 **Recibos, cotizaciones, devoluciones y órdenes de compra**
- 📊 **Dashboard, reportes, auditoría y monitoreo**
- 🌗 **Temas claro, oscuro y automático**
- 🖥️ **Ejecución local en Windows** o despliegue web

## 🛠️ Tecnologías

**Backend:** Node.js + Express + MongoDB/Mongoose

**Frontend:** React + Vite + Tailwind CSS + Zustand

**Autenticación:** JWT + bcrypt

---

## 📥 Instalación local en Windows

### Opción A: paquete de Releases

1. Descarga el ZIP más reciente desde [Releases de MECANET](https://github.com/SrEdgarR/MECANET/releases).
2. Extrae todo el contenido en una carpeta con permisos de escritura.
3. Ejecuta `CONFIGURAR-INICIAL.bat` y completa el asistente.
4. Ejecuta `INICIAR-MECANET.bat`.
5. Abre `http://localhost:5000` si el navegador no se abre automáticamente.

El asistente solicita la conexión de MongoDB, genera un secreto JWT y permite crear el administrador inicial. La configuración no inicia el sistema por sí sola: el último paso siempre es ejecutar `INICIAR-MECANET.bat`.

### Opción B: código fuente

**Requisitos:** Node.js 22.12 o superior, npm y una instancia de MongoDB.

```bash
# 1. Clonar el repositorio
git clone https://github.com/SrEdgarR/MECANET.git
cd MECANET

# 2. Instalar dependencias
npm install
npm --prefix client install

# 3. Crear la configuración local
npm run setup:local
```

Este comando crea `.env` desde `.env.example` y genera un `JWT_SECRET` aleatorio
de 64 caracteres. Conserva un secreto válido existente y no muestra su valor.
Solo permite configuración local: se rechaza en modo `APP_MODE=cloud` o en
entornos detectados de Vercel, Railway y Heroku. No se ejecuta al instalar
dependencias ni cambia las variables de un despliegue en la nube.

Edita `MONGODB_URI` en `.env` con tu conexión MongoDB Atlas o una instancia local
instalada y en ejecución. La generación de `.env` no instala MongoDB ni recupera
credenciales de Atlas. También puedes usar el asistente `npm run setup`.
Para desarrollo con dos terminales, configura `NODE_ENV=development`:

```dotenv
MONGODB_URI=mongodb://localhost:27017/mecanet
JWT_SECRET=un_secreto_aleatorio_de_32_caracteres_o_mas
PORT=5000
NODE_ENV=development
```

Para generar un secreto seguro:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Puedes crear un administrador con `npm run create-admin`. El asistente ofrece tres opciones: correo estándar `admin@mecanet.com` con contraseña aleatoria segura, correo y contraseña personalizados, o correo personalizado con contraseña aleatoria segura. Las contraseñas personalizadas deben tener al menos 12 caracteres. El comando agrega un usuario y conserva la configuración y los usuarios existentes; si el correo ya está registrado, no modifica esa cuenta.

Inicia cada proceso en una terminal distinta:

```bash
# Terminal 1: API
npm run dev

# Terminal 2: interfaz
npm --prefix client run dev
```

**Acceso en desarrollo:**

- Frontend: http://localhost:3000
- Backend/API: http://localhost:5000/api

---

## 👤 Administrador inicial

`CONFIGURAR-INICIAL.bat`, `npm run setup-client` y `npm run create-admin` usan las mismas opciones de credenciales. La contraseña generada usa 32 bytes aleatorios; el script la muestra una sola vez al terminar para que puedas guardarla. Las contraseñas se almacenan con hash.

`npm run setup-client` está pensado para iniciar una base de datos nueva. Primero valida `.env` y la conexión a MongoDB; usa solo `MONGODB_URI` principal para evitar cambiar silenciosamente a otra base configurada como fallback. Antes de confirmar, muestra el servidor y la base de destino y recopila los datos del administrador y del negocio. La moneda predeterminada es `DOP` y el impuesto `18%`. Tras la confirmación guarda una copia temporal en MongoDB, que puede requerir espacio adicional comparable al tamaño actual de los datos, y vacía las colecciones normales de la base. Las colecciones internas `system.*` y las vistas se conservan; las colecciones capped y de series de tiempo bloquean el proceso antes del vaciado. Si la configuración falla o se interrumpe, restaura los datos y limpia esa copia; si el proceso se cierra abruptamente, el siguiente inicio intenta recuperarlos antes de continuar. Detén el servidor de MECANET antes de ejecutarlo para evitar escrituras simultáneas. Para agregar un administrador sin reiniciar la base, usa `npm run create-admin`.

---

## ☁️ Despliegue en la nube

### Railway + Vercel

#### 1. Backend en Railway

1. Crea un proyecto desde este repositorio.
2. Usa `npm start` como comando de inicio.
3. Configura:

   ```dotenv
   MONGODB_URI=tu_uri_de_mongodb_atlas
   JWT_SECRET=un_secreto_aleatorio_de_32_caracteres_o_mas
   NODE_ENV=production
   ```

4. Copia la URL pública del backend.

#### 2. Frontend en Vercel

1. Importa el mismo repositorio.
2. Define **Root Directory** como `client`.
3. Usa `npm run build` y el directorio de salida `dist`.
4. Agrega la URL de la API, incluyendo `/api`:

   ```dotenv
   VITE_API_URL=https://tu-backend.up.railway.app/api
   ```

### Render: backend y frontend juntos

Configura un Web Service con:

- **Build Command:** `npm run build:cloud`
- **Start Command:** `npm start`
- **Variables:** `MONGODB_URI`, `JWT_SECRET` y `NODE_ENV=production`

En producción, Express sirve el contenido compilado de `client/dist`.

---

## 🗄️ MongoDB Atlas

1. Crea un clúster en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Crea un usuario en **Database Access**.
3. En **Network Access**, autoriza únicamente las IP necesarias para desarrollo o las direcciones de salida de tu plataforma de despliegue.
4. Copia la cadena de conexión desde **Connect → Drivers**.
5. Reemplaza `<password>` y guarda el resultado como `MONGODB_URI`.

Ejemplo:

```text
mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/mecanet?retryWrites=true&w=majority
```

---

## 📜 Scripts útiles

| Comando | Descripción |
| --- | --- |
| `npm start` | Inicia el servidor en modo normal |
| `npm run dev` | Inicia el backend para desarrollo |
| `npm run setup` | Asistente para crear el archivo `.env` |
| `npm run setup:local` | Crea `.env` local y genera JWT sin reemplazar un secreto válido |
| `npm run test:setup` | Verifica generación local, conservación de secretos y bloqueo en nube |
| `npm run setup-client` | Valida configuración, recopila datos y reinicializa MongoDB con respaldo recuperable |
| `npm run test:setup-client` | Prueba validación y recuperación usando una base simulada |
| `npm run create-admin` | Agrega un administrador con credenciales elegidas; conserva usuarios y configuración |
| `npm run seed` | Carga datos de ejemplo |
| `npm run build:cloud` | Instala y compila el frontend para despliegue conjunto |
| `npm run build:all` | Genera la distribución local de Windows |
| `npm run package:release` | Empaqueta una distribución existente |
| `npm run release` | Ejecuta el flujo automatizado de publicación |
| `npm --prefix client run test:run` | Ejecuta las pruebas del frontend una vez |

---

## 📁 Estructura del proyecto

```text
MECANET/
├── client/          # React, páginas, componentes, estado y cliente HTTP
├── config/          # Conexión y configuración del backend
├── controllers/     # Lógica de negocio
├── middleware/      # Autenticación, errores, logs y rendimiento
├── models/          # Esquemas de MongoDB
├── routes/          # Endpoints bajo /api
├── services/        # Correo, auditoría, logs y actualizaciones
├── sistema/         # Lanzadores y asistentes de Windows
├── scripts/         # Datos, compilación, empaquetado y mantenimiento
└── server.js        # Entrada de Express
```

---

## 🔄 Estado de las actualizaciones

Al ejecutar `INICIAR-MECANET.bat` o `CONFIGURAR-INICIAL.bat`, MECANET consulta el último Release publicado de `SrEdgarR/MECANET`. Si encuentra una versión más reciente, muestra ambas versiones y las notas de cambios, y solicita confirmación antes de descargar el ZIP. Si se rechaza la actualización o GitHub no responde, continúa con la versión instalada. Si se acepta, valida el ZIP, prepara las dependencias y aplica los archivos; la configuración local `.env` permanece intacta.

El publicador `npm run release` exige notas de cambios y `GITHUB_TOKEN`, genera `MECANET-vX.Y.Z.zip`, lo adjunta a un Release borrador y publica el Release cuando la subida termina. La instalación automática requiere Windows, PowerShell y conexión a internet. Si MECANET ya está ejecutándose, cierre la instancia antes de volver a abrir el lanzador para actualizar.

Si el repositorio es privado, cada instalación necesita `GITHUB_READ_TOKEN` en su `.env` con permiso de lectura de contenidos. No coloque el token de publicación en el ZIP. Sin un Release accesible, MECANET continúa con la versión instalada.

---

## 🧪 Verificación

```bash
npm --prefix client run test:run
npm --prefix client run build
```

El backend no define todavía una suite automática en `package.json`; sus scripts de diagnóstico están en `scripts/`.

---

## 🤝 Contribuir

1. Crea un fork.
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`.
3. Realiza y verifica los cambios.
4. Crea un commit descriptivo.
5. Envía la rama y abre un Pull Request.

---

## 📄 Licencia

El `package.json` declara la licencia **ISC**. El repositorio no incluye actualmente un archivo `LICENSE` independiente.

---

## 💬 Soporte

Para problemas o solicitudes, abre un [issue](https://github.com/SrEdgarR/MECANET/issues).

---

⭐ **Si MECANET te resulta útil, dale una estrella al proyecto.**

## Seguridad y publicación

- Requiere Node.js 22.12 o posterior; el paquete portable utiliza Node.js 24 LTS.
- Mantén las credenciales en `.env` local o en las variables de Railway. `.env.railway` no es necesario ni se distribuye.
- Cada instalación crea sus propias credenciales. No hay cuentas con contraseñas fijas en los scripts.
- Los paquetes públicos se generan desde archivos incluidos en Git y se compilan sin configuraciones privadas. No publiques una carpeta de instalación ya configurada.
- `npm run package:release` genera el ZIP para GitHub; `npm run build:all` prepara el portable. Archiva la salida anterior antes de reconstruir la misma versión.
- Las actualizaciones requieren confirmación y un SHA-256 proporcionado por GitHub. Conservan una copia local para recuperación en `.mecanet-update-*`.
- Una recuperación de configuración interrumpida exige una nueva confirmación. Detén todas las instancias que utilizan esa base antes de configurar o recuperar datos.
- Los cambios de contraseña, rol o activación revocan las sesiones anteriores. Las contraseñas nuevas requieren al menos 12 caracteres y no pueden superar 72 bytes.
- El ejemplo de Taller Mecánico El Rayo es ficticio.

Las comprobaciones de regresión están en `npm run test:security`, `npm run test:setup-client` y las pruebas del cliente. Ejecútalas en un entorno aislado con datos ficticios; no contra una base de producción.
