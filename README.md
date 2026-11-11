# TUNERO CLASSIC BARBER

Plataforma web para reservar turnos en TUNERO CLASSIC BARBER y para que cada
peluquero administre su agenda, horarios y ausencias.

## Arquitectura

Todo funciona con servicios gratuitos:

| Pieza | Dónde vive | Qué hace |
| --- | --- | --- |
| Página web | GitHub Pages (`web/`, fase 2) | Pantallas para clientes y peluqueros |
| API | Google Apps Script (`apps-script/`) | Reglas de negocio, horarios, permisos, correos |
| Datos | Google Sheets | Una pestaña por tabla |

La lógica vive en Apps Script, no en el navegador. El candado de Apps Script
(`LockService`) hace que las reservas se validen y guarden de una en una, así
que dos clientes no pueden quedarse con el mismo horario.

## Decisiones del negocio

- Los clientes **no crean cuenta**: reservan con nombre, celular y correo, y
  reciben un código para consultar, cancelar o reprogramar su cita. Solo los
  peluqueros inician sesión.
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
  Registro.js       Historial de cambios
  Setup.js          Función instalar(): crea las pestañas
test/               Pruebas automáticas (Node.js)
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

## Pruebas

Requiere Node.js 20 o superior. No hay dependencias que instalar.

```
npm test
```

Las pruebas cargan el código de `apps-script/` con una hoja en memoria y
verifican los criterios de aceptación del documento de requerimientos:
duraciones de 25 y 55 minutos, turnos que no caben antes de un descanso o del
cierre, vacaciones, reservas simultáneas, reservas solo para mañana y el
regreso de la disponibilidad al terminar unas vacaciones. GitHub ejecuta las
pruebas en cada cambio.

## Plan

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Base, pestañas de la hoja, motor de disponibilidad | Este cambio |
| 2 | Reserva del cliente (página web + API) | Pendiente |
| 3 | Agenda del peluquero | Pendiente |
| 4 | Horario, descansos, bloqueos, vacaciones y ausencias | Pendiente |
| 5 | Notificaciones, historial y publicación en GitHub Pages | Pendiente |
