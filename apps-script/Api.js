/**
 * Punto de entrada de la API (aplicación web de Apps Script).
 *
 * La página web envía un POST con un cuerpo JSON { accion, ...datos } como
 * text/plain (así el navegador no hace una consulta CORS previa, que Apps
 * Script no soporta). La respuesta siempre es JSON:
 *   { ok: true, datos }  o  { ok: false, error, codigo }
 */

var ACCIONES_PUBLICAS = {
  'inicio': function () {
    return { negocio: CONFIG.NOMBRE_NEGOCIO, servicios: listarServicios(), peluqueros: listarPeluqueros([]) };
  },
  'peluqueros': function (d) {
    return listarPeluqueros(d.servicioIds);
  },
  'disponibilidad': function (d) {
    return disponibilidadCliente(d.peluqueroId, d.servicioIds);
  },
  'reservar': function (d) {
    var cita = crearCita({
      origen: 'web',
      peluqueroId: d.peluqueroId,
      servicioIds: d.servicioIds,
      fecha: d.fecha,
      inicio: d.inicio,
      cliente: d.cliente,
      notas: d.notas,
      actor: 'cliente',
    });
    notificarCita(cita, 'creada');
    return citaParaCliente(cita);
  },
  'cita.consultar': function (d) {
    return citaParaCliente(buscarCitaCliente(d.celular, d.codigo));
  },
  'cita.cancelar': function (d) {
    return cancelarCitaCliente(d.celular, d.codigo);
  },
  'cita.horarios': function (d) {
    return horariosReprogramacion(d.celular, d.codigo);
  },
  'cita.reprogramar': function (d) {
    return reprogramarCitaCliente(d.celular, d.codigo, d.inicio);
  },
};

/** Ejecuta una acción y devuelve el objeto de respuesta (sin envolver en HTTP). */
function atender(peticion) {
  try {
    Db.reiniciar();
    var accion = peticion && peticion.accion;
    var manejador = Object.prototype.hasOwnProperty.call(ACCIONES_PUBLICAS, accion) ? ACCIONES_PUBLICAS[accion] : null;
    if (!manejador) throw AppError('Acción desconocida.', 'ACCION_DESCONOCIDA');
    return { ok: true, datos: manejador(peticion || {}) };
  } catch (e) {
    if (esAppError(e)) return { ok: false, error: e.message, codigo: e.codigo, datos: e.datos };
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: 'Ocurrió un error inesperado. Intenta de nuevo.', codigo: 'ERROR_INTERNO' };
  }
}

function responderJson(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var peticion;
  try {
    peticion = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return responderJson({ ok: false, error: 'Petición inválida.', codigo: 'PETICION_INVALIDA' });
  }
  return responderJson(atender(peticion));
}

/** Permite comprobar en el navegador que la API está publicada. */
function doGet() {
  return responderJson({ ok: true, datos: { negocio: CONFIG.NOMBRE_NEGOCIO, estado: 'en línea' } });
}
