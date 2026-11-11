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
  'sesion.google': function (d) {
    return iniciarSesionGoogle(d.credencial);
  },
  'sesion.config': function () {
    var id = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
    return { googleClientId: id || null };
  },
};

/** Acciones del panel del peluquero: requieren `token` de sesión válido. */
var ACCIONES_PELUQUERO = {
  'yo': function (p) {
    return { peluquero: perfilPeluquero(p), noLeidas: contarNoLeidas(p) };
  },
  'agenda': function (p, d) {
    return agendaDelPeluquero(p, d.fecha, d.vista);
  },
  'turno': function (p, d) {
    return detalleTurno(p, d.id);
  },
  'turno.estado': function (p, d) {
    return cambiarEstadoTurno(p, d.id, d.estado, d.motivo);
  },
  'turno.horarios': function (p, d) {
    return horariosParaMover(p, d.id, d.fecha);
  },
  'turno.mover': function (p, d) {
    return moverTurno(p, d.id, d.fecha, d.inicio);
  },
  'manual.horarios': function (p, d) {
    return horariosParaManual(p, d.servicioIds, d.fecha);
  },
  'manual.crear': function (p, d) {
    return registrarTurnoManual(p, d);
  },
  'servicios': function (p) {
    return serviciosDelPeluquero(p);
  },
  'servicios.prestar': function (p, d) {
    return guardarServiciosQuePresta(p, d.servicioIds);
  },
  'servicios.guardar': function (p, d) {
    return guardarServicio(p, d.servicio || {});
  },
  'notificaciones': function (p) {
    return notificacionesDelPeluquero(p);
  },
  'notificaciones.leer': function (p) {
    return marcarNotificacionesLeidas(p);
  },
  'registro': function (p) {
    return registroDelPeluquero(p);
  },
};

/** Ejecuta una acción y devuelve el objeto de respuesta (sin envolver en HTTP). */
function atender(peticion) {
  try {
    Db.reiniciar();
    peticion = peticion || {};
    var accion = peticion.accion;
    var propia = function (tabla) { return Object.prototype.hasOwnProperty.call(tabla, accion); };
    if (propia(ACCIONES_PUBLICAS)) return { ok: true, datos: ACCIONES_PUBLICAS[accion](peticion) };
    if (propia(ACCIONES_PELUQUERO)) {
      var peluquero = peluqueroDeSesion(peticion.token);
      return { ok: true, datos: ACCIONES_PELUQUERO[accion](peluquero, peticion) };
    }
    throw AppError('Acción desconocida.', 'ACCION_DESCONOCIDA');
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
