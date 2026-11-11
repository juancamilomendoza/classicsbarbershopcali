/**
 * Estructura de la hoja: una pestaña por tabla y una columna por campo.
 *
 * Tipos de columna (cómo se leen y escriben en la hoja):
 *   texto  → texto tal cual
 *   entero → número entero (vacío = null)
 *   sino   → casilla "SI" / "NO"
 *   fecha  → texto 'YYYY-MM-DD'
 *   hora   → texto 'HH:MM' en la hoja; minutos desde medianoche en el código
 *   dia    → nombre del día ('lunes'…) en la hoja; número 0–6 en el código
 *   json   → texto JSON
 *
 * Todas las columnas se guardan con formato de texto plano para que Sheets no
 * convierta fechas u horas por su cuenta.
 */
var TABLAS = {
  Peluqueros: {
    id: 'entero',
    nombre: 'texto',
    correo: 'texto',
    celular: 'texto',
    // Subir este número cierra todas las sesiones abiertas del peluquero.
    version_sesion: 'entero',
    puede_editar_servicios: 'sino',
    recibe_reservas: 'sino',
    activo: 'sino',
    creado_en: 'texto',
  },
  Servicios: {
    id: 'entero',
    nombre: 'texto',
    descripcion: 'texto',
    duracion_min: 'entero',
    precio: 'entero',
    activo: 'sino',
    orden: 'entero',
  },
  ServiciosPeluquero: {
    peluquero_id: 'entero',
    servicio_id: 'entero',
  },
  HorarioSemanal: {
    peluquero_id: 'entero',
    dia_semana: 'dia',
    inicio: 'hora',
    fin: 'hora',
  },
  Descansos: {
    id: 'entero',
    peluquero_id: 'entero',
    dia_semana: 'dia',
    inicio: 'hora',
    fin: 'hora',
    nombre: 'texto',
  },
  HorariosEspeciales: {
    id: 'entero',
    peluquero_id: 'entero',
    fecha: 'fecha',
    inicio: 'hora',
    fin: 'hora',
    nota: 'texto',
  },
  // tipo: vacaciones | dia_libre | permiso | imprevista | bloqueo
  // estado: activa | cancelada
  Ausencias: {
    id: 'entero',
    peluquero_id: 'entero',
    tipo: 'texto',
    fecha_inicio: 'fecha',
    fecha_fin: 'fecha',
    inicio: 'hora',
    fin: 'hora',
    motivo: 'texto',
    estado: 'texto',
    creado_en: 'texto',
  },
  // estado: confirmada | en_atencion | completada | cancelada | no_asistio
  // origen: web | manual
  Citas: {
    id: 'entero',
    codigo: 'texto',
    peluquero_id: 'entero',
    cliente_nombre: 'texto',
    cliente_celular: 'texto',
    cliente_correo: 'texto',
    fecha: 'fecha',
    inicio: 'hora',
    fin: 'hora',
    duracion_min: 'entero',
    estado: 'texto',
    origen: 'texto',
    notas: 'texto',
    motivo_cancelacion: 'texto',
    creado_en: 'texto',
    actualizado_en: 'texto',
  },
  // Copia de los servicios al reservar: si el catálogo cambia después, la cita
  // confirmada no se altera en silencio (RNF-018).
  CitaServicios: {
    cita_id: 'entero',
    servicio_id: 'entero',
    nombre: 'texto',
    duracion_min: 'entero',
    precio: 'entero',
  },
  Notificaciones: {
    id: 'entero',
    peluquero_id: 'entero',
    mensaje: 'texto',
    enlace: 'texto',
    leida: 'sino',
    creado_en: 'texto',
  },
  // estado: pendiente | enviado | fallido (RNF-017)
  Envios: {
    id: 'entero',
    destinatario: 'texto',
    asunto: 'texto',
    cuerpo: 'texto',
    estado: 'texto',
    intentos: 'entero',
    ultimo_error: 'texto',
    creado_en: 'texto',
    actualizado_en: 'texto',
  },
  // Registro de operaciones relevantes (RF-041, RNF-014). Nunca guarda claves.
  Registro: {
    id: 'entero',
    fecha_hora: 'texto',
    actor: 'texto',
    peluquero_id: 'entero',
    accion: 'texto',
    entidad: 'texto',
    entidad_id: 'entero',
    detalle: 'json',
  },
};

/** Estados de cita que ocupan tiempo en la agenda. */
var ESTADOS_QUE_OCUPAN = ['confirmada', 'en_atencion', 'completada'];

var SERVICIOS_INICIALES = [
  { nombre: 'Corte', descripcion: 'Corte de cabello clásico o moderno.', duracion_min: 20 },
  { nombre: 'Barba', descripcion: 'Perfilado y arreglo de barba.', duracion_min: 5 },
  { nombre: 'Cejas', descripcion: 'Diseño y arreglo de cejas.', duracion_min: 30 },
];
