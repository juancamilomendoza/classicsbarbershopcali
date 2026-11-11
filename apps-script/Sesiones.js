/**
 * Sesiones de los peluqueros.
 *
 * Tras iniciar sesión, la API entrega un token firmado con un secreto que solo
 * conoce el script (propiedad SECRETO_SESION). La página lo envía en cada
 * petición y el servidor lo verifica siempre (RNF-005).
 *
 * Formato: "<id>.<version>.<vence>.<firma>". La versión sale de la columna
 * version_sesion de la pestaña Peluqueros: subirla cierra todas las sesiones
 * abiertas de ese peluquero.
 */
var DURACION_SESION_DIAS = 7;

function secretoSesion() {
  var props = PropertiesService.getScriptProperties();
  var secreto = props.getProperty('SECRETO_SESION');
  if (!secreto) {
    secreto = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRETO_SESION', secreto);
  }
  return secreto;
}

function firmar(texto) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, secretoSesion())).replace(/=+$/, '');
}

function igualesSeguro(a, b) {
  if (a.length !== b.length) return false;
  var diferencia = 0;
  for (var i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

function crearSesion(peluquero) {
  var vence = Reloj.ahora().getTime() + DURACION_SESION_DIAS * 86400000;
  var base = peluquero.id + '.' + (peluquero.version_sesion || 0) + '.' + vence;
  return base + '.' + firmar(base);
}

/** Devuelve el peluquero dueño del token o lanza SESION_INVALIDA. */
function peluqueroDeSesion(token) {
  var partes = String(token || '').split('.');
  var invalida = AppError('Tu sesión expiró. Vuelve a iniciar sesión.', 'SESION_INVALIDA');
  if (partes.length !== 4) throw invalida;
  var base = partes.slice(0, 3).join('.');
  if (!igualesSeguro(firmar(base), partes[3])) throw invalida;
  if (Number(partes[2]) < Reloj.ahora().getTime()) throw invalida;
  var peluquero = Db.porId('Peluqueros', Number(partes[0]));
  if (!peluquero || !peluquero.activo || (peluquero.version_sesion || 0) !== Number(partes[1])) throw invalida;
  return peluquero;
}

/** Datos del peluquero que puede ver la página (nunca claves ni hashes). */
function perfilPeluquero(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    correo: p.correo,
    celular: p.celular,
    recibeReservas: p.recibe_reservas,
    puedeEditarServicios: p.puede_editar_servicios,
  };
}
