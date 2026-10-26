# Envío de correos con Gmail

La bitácora envía todos los avisos desde **una sola cuenta de Gmail** (p. ej.
`bitacora.pagos.sed@gmail.com`) usando la API de Gmail.

## Por qué Gmail y no Outlook ni Brevo

| Opción | Resultado |
|---|---|
| Cuenta institucional por Microsoft Graph | La Secretaría no permite registrar aplicaciones (requiere TI). |
| Power Automate | Conectores bloqueados en el entorno de la Secretaría. |
| Brevo con remitente institucional | El DMARC de `educacionbogota.gov.co` lo impide sin autenticar el dominio (TI). |
| Brevo con remitente Gmail | Brevo reescribe el remitente a `@brevosend.com`; la Secretaría lo acepta y lo descarta en silencio. |
| **API de Gmail** | El correo sale de los servidores de Google con las firmas de `@gmail.com`. Un correo de prueba manual desde la cuenta llegó a la bandeja de entrada institucional. |

Límite de una cuenta Gmail gratuita: unos 500 destinatarios por día (sobra para el trámite).

## Configuración (una sola vez, ~15 minutos)

Todo se hace **con la cuenta de la bitácora**, no con una cuenta personal.

### 1. Proyecto en Google Cloud
1. Entra a <https://console.cloud.google.com> con la cuenta de la bitácora y acepta los términos.
2. Arriba, en el selector de proyectos: **Proyecto nuevo** → nombre `Bitacora Pagos` → **Crear**. Selecciónalo.
3. En el buscador escribe **Gmail API** → ábrela → **Habilitar**.

### 2. Pantalla de consentimiento
1. Menú ☰ → **APIs y servicios** → **Pantalla de consentimiento de OAuth** (o **Google Auth Platform**) → **Comenzar**.
2. Nombre de la app: `Bitácora de Pagos`. Correo de asistencia: la cuenta de la bitácora.
3. Público: **Externo**. Información de contacto: la cuenta de la bitácora. Acepta la política → **Crear**.
4. Entra a **Público** → **Publicar app** → confirmar. El estado debe quedar **En producción**.
   > Importante: si queda "En prueba", Google vence la autorización a los 7 días y los correos dejan de salir.

### 3. Cliente OAuth
1. **Clientes** → **+ Crear cliente**.
2. Tipo de aplicación: **App de escritorio**. Nombre: `bitacora` → **Crear**.
3. Copia el **ID de cliente** y el **Secreto del cliente**.

### 4. `.env`
```
CORREO_REMITENTE=bitacora.pagos.sed@gmail.com
GMAIL_CLIENT_ID=....apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-...
```

### 5. Autorizar y probar
```
npm run autorizar-gmail
```
Se abre el navegador. Inicia sesión con la cuenta de la bitácora. Google mostrará
**"Google no verificó esta app"**: es normal porque la app es tuya y solo la usa esta cuenta →
**Configuración avanzada** → **Ir a Bitácora de Pagos (no seguro)** → acepta el permiso de
**enviar correo**. El comando guarda `GMAIL_REFRESH_TOKEN` y `CORREO_PROVEEDOR=gmail` en `.env`.

```
npm run probar-correo -- tu.correo@educacionbogota.gov.co
```

## Mantenimiento

- **Cambiar la contraseña** de la cuenta Gmail puede invalidar la autorización: vuelve a correr
  `npm run autorizar-gmail` (en Render, copia el nuevo `GMAIL_REFRESH_TOKEN` a sus variables).
- **Revocar el acceso:** myaccount.google.com → Seguridad → Conexiones con terceros.
- Si la autorización deja de servir, la línea de tiempo muestra "no se pudo enviar" con el motivo.
- **Entrega de la cuenta:** cuando termine el contrato de quien la creó, entregar la contraseña y
  cambiar el teléfono de recuperación al de alguien de planta (Cuenta de Google → Seguridad).
