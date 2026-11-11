/**
 * Motor de disponibilidad.
 *
 * Es puro: recibe la agenda de un peluquero ya cargada y responde qué
 * horarios están libres. No lee la hoja, así que se prueba sin Google.
 *
 * Forma de `agenda`:
 * {
 *   semanal:     { [diaSemana]: { inicio, fin } },        jornada habitual (RF-024)
 *   descansos:   [{ diaSemana, inicio, fin }],            descansos recurrentes (RF-025)
 *   especiales:  { [fecha]: { inicio, fin } },            jornada excepcional (RF-028)
 *   ausencias:   [{ tipo, fechaInicio, fechaFin, inicio, fin }]
 *                  vacaciones, días libres, permisos e imprevistos ocupan días
 *                  completos (inicio = null); los bloqueos ocupan una franja.
 *   citas:       [{ id, fecha, inicio, fin }]             citas que ocupan agenda
 * }
 * Las horas son minutos desde la medianoche; el fin no se incluye.
 */

var TIPOS_AUSENCIA = {
  vacaciones: 'Vacaciones',
  dia_libre: 'Día libre',
  permiso: 'Permiso',
  imprevista: 'Ausencia imprevista',
  bloqueo: 'Bloqueo de horario',
};

var MOTIVOS_SIN_HORARIOS = {
  no_trabaja: 'El peluquero no trabaja este día.',
  vacaciones: 'El peluquero está de vacaciones en esta fecha.',
  dia_libre: 'El peluquero tiene el día libre.',
  permiso: 'El peluquero tiene permiso en esta fecha.',
  imprevista: 'El peluquero no está disponible en esta fecha.',
  agenda_cerrada: 'El peluquero no está recibiendo nuevas reservas por ahora.',
  lleno: 'No quedan horarios disponibles para la duración seleccionada.',
};

function seSolapan(inicioA, finA, inicioB, finB) {
  return inicioA < finB && inicioB < finA;
}

function cubreFecha(ausencia, fecha) {
  return ausencia.fechaInicio <= fecha && fecha <= ausencia.fechaFin;
}

function esDiaCompleto(ausencia) {
  return ausencia.inicio === null || ausencia.inicio === undefined;
}

/**
 * Describe un día: si se trabaja, la ventana de trabajo y las franjas ocupadas
 * que no son citas (descansos y bloqueos).
 */
function planDelDia(agenda, fecha) {
  var completa = agenda.ausencias.filter(function (a) {
    return cubreFecha(a, fecha) && esDiaCompleto(a);
  })[0];
  if (completa) return { abierto: false, motivo: completa.tipo };

  var ventana = agenda.especiales[fecha] || agenda.semanal[diaSemana(fecha)];
  if (!ventana || ventana.fin <= ventana.inicio) return { abierto: false, motivo: 'no_trabaja' };

  var dia = diaSemana(fecha);
  var ocupado = agenda.descansos
    .filter(function (d) {
      return d.diaSemana === dia;
    })
    .map(function (d) {
      return { inicio: d.inicio, fin: d.fin };
    })
    .concat(
      agenda.ausencias
        .filter(function (a) {
          return cubreFecha(a, fecha) && !esDiaCompleto(a);
        })
        .map(function (a) {
          return { inicio: a.inicio, fin: a.fin };
        })
    );
  return { abierto: true, ventana: ventana, ocupado: ocupado };
}

function citasDelDia(agenda, fecha, ignorarCitaId) {
  return agenda.citas
    .filter(function (c) {
      return c.fecha === fecha && c.id !== ignorarCitaId;
    })
    .map(function (c) {
      return { inicio: c.inicio, fin: c.fin };
    });
}

/**
 * ¿Cabe completa una cita en la agenda? (RF-037): dentro de la jornada y sin
 * cruzarse con descansos, bloqueos, ausencias ni otras citas.
 * Opciones: ignorarCitaId (al reprogramar), ignorarCitas (al revisar si un
 * cambio de horario deja citas por fuera).
 */
function cabeEnAgenda(agenda, fecha, inicio, fin, opciones) {
  opciones = opciones || {};
  var plan = planDelDia(agenda, fecha);
  if (!plan.abierto) return { ok: false, motivo: plan.motivo };
  if (inicio < plan.ventana.inicio || fin > plan.ventana.fin) return { ok: false, motivo: 'fuera_de_jornada' };
  var choca = function (b) {
    return seSolapan(inicio, fin, b.inicio, b.fin);
  };
  if (plan.ocupado.some(choca)) return { ok: false, motivo: 'bloqueado' };
  if (!opciones.ignorarCitas && citasDelDia(agenda, fecha, opciones.ignorarCitaId).some(choca)) {
    return { ok: false, motivo: 'ocupado' };
  }
  return { ok: true };
}

/**
 * Horarios de inicio donde cabe una cita de `duracion` minutos (RF-010).
 * Se ofrecen inicios cada `intervalo` minutos desde el comienzo de la jornada
 * y, además, justo al terminar cada cita, descanso o bloqueo, para no dejar
 * huecos. `noAntesDe` descarta horas que ya pasaron.
 */
function horariosDisponibles(agenda, fecha, duracion, opciones) {
  opciones = opciones || {};
  var intervalo = opciones.intervalo || CONFIG.INTERVALO_HORARIOS_MIN;
  var noAntesDe = opciones.noAntesDe || 0;
  if (!(duracion > 0)) return { horarios: [], motivo: 'lleno' };

  var plan = planDelDia(agenda, fecha);
  if (!plan.abierto) return { horarios: [], motivo: plan.motivo };

  var vi = plan.ventana.inicio;
  var vf = plan.ventana.fin;
  var ocupado = plan.ocupado.concat(citasDelDia(agenda, fecha, opciones.ignorarCitaId));

  var candidatos = {};
  for (var t = vi; t + duracion <= vf; t += intervalo) candidatos[t] = true;
  ocupado.forEach(function (b) {
    if (b.fin >= vi) candidatos[b.fin] = true;
  });

  var horarios = Object.keys(candidatos)
    .map(Number)
    .filter(function (t) {
      return (
        t >= noAntesDe &&
        t + duracion <= vf &&
        !ocupado.some(function (b) {
          return seSolapan(t, t + duracion, b.inicio, b.fin);
        })
      );
    })
    .sort(function (a, b) {
      return a - b;
    });

  return { horarios: horarios, motivo: horarios.length ? null : 'lleno' };
}
