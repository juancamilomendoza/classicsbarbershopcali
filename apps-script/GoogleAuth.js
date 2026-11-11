/**
 * Inicio de sesión de los peluqueros con su cuenta de Google.
 *
 * La página usa "Iniciar sesión con Google" (Google Identity Services, gratis)
 * y envía aquí la credencial que Google le entrega. El script la verifica con
 * Google, comprueba que fue emitida para nuestra aplicación y que el correo
 * está en la pestaña Peluqueros como activo. No se guardan contraseñas.
 *
 * El ID de cliente se configura en la propiedad del script GOOGLE_CLIENT_ID
 * (ver README).
 */
function clienteGoogleId() {
  var id = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!id) throw AppError('Falta configurar el inicio de sesión con Google (GOOGLE_CLIENT_ID).', 'SIN_CONFIGURAR');
  return id;
}

/** Pide a Google los datos de la credencial. Se reemplaza en las pruebas. */
function consultarCredencialGoogle(credencial) {
  var r = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credencial),
    { muteHttpExceptions: true }
  );
  if (r.getResponseCode() !== 200) return null;
  return JSON.parse(r.getContentText());
}

function iniciarSesionGoogle(credencial) {
  var datos = credencial ? consultarCredencialGoogle(String(credencial)) : null;
  var emisores = ['accounts.google.com', 'https://accounts.google.com'];
  var valida =
    datos &&
    datos.aud === clienteGoogleId() &&
    emisores.indexOf(datos.iss) !== -1 &&
    String(datos.email_verified) === 'true' &&
    Number(datos.exp) * 1000 > Reloj.ahora().getTime();
  if (!valida) throw AppError('No pudimos verificar tu cuenta de Google. Intenta de nuevo.', 'CREDENCIAL_INVALIDA');

  var correo = String(datos.email).toLowerCase();
  var peluquero = Db.donde('Peluqueros', function (p) {
    return p.activo && String(p.correo).trim().toLowerCase() === correo;
  })[0];
  if (!peluquero) {
    throw AppError(
      'La cuenta ' + correo + ' no está registrada como peluquero. Pide que la agreguen en la pestaña Peluqueros.',
      'NO_AUTORIZADO'
    );
  }
  registrar({ actor: 'peluquero:' + peluquero.id, peluqueroId: peluquero.id, accion: 'inicio_sesion' });
  return { token: crearSesion(peluquero), peluquero: perfilPeluquero(peluquero) };
}
