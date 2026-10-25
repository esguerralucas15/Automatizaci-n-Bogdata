# Bitácora de Trámites de Pago – BOGDATA

Aplicación web para auditar el trámite de aprobación de registros de pago en BOGDATA.
Cada responsable registra su paso después de hacerlo en BOGDATA; la app guarda quién y a qué hora,
avisa por correo al siguiente responsable y la administradora ve el consolidado.

Mismo stack y diseño que **Horas-Compensacion** (Express 5 + EJS + MongoDB Atlas, Render).
La arquitectura completa está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Puesta en marcha (local)

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
```

Completa en `.env` la cadena de Atlas (base `bitacora_pagos` en el cluster de Horas) y `SESSION_SECRET`.

```bash
npm run datos-prueba        # carga las personas inventadas de scripts/datos-prueba
npm run dev                 # http://localhost:3000
```

Para entrar usa cualquiera de los correos de prueba, por ejemplo:

| Correo | Rol |
|---|---|
| `revisor1@prueba.gov.co` | Revisor |
| `director@prueba.gov.co` | Responsable de presupuesto |
| `subsec.institucional@prueba.gov.co` | Ordenador del gasto |
| `admin@prueba.gov.co` | Administradora |

## Usuarios reales

1. El área diligencia `docs/Plantilla_Usuarios_Bitacora.xlsx`.
2. Guarda el archivo en `datos/` (carpeta ignorada por git: tiene datos personales).
3. `npm run cargar-usuarios -- datos/usuarios.xlsx`

Si el archivo tiene errores no se carga nada y el script dice qué filas corregir.
Se puede correr varias veces: no duplica personas.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm test` | Pruebas (flujo de estados, bitácora, correos, plantilla de usuarios, fechas) |
| `npm run cargar-usuarios -- <archivo.xlsx>` | Carga o actualiza usuarios desde la plantilla |
| `npm run datos-prueba` | Carga los usuarios inventados |
| `npm run verificar-bitacora` | Verifica que nadie haya alterado la bitácora |

## Pantallas

| Ruta | Quién | Qué hace |
|---|---|---|
| `/bandeja` | revisor, director, subsecretario | Trámites que esperan mi registro |
| `/tramites/nuevo` | revisor | Registrar el cargue en BOGDATA (crea el trámite) |
| `/tramites` | todos | Lista con filtro por estado y búsqueda por trámite, WF, lote o documento |
| `/tramites/:id` | todos | Avance, datos, paso a registrar (si me corresponde) y línea de tiempo |
| `/admin/dashboard` | admin | Indicadores y trámites en curso (los más detenidos primero) |
| `/admin/usuarios` | admin | Personas, roles y destinatarios de copia |

Cada paso se guarda en una transacción: trámite + evento de la bitácora + correo en cola.
Los correos quedan en la colección `notificaciones` con estado `pendiente`; el envío real
(despachador) es el siguiente paso del plan.

## Estructura

```
config/       configuración, conexión a Atlas, sesión
controllers/  login, bandeja, administración
middlewares/  sesión y roles, errores
models/       Usuario, Tramite, Evento (bitácora), Notificacion, Configuracion, Contador
routes/
services/     flujo.js (máquina de estados), registrarAccion.js, bitacora.js, hash.js,
              destinatarios.js, correo/plantillas.js, usuariosExcel.js, tiempo.js
scripts/      cargarUsuarios.js, verificarBitacora.js, datos-prueba/
views/        EJS con los parciales de Horas-Compensacion
test/
```
