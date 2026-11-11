/**
 * Fechas y horas de negocio.
 *
 * - Una fecha es una cadena 'YYYY-MM-DD' en la zona horaria de la peluquería.
 * - Una hora es un número de minutos desde la medianoche (por ejemplo 9:30 = 570).
 *
 * Trabajar así evita errores en los límites de día (RNF-016) y no depende de
 * la zona horaria del servidor de Google.
 */

var DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Reloj reemplazable en las pruebas. */
var Reloj = {
  ahora: function () {
    return new Date();
  },
};

/** Fecha y minuto actuales en la zona horaria de la peluquería. */
function ahoraPeluqueria() {
  var texto = Utilities.formatDate(Reloj.ahora(), CONFIG.ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm");
  var partes = texto.split('T');
  return { fecha: partes[0], minutos: aMinutos(partes[1]) };
}

function hoy() {
  return ahoraPeluqueria().fecha;
}

/** Día calendario siguiente: la única fecha que se ofrece a los clientes (RN-004). */
function manana() {
  return sumarDias(hoy(), 1);
}

function esFechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  var d = new Date(valor + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function sumarDias(fecha, dias) {
  var d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000);
}

/** 0 = domingo … 6 = sábado. */
function diaSemana(fecha) {
  return new Date(fecha + 'T00:00:00Z').getUTCDay();
}

/** 'HH:MM' → minutos. Devuelve null si el texto no es una hora válida. */
function aMinutos(texto) {
  var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(texto == null ? '' : texto).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** minutos → 'HH:MM'. */
function aHora(minutos) {
  var h = Math.floor(minutos / 60);
  var m = minutos % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/** Minutos que faltan desde ahora hasta una fecha y hora de la peluquería. */
function minutosHasta(fecha, minutos) {
  var ahora = ahoraPeluqueria();
  return diasEntre(ahora.fecha, fecha) * 1440 + minutos - ahora.minutos;
}

/** Nombre del día ('lunes', 'miércoles'…) → número 0–6, o null. */
function numeroDiaSemana(nombre) {
  var limpio = String(nombre == null ? '' : nombre)
    .trim()
    .toLowerCase()
    .replace('é', 'e')
    .replace('á', 'a');
  var i = DIAS_SEMANA.indexOf(limpio);
  return i === -1 ? null : i;
}

var NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-11-12' → 'jueves 12 de noviembre'. */
function fechaLegible(fecha) {
  return NOMBRES_DIA[diaSemana(fecha)] + ' ' + Number(fecha.slice(8, 10)) + ' de ' + NOMBRES_MES[Number(fecha.slice(5, 7)) - 1];
}

/** 870 → '2:30 p. m.'. */
function horaLegible(minutos) {
  var h = Math.floor(minutos / 60);
  var m = minutos % 60;
  return (h % 12 === 0 ? 12 : h % 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' a. m.' : ' p. m.');
}
