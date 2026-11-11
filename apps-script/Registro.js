/**
 * Registro de operaciones relevantes (RF-041, RNF-014): quién, qué y cuándo.
 * Nunca guarda contraseñas, códigos de cita ni otros secretos.
 */
var CLAVES_SECRETAS = /clave|contrasena|password|token|codigo|hash|sal$/i;

function registrar(evento) {
  var detalle = null;
  if (evento.detalle) {
    detalle = {};
    Object.keys(evento.detalle).forEach(function (k) {
      if (!CLAVES_SECRETAS.test(k)) detalle[k] = evento.detalle[k];
    });
  }
  Db.insertar('Registro', {
    fecha_hora: Reloj.ahora().toISOString(),
    actor: evento.actor || 'sistema',
    peluquero_id: evento.peluqueroId || null,
    accion: evento.accion,
    entidad: evento.entidad || null,
    entidad_id: evento.entidadId || null,
    detalle: detalle,
  });
}
