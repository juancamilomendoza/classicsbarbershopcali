/**
 * Horario y disponibilidad del peluquero (fase 4): jornada semanal (RF-024),
 * descansos (RF-025), bloqueos (RF-026), días libres y permisos (RF-027),
 * horarios especiales (RF-028), vacaciones (RF-029), ausencias imprevistas
 * (RF-030), pausa de reservas (RF-031) y reapertura anticipada (RF-032).
 *
 * Todo cambio que reduce la disponibilidad se revisa contra las citas
 * confirmadas. Si alguna queda por fuera, el cambio NO se aplica y la API
 * responde CITAS_AFECTADAS con la lista (RF-023, RF-040). El peluquero decide
 * entonces: "cancelar" (se cancelan y se avisa a los clientes) o "conservar"
 * (quedan marcadas en la agenda para moverlas una por una).
 */

var TIPOS_AUSENCIA_DIA_COMPLETO = ['vacaciones', 'dia_libre', 'permiso', 'imprevista'];
var MAX_DIAS_AUSENCIA = 366;

function leerHora(texto, campo) {
  var m = typeof texto === 'number' ? texto : aMinutos(texto);
  if (m === null || m === undefined || isNaN(m)) throw AppError('La hora de ' + campo + ' no es válida.', 'HORA_INVALIDA');
  return m;
}

function leerFranja(inicio, fin) {
  var i = leerHora(inicio, 'inicio');
  var f = leerHora(fin, 'fin');
  if (f <= i) throw AppError('La hora de fin debe ser posterior a la de inicio.', 'HORA_INVALIDA');
  return { inicio: i, fin: f };
}

function leerFecha(fecha, campo) {
  if (!esFechaValida(fecha)) throw AppError('La fecha de ' + campo + ' no es válida.', 'FECHA_INVALIDA');
  return fecha;
}

/** Copia profunda sencilla de la agenda para simular un cambio. */
function copiarAgenda(agenda) {
  return JSON.parse(JSON.stringify(agenda));
}

/**
 * Aplica un cambio de horario revisando antes las citas afectadas.
 * - simular(agenda): modifica una copia de la agenda como quedaría.
 * - aplicar(): escribe el cambio en la hoja.
 * - resolucion: undefined | 'cancelar' | 'conservar'.
 */
function cambiarConRevision(p, accion, detalle, simular, aplicar, resolucion) {
  var canceladas = [];
  var resultado = conCandado(function () {
    var desde = hoy();
    var agenda = cargarAgenda(p.id, desde);
    var propuesta = copiarAgenda(agenda);
    simular(propuesta);

    var ahora = ahoraPeluqueria();
    var afectadas = Db.donde('Citas', function (c) {
      return (
        c.peluquero_id === p.id &&
        c.estado === 'confirmada' &&
        (c.fecha > ahora.fecha || (c.fecha === ahora.fecha && c.fin > ahora.minutos)) &&
        !cabeEnAgenda(propuesta, c.fecha, c.inicio, c.fin, { ignorarCitas: true }).ok
      );
    }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.inicio - b.inicio; });

    if (afectadas.length && resolucion !== 'cancelar' && resolucion !== 'conservar') {
      throw AppError(
        afectadas.length === 1 ? 'Este cambio afecta 1 cita confirmada.' : 'Este cambio afecta ' + afectadas.length + ' citas confirmadas.',
        'CITAS_AFECTADAS',
        {
          citas: afectadas.map(function (c) {
            return { id: c.id, cliente: c.cliente_nombre, fechaLegible: fechaLegible(c.fecha), horaTexto: horaLegible(c.inicio) };
          }),
        }
      );
    }

    var r = aplicar();
    if (afectadas.length && resolucion === 'cancelar') {
      afectadas.forEach(function (c) {
        canceladas.push(Db.actualizar('Citas', c.id, {
          estado: 'cancelada',
          motivo_cancelacion: 'El peluquero no estará disponible en ese horario',
          actualizado_en: Reloj.ahora().toISOString(),
        }));
        registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: 'cita_cancelada', entidad: 'Citas', entidadId: c.id, detalle: { motivo: accion } });
      });
    }
    detalle = detalle || {};
    if (afectadas.length) {
      detalle.citas_afectadas = afectadas.length;
      detalle.resolucion = resolucion;
    }
    registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: accion, detalle: detalle });
    return r;
  });
  canceladas.forEach(function (c) { notificarCita(c, 'cancelada', true); });
  return resultado;
}

/** Todo lo que el peluquero configura sobre su disponibilidad. */
function horarioDelPeluquero(p) {
  var desde = hoy();
  var id = p.id;
  var semanal = Db.donde('HorarioSemanal', function (h) { return h.peluquero_id === id; });
  var actual = Db.porId('Peluqueros', id);
  return {
    recibeReservas: actual.recibe_reservas,
    semana: [1, 2, 3, 4, 5, 6, 0].map(function (dia) {
      var h = semanal.filter(function (x) { return x.dia_semana === dia; })[0];
      return { dia: dia, nombre: NOMBRES_DIA[dia], trabaja: Boolean(h), inicio: h ? aHora(h.inicio) : '', fin: h ? aHora(h.fin) : '' };
    }),
    descansos: Db.donde('Descansos', function (d) { return d.peluquero_id === id; })
      .sort(function (a, b) { return (a.dia_semana + 6) % 7 - (b.dia_semana + 6) % 7 || a.inicio - b.inicio; })
      .map(function (d) { return { id: d.id, dia: d.dia_semana, diaNombre: NOMBRES_DIA[d.dia_semana], inicio: aHora(d.inicio), fin: aHora(d.fin), nombre: d.nombre }; }),
    especiales: Db.donde('HorariosEspeciales', function (e) { return e.peluquero_id === id && e.fecha >= desde; })
      .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; })
      .map(function (e) { return { id: e.id, fecha: e.fecha, fechaLegible: fechaLegible(e.fecha), inicio: aHora(e.inicio), fin: aHora(e.fin), nota: e.nota }; }),
    ausencias: Db.donde('Ausencias', function (a) { return a.peluquero_id === id && a.estado !== 'cancelada' && a.fecha_fin >= desde; })
      .sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? -1 : 1; })
      .map(function (a) {
        return {
          id: a.id,
          tipo: a.tipo,
          tipoTexto: TIPOS_AUSENCIA[a.tipo] || a.tipo,
          fechaInicio: a.fecha_inicio,
          fechaFin: a.fecha_fin,
          desdeLegible: fechaLegible(a.fecha_inicio),
          hastaLegible: fechaLegible(a.fecha_fin),
          inicio: a.inicio === null ? null : aHora(a.inicio),
          fin: a.fin === null ? null : aHora(a.fin),
          motivo: a.motivo,
          enCurso: a.fecha_inicio <= desde,
        };
      }),
  };
}

/** Jornada habitual de cada día (RF-024). `dias`: [{ dia, trabaja, inicio, fin }]. */
function guardarSemana(p, dias, resolucion) {
  var nueva = {};
  (dias || []).forEach(function (d) {
    var dia = Number(d.dia);
    if (!(dia >= 0 && dia <= 6)) throw AppError('Día no válido.', 'DIA_INVALIDO');
    if (d.trabaja) nueva[dia] = leerFranja(d.inicio, d.fin);
  });
  cambiarConRevision(p, 'horario_semanal', { dias: Object.keys(nueva).length }, function (agenda) {
    agenda.semanal = nueva;
  }, function () {
    Db.borrar('HorarioSemanal', function (h) { return h.peluquero_id === p.id; });
    Object.keys(nueva).forEach(function (dia) {
      Db.insertar('HorarioSemanal', { peluquero_id: p.id, dia_semana: Number(dia), inicio: nueva[dia].inicio, fin: nueva[dia].fin });
    });
  }, resolucion);
  return horarioDelPeluquero(p);
}

/** Descanso recurrente en uno o varios días (RF-025). */
function agregarDescanso(p, datos, resolucion) {
  var franja = leerFranja(datos.inicio, datos.fin);
  var dias = (datos.dias || []).map(Number).filter(function (d) { return d >= 0 && d <= 6; });
  if (!dias.length) throw AppError('Elige al menos un día.', 'DIA_INVALIDO');
  var nombre = String(datos.nombre || 'Descanso').slice(0, 40);
  cambiarConRevision(p, 'descanso_agregado', { dias: dias, inicio: aHora(franja.inicio), fin: aHora(franja.fin) }, function (agenda) {
    dias.forEach(function (d) { agenda.descansos.push({ diaSemana: d, inicio: franja.inicio, fin: franja.fin }); });
  }, function () {
    dias.forEach(function (d) {
      Db.insertar('Descansos', { peluquero_id: p.id, dia_semana: d, inicio: franja.inicio, fin: franja.fin, nombre: nombre });
    });
  }, resolucion);
  return horarioDelPeluquero(p);
}

/** Quitar un descanso solo libera tiempo: no afecta citas. */
function borrarDescanso(p, id) {
  conCandado(function () {
    var n = Db.borrar('Descansos', function (d) { return d.id === Number(id) && d.peluquero_id === p.id; });
    if (!n) throw AppError('No encontramos ese descanso.', 'NO_ENCONTRADO');
    registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: 'descanso_eliminado', entidad: 'Descansos', entidadId: Number(id) });
  });
  return horarioDelPeluquero(p);
}

/** Jornada distinta para una fecha (RF-028). Reemplaza la que hubiera ese día. */
function guardarEspecial(p, datos, resolucion) {
  var fecha = leerFecha(datos.fecha, 'la jornada especial');
  if (fecha < hoy()) throw AppError('La fecha ya pasó.', 'FECHA_NO_PERMITIDA');
  var franja = leerFranja(datos.inicio, datos.fin);
  cambiarConRevision(p, 'horario_especial', { fecha: fecha, inicio: aHora(franja.inicio), fin: aHora(franja.fin) }, function (agenda) {
    agenda.especiales[fecha] = franja;
  }, function () {
    Db.borrar('HorariosEspeciales', function (e) { return e.peluquero_id === p.id && e.fecha === fecha; });
    Db.insertar('HorariosEspeciales', { peluquero_id: p.id, fecha: fecha, inicio: franja.inicio, fin: franja.fin, nota: String(datos.nota || '').slice(0, 100) });
  }, resolucion);
  return horarioDelPeluquero(p);
}

/** Quitar un horario especial devuelve ese día a la jornada habitual (puede afectar citas). */
function borrarEspecial(p, id, resolucion) {
  var especial = Db.porId('HorariosEspeciales', id);
  if (!especial || especial.peluquero_id !== p.id) throw AppError('No encontramos ese horario especial.', 'NO_ENCONTRADO');
  cambiarConRevision(p, 'horario_especial_eliminado', { fecha: especial.fecha }, function (agenda) {
    delete agenda.especiales[especial.fecha];
  }, function () {
    Db.borrar('HorariosEspeciales', function (e) { return e.id === especial.id; });
  }, resolucion);
  return horarioDelPeluquero(p);
}

/**
 * Registra una ausencia o un bloqueo.
 * tipo: vacaciones | dia_libre | permiso | imprevista (días completos)
 *       bloqueo (una franja de una fecha)
 */
function agregarAusencia(p, datos, resolucion) {
  var tipo = String(datos.tipo || '');
  var hoyFecha = hoy();
  var registro = { peluquero_id: p.id, tipo: tipo, estado: 'activa', motivo: String(datos.motivo || '').slice(0, 200), creado_en: Reloj.ahora().toISOString() };

  if (tipo === 'bloqueo') {
    registro.fecha_inicio = registro.fecha_fin = leerFecha(datos.fechaInicio, 'el bloqueo');
    var franja = leerFranja(datos.inicio, datos.fin);
    registro.inicio = franja.inicio;
    registro.fin = franja.fin;
  } else if (TIPOS_AUSENCIA_DIA_COMPLETO.indexOf(tipo) !== -1) {
    registro.fecha_inicio = leerFecha(datos.fechaInicio, 'inicio');
    registro.fecha_fin = leerFecha(datos.fechaFin || datos.fechaInicio, 'fin');
    if (registro.fecha_fin < registro.fecha_inicio) throw AppError('La fecha de fin debe ser igual o posterior a la de inicio.', 'FECHA_INVALIDA');
    if (diasEntre(registro.fecha_inicio, registro.fecha_fin) >= MAX_DIAS_AUSENCIA) throw AppError('La ausencia no puede durar más de un año.', 'FECHA_INVALIDA');
    registro.inicio = null;
    registro.fin = null;
  } else {
    throw AppError('Tipo de ausencia no válido.', 'TIPO_INVALIDO');
  }
  if (registro.fecha_fin < hoyFecha) throw AppError('Esas fechas ya pasaron.', 'FECHA_NO_PERMITIDA');

  cambiarConRevision(p, 'ausencia_' + tipo, { desde: registro.fecha_inicio, hasta: registro.fecha_fin }, function (agenda) {
    agenda.ausencias.push({
      tipo: tipo,
      fechaInicio: registro.fecha_inicio,
      fechaFin: registro.fecha_fin,
      inicio: registro.inicio,
      fin: registro.fin,
    });
  }, function () {
    Db.insertar('Ausencias', registro);
  }, resolucion);
  return horarioDelPeluquero(p);
}

/**
 * Termina una ausencia antes de tiempo (RF-032). Si aún no empezó, se anula.
 * Si está en curso, termina ayer y el peluquero vuelve a estar disponible hoy.
 * Los demás bloqueos y ausencias siguen vigentes (RF-033).
 */
function terminarAusencia(p, id) {
  conCandado(function () {
    var a = Db.porId('Ausencias', id);
    if (!a || a.peluquero_id !== p.id || a.estado === 'cancelada') throw AppError('No encontramos esa ausencia.', 'NO_ENCONTRADO');
    var hoyFecha = hoy();
    if (a.fecha_inicio >= hoyFecha || a.tipo === 'bloqueo') {
      Db.actualizar('Ausencias', a.id, { estado: 'cancelada' });
    } else {
      Db.actualizar('Ausencias', a.id, { fecha_fin: sumarDias(hoyFecha, -1) });
    }
    registrar({
      actor: actorPeluquero(p),
      peluqueroId: p.id,
      accion: 'ausencia_terminada',
      entidad: 'Ausencias',
      entidadId: a.id,
      detalle: { tipo: a.tipo, fin_previsto: a.fecha_fin },
    });
  });
  return horarioDelPeluquero(p);
}

/** Pausa o reanuda las reservas en línea sin tocar el horario (RF-031). */
function cambiarRecibeReservas(p, recibe) {
  conCandado(function () {
    Db.actualizar('Peluqueros', p.id, { recibe_reservas: Boolean(recibe) });
    registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: recibe ? 'reservas_reanudadas' : 'reservas_pausadas' });
  });
  return horarioDelPeluquero(p);
}
