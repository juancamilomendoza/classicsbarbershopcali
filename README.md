# TUNERO CLASSIC BARBER

Plataforma web para reservar turnos en TUNERO CLASSIC BARBER y para que cada
peluquero administre su agenda, horarios y ausencias.

## Arquitectura

Todo funciona con servicios gratuitos:

| Pieza | Dónde vive | Qué hace |
| --- | --- | --- |
| Página web | GitHub Pages (`web/`) | Pantallas para clientes y peluqueros |
| API | Google Apps Script (`apps-script/`) | Reglas de negocio, horarios, permisos, correos |
| Datos | Google Sheets | Una pestaña por tabla |

La lógica vive en Apps Script, no en el navegador. El candado de Apps Script
(`LockService`) hace que las reservas se validen y guarden de una en una, así
que dos clientes no pueden quedarse con el mismo horario.

## Decisiones del negocio

- Los clientes **no crean cuenta**: reservan con nombre, celular y correo, y
  reciben un código para consultar, cancelar o reprogramar su cita.
- Los peluqueros entran con **"Iniciar sesión con Google"** (gratis). Solo
  pueden entrar los correos registrados en la pestaña `Peluqueros`; no se
  guardan contraseñas.
- La duración de una cita es la suma de sus servicios: Corte 20 min, Barba 5 min,
  Cejas 30 min (corte + barba = 25, los tres = 55).
- Los clientes solo reservan para el **día calendario siguiente**, según la hora
  de Colombia (`America/Bogota`).
- Los horarios se ofrecen cada 15 minutos y justo al terminar otra cita.
- El cliente puede cancelar o reprogramar hasta 2 horas antes.
- Avisos por correo (Gmail, gratis) y dentro de la app para los peluqueros.
- Sin pagos en esta versión.

Estos valores se cambian en [`apps-script/Config.js`](apps-script/Config.js).

## Estructura

```
apps-script/        Código de la API (se copia al proyecto de Apps Script)
  Config.js         Valores configurables
  Schema.js         Pestañas y columnas de la hoja
  Db.js             Lectura y escritura de la hoja
  SheetsBackend.js  Conexión con Google Sheets y candado de reservas
  Time.js           Fechas y horas en la zona horaria de la peluquería
  Availability.js   Motor de disponibilidad (cálculo de horarios libres)
  Agenda.js         Carga la agenda de un peluquero desde la hoja
  Bookings.js       Creación de citas
  Clientes.js       Consultar, cancelar y reprogramar con celular + código
  GoogleAuth.js     Inicio de sesión con Google de los peluqueros
  Sesiones.js       Tokens de sesión firmados
  Peluqueros.js     Panel del peluquero: agenda, estados, turnos manuales, servicios
  Horario.js        Jornada, descansos, ausencias, bloqueos y pausa de reservas
  Notify.js         Correos y avisos (pestañas Envios y Notificaciones)
  Registro.js       Historial de cambios
  Setup.js          Función instalar(): crea las pestañas
  Api.js            Punto de entrada de la API (doPost)
web/                Página web (HTML, CSS y JavaScript, sin compilar)
  js/config.js      Dirección de la API
  js/demo.js        Modo demostración (sin API, datos en el navegador)
  js/app.js         Pantallas del cliente
  js/panel.js       Panel del peluquero
test/               Pruebas automáticas (Node.js)
scripts/            Servidor local para probar la página
```

## Instalar la hoja (fase 1)

1. Con la cuenta de Gmail de la barbería, cree una hoja nueva en
   [Google Sheets](https://sheets.new).
2. En la hoja, abra **Extensiones → Apps Script**.
3. Por cada archivo `.js` de la carpeta `apps-script/`, cree un archivo con el
   mismo nombre (botón **+ → Secuencia de comandos**) y pegue su contenido.
   Borre el `Código.gs` que viene por defecto.
4. En **Configuración del proyecto** (engranaje), active *Mostrar el archivo de
   manifiesto "appsscript.json"* y reemplace su contenido por el de
   `apps-script/appsscript.json`.
5. En el editor, elija la función `instalar` y pulse **Ejecutar**. La primera vez
   Google pedirá permiso para usar la hoja; acéptelo.
6. Vuelva a la hoja: verá las pestañas creadas y los servicios Corte, Barba y Cejas.

`instalar` se puede ejecutar varias veces sin perder datos.

> Recomendación: no edite a mano las pestañas `Citas` y `Peluqueros`; la app
> valida reglas que la hoja no ve. Puede agregar columnas propias al final de
> cualquier pestaña: la app las conserva.

## Publicar la API

1. En el editor de Apps Script, pulse **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**. *Ejecutar como*: **Yo**. *Quién tiene acceso*:
   **Cualquier usuario**. Pulse **Implementar** y autorice los permisos (hoja y
   envío de correos).
3. Copie la **URL de la aplicación web** (termina en `/exec`) y péguela en
   `API_URL` dentro de [`web/js/config.js`](web/js/config.js).

Cada vez que cambie el código de Apps Script, use **Implementar → Gestionar
implementaciones → Editar → Versión: nueva** para que la URL siga siendo la misma.

Para reintentar correos fallidos automáticamente, en **Activadores** (reloj)
agregue uno para la función `reintentarEnvios`, por tiempo, cada hora.

## Agregar un peluquero

En la pestaña `Peluqueros`, agregue una fila con:

| Columna | Valor |
| --- | --- |
| `id` | Un número que no se repita (1, 2, 3…) |
| `nombre` | Como lo verán los clientes |
| `correo` | **Su cuenta de Gmail** (con ella inicia sesión) |
| `celular` | Opcional |
| `version_sesion` | `0` |
| `puede_editar_servicios` | `SI` si puede cambiar el catálogo y los precios, si no `NO` |
| `recibe_reservas` | `SI` |
| `activo` | `SI` (ponga `NO` para quitarle el acceso) |

El peluquero configura su jornada, descansos, vacaciones, días libres,
permisos, bloqueos y horarios especiales desde **Mi horario** en su panel.
Si un cambio afecta citas ya confirmadas, la app muestra la lista antes de
guardarlo y pregunta si cancelarlas (avisando a los clientes por correo) o
conservarlas para moverlas una por una.

El peluquero entra desde el enlace **Acceso peluqueros** al pie de la página y
marca en **Servicios** qué servicios presta. Para cerrar todas sus sesiones
abiertas (por ejemplo, si pierde el celular), sume 1 a su `version_sesion`.

## Configurar "Iniciar sesión con Google" (una sola vez, gratis)

1. Entre a [Google Cloud Console](https://console.cloud.google.com/) con la
   cuenta de la barbería y cree un proyecto (por ejemplo "Tunero").
2. En **APIs y servicios → Pantalla de consentimiento de OAuth**, elija
   **Externo**, ponga el nombre "TUNERO CLASSIC BARBER" y su correo, y guarde.
   Luego pulse **Publicar app** para que cualquier peluquero pueda entrar.
3. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de
   OAuth**, elija **Aplicación web**. En **Orígenes autorizados de JavaScript**
   agregue la dirección de la página, por ejemplo
   `https://juancamilomendoza.github.io` (y `http://localhost:8080` para
   pruebas). Guarde y copie el **ID de cliente** (termina en
   `.apps.googleusercontent.com`).
4. En el editor de Apps Script: **Configuración del proyecto → Propiedades de la
   secuencia de comandos → Agregar propiedad**. Nombre: `GOOGLE_CLIENT_ID`,
   valor: el ID copiado.
5. Publique una nueva versión de la API (ver arriba), porque esta fase usa un
   permiso nuevo para consultar a Google.

## Publicar la página en GitHub Pages

1. El repositorio debe ser **público** (GitHub Pages gratis no publica
   repositorios privados).
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada cambio en la rama `main` publica la página automáticamente. La dirección
   aparece en **Settings → Pages**.

Mientras `API_URL` esté vacía, la página funciona en **modo demostración**:
ejecuta la misma lógica en el navegador con dos peluqueros de ejemplo y guarda
los datos solo en ese equipo. Sirve para probar el flujo antes de conectar la hoja.

## Probar la página en su computador

```
npm run web
```

y abra http://localhost:8080 (modo demostración).

## Pruebas

Requiere Node.js 20 o superior. No hay dependencias que instalar.

```
npm test
```

Las pruebas cargan el código de `apps-script/` con una hoja en memoria y
verifican los criterios de aceptación del documento de requerimientos:
duraciones de 25 y 55 minutos, turnos que no caben antes de un descanso o del
cierre, vacaciones, reservas simultáneas, reservas solo para mañana, el
regreso de la disponibilidad al terminar unas vacaciones y que nadie pueda ver
la cita de otra persona cambiando el código o el celular. GitHub ejecuta las
pruebas en cada cambio.

## Plan

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Base, pestañas de la hoja, motor de disponibilidad | Hecha |
| 2 | Reserva del cliente (página web + API) | Hecha |
| 3 | Inicio de sesión con Google y agenda del peluquero | Hecha |
| 4 | Horario, descansos, bloqueos, vacaciones y ausencias | Hecha |
| 5 | Notificaciones, historial y publicación en GitHub Pages | Pendiente |
