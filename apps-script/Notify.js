/**
 * Notificaciones (RF-038, RF-039).
 *
 * - Clientes: por correo, enviado con Gmail desde la cuenta dueña del script.
 * - Peluqueros: aviso en la pestaña Notificaciones (se ve en su panel) y correo.
 *
 * Cada correo queda en la pestaña Envios. Si falla, se marca "fallido" y la
 * función reintentarEnvios() lo vuelve a intentar; un fallo nunca revierte ni
 * duplica una reserva (RNF-017).
 */
var MAX_INTENTOS_ENVIO = 5;

function enviarCorreo(destinatario, asunto, cuerpo) {
  if (!destinatario) return null;
  var marca = Reloj.ahora().toISOString();
  var envio = Db.insertar('Envios', {
    destinatario: destinatario,
    asunto: asunto,
    cuerpo: cuerpo,
    estado: 'pendiente',
    intentos: 0,
    creado_en: marca,
    actualizado_en: marca,
  });
  intentarEnvio(envio);
  return envio.id;
}

function intentarEnvio(envio) {
  var cambios = { intentos: (envio.intentos || 0) + 1, actualizado_en: Reloj.ahora().toISOString() };
  try {
    MailApp.sendEmail({ to: envio.destinatario, subject: envio.asunto, body: envio.cuerpo, name: CONFIG.NOMBRE_NEGOCIO });
    cambios.estado = 'enviado';
    cambios.ultimo_error = '';
  } catch (e) {
    cambios.estado = 'fallido';
    cambios.ultimo_error = String(e && e.message ? e.message : e).slice(0, 300);
  }
  Db.actualizar('Envios', envio.id, cambios);
}

/** Reintenta los correos fallidos. Se puede programar con un activador por tiempo. */
function reintentarEnvios() {
  Db.reiniciar();
  Db.donde('Envios', function (e) {
    return e.estado !== 'enviado' && (e.intentos || 0) < MAX_INTENTOS_ENVIO;
  }).forEach(intentarEnvio);
}

function avisarPeluquero(peluqueroId, mensaje, enlace) {
  try {
    Db.insertar('Notificaciones', {
      peluquero_id: peluqueroId,
      mensaje: mensaje,
      enlace: enlace || '',
      leida: false,
      creado_en: Reloj.ahora().toISOString(),
    });
    var p = Db.porId('Peluqueros', peluqueroId);
    if (p && p.correo) enviarCorreo(p.correo, CONFIG.NOMBRE_NEGOCIO + ': ' + mensaje, mensaje);
  } catch (e) {
    console.error('No se pudo avisar al peluquero: ' + e);
  }
}

/** Resumen legible de una cita para correos y pantallas. */
function textoCita(cita, servicios, peluquero) {
  return [
    'Servicios: ' + servicios.map(function (s) { return s.nombre; }).join(', '),
    'Duración: ' + cita.duracion_min + ' minutos',
    'Peluquero: ' + (peluquero ? peluquero.nombre : ''),
    'Fecha: ' + fechaLegible(cita.fecha),
    'Hora: ' + horaLegible(cita.inicio),
  ].join('\n');
}

/**
 * Avisa al cliente y al peluquero de un evento de la cita.
 * evento: 'creada' | 'cancelada' | 'reprogramada'
 */
function notificarCita(cita, evento) {
  try {
    var servicios = Db.donde('CitaServicios', function (s) { return s.cita_id === cita.id; });
    var peluquero = Db.porId('Peluqueros', cita.peluquero_id);
    var resumen = textoCita(cita, servicios, peluquero);
    var titulos = {
      creada: 'Tu cita está confirmada',
      cancelada: 'Tu cita fue cancelada',
      reprogramada: 'Tu cita cambió de horario',
    };
    var cuerpo = [
      'Hola ' + cita.cliente_nombre + ',',
      '',
      titulos[evento] + '.',
      '',
      resumen,
      '',
      evento === 'cancelada'
        ? 'Si quieres, puedes reservar otro turno en nuestra página.'
        : 'Tu código de cita es ' + cita.codigo + '. Con él y tu celular puedes consultar, cancelar o reprogramar en nuestra página.',
      cita.motivo_cancelacion ? '\nMotivo: ' + cita.motivo_cancelacion : '',
      '',
      CONFIG.NOMBRE_NEGOCIO,
    ].join('\n');
    enviarCorreo(cita.cliente_correo, CONFIG.NOMBRE_NEGOCIO + ': ' + titulos[evento], cuerpo);

    var verbos = { creada: 'Nueva cita', cancelada: 'Cita cancelada', reprogramada: 'Cita reprogramada' };
    avisarPeluquero(
      cita.peluquero_id,
      verbos[evento] + ': ' + cita.cliente_nombre + ', ' + fechaLegible(cita.fecha) + ' ' + horaLegible(cita.inicio),
      '#/turno/' + cita.id
    );
  } catch (e) {
    console.error('No se pudo notificar la cita ' + cita.id + ': ' + e);
  }
}
