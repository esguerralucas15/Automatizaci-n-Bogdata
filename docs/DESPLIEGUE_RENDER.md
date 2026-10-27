# Despliegue en Render

Mismo esquema que Horas-Compensacion: un servicio web en Render conectado a MongoDB Atlas.
Producción usa la base **`bitacora_produccion`** (usuario `app_bitacora_produccion`) y envía
los correos con la cuenta Gmail de la bitácora a las personas reales.

## Antes de empezar: horas del plan gratuito

El plan gratuito de Render da **750 horas al mes por cuenta** (no por servicio). Un servicio
despierto todo el mes gasta ~744 h. Si en la misma cuenta ya está Horas-Compensacion despierta
con el despertador, la bitácora no cabe despierta también: al pasar las 750 h Render suspende
**todos** los servicios gratuitos de la cuenta hasta el mes siguiente.

Opciones:
1. **Plan Starter (~USD 7/mes) para la bitácora.** Nunca se duerme; recomendado para producción.
2. **Gratis sin despertador.** Se duerme tras 15 min sin uso; la primera visita tarda ~1 minuto.
   Los correos de cada paso salen igual (se envían al registrar el paso); los reintentos de
   correos fallidos solo corren mientras está despierta.
3. **Gratis en otra cuenta de Render** (p. ej. con la cuenta Gmail de la bitácora). Tiene sus
   propias 750 h. El repositorio debe estar accesible desde esa cuenta.

## 1. Crear el servicio
1. https://render.com → **New → Web Service** → repositorio `Automatizaci-n-Bogdata`, rama `main`.
   (Si Render detecta `render.yaml` puede ofrecer crearlo como Blueprint: también sirve.)
2. Nombre: `bitacora-pagos` → la dirección será `https://bitacora-pagos.onrender.com`
   (si el nombre está ocupado, Render agrega letras al final: usar la que muestre).
3. Runtime **Node** · Build `npm install` · Start `npm start` · Region **Ohio** ·
   Health Check Path `/salud` · Instance Type según la opción elegida arriba.

## 2. Variables de entorno
En **Environment → Add from .env**, pegar el contenido de `.env.produccion` y luego:
- `NODE_ENV` = `production` (no está en el archivo a propósito: en local rompería el login).
- `URL_APP` = la dirección real del servicio, p. ej. `https://bitacora-pagos.onrender.com`.
- Borrar `PORT` si aparece (Render pone el suyo).
- Confirmar que **`CORREO_REDIRIGIR_A` quede vacío o no exista**: en producción los correos van
  a las personas reales.

## 3. Atlas
Atlas ya permite conexiones desde cualquier IP (`0.0.0.0/0`), así que Render se conecta sin más.
El usuario de producción solo puede leer y escribir en `bitacora_produccion`.

## 4. Despertador (solo si el servicio no es Starter y hay horas disponibles)
cron-job.org → nueva tarea → `https://bitacora-pagos.onrender.com/salud` cada 10 minutos.

## 5. Verificar
1. `https://…onrender.com/salud` debe responder `{"estado":"ok"}`.
2. En los logs de Render debe aparecer `Correo activo: Gmail, remitente bitacora.pagos.sed@gmail.com`
   **sin** "(PRUEBAS…)".
3. Entrar con un usuario administrador, revisar Usuarios (13 personas) y Bitácora → Verificar integridad.
4. `https://…onrender.com/privacidad` debe mostrar la política (se puede usar luego en Google Cloud
   → Información de la marca en lugar del enlace de GitHub).

## Cambiar algo después
Cada push a `main` vuelve a desplegar solo. Las variables se cambian en Render → Environment
(al guardar, Render reinicia el servicio).
