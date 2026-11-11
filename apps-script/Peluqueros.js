/**
 * Operaciones del panel del peluquero (fase 3). Cada función recibe el
 * peluquero de la sesión y solo toca su propia agenda (RN-010).
 */

var ESTADOS_CITA = {
  confirmada: 'Confirmada',
  en_atencion: 'En atención',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

// Cambios de estado permitidos (RF-020).
var TRANSICIONES = {
  confirmada: ['en_atencion', 'completada', 'cancelada', 'no_asistio'],
  en_atencion: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
  no_asistio: [],
};

function actorPeluquero(p) {
  return 'peluquero:' + p.id;
}

/** Cita del peluquero o error 404: nunca deja ver citas de otro. */
function citaDelPeluquero(p, citaId) {
  var cita = Db.porId('Citas', citaId);
  if (!cita || cita.peluquero_id !== p.id) throw AppError('No encontramos ese turno.', 'NO_ENCONTRADA');
  return cita;
}

function turnoParaPeluquero(cita, agenda) {
  var servicios = Db.donde('CitaServicios', function (s) { return s.cita_id === cita.id; });
  var resultado = {
    id: cita.id,
    estado: cita.estado,
    estadoTexto: ESTADOS_CITA[cita.estado] || cita.estado,
    origen: cita.origen,
    cliente: { nombre: cita.cliente_nombre, celular: cita.cliente_celular, correo: cita.cliente_correo },
    servicios: servicios.map(function (s) { return { nombre: s.nombre, duracionMin: s.duracion_min, precio: s.precio }; }),
    duracionMin: cita.duracion_min,
    fecha: cita.fecha,
    fechaLegible: fechaLegible(cita.fecha),
    inicio: cita.inicio,
    horaTexto: horaLegible(cita.inicio),
    horaFinTexto: horaLegible(cita.fin),
    notas: cita.notas,
    motivoCancelacion: cita.motivo_cancelacion,
    siguientes: TRANSICIONES[cita.estado] || [],
  };
  // Marca las citas que quedaron por fuera de la disponibilidad actual (RF-023).
  if (agenda && cita.estado === 'confirmada') {
    resultado.fueraDeDisponibilidad = !cabeEnAgenda(agenda, cita.fecha, cita.inicio, cita.fin, { ignorarCitas: true }).ok;
  }
  return resultado;
}

/** Agenda por día o semana (RF-018). `fecha` por defecto: hoy. */
function agendaDelPeluquero(p, fecha, vista) {
  fecha = esFechaValida(fecha) ? fecha : hoy();
  var dias = vista === 'semana' ? 7 : 1;
  var desde = vista === 'semana' ? sumarDias(fecha, -((diaSemana(fecha) + 6) % 7)) : fecha;
  var hasta = sumarDias(desde, dias - 1);
  var agenda = cargarAgenda(p.id, desde);
  var citas = Db.donde('Citas', function (c) {
    return c.peluquero_id === p.id && c.fecha >= desde && c.fecha <= hasta;
  });

  var lista = [];
  for (var i = 0; i < dias; i++) {
    var dia = sumarDias(desde, i);
    var plan = planDelDia(agenda, dia);
    lista.push({
      fecha: dia,
      fechaLegible: fechaLegible(dia),
      abierto: plan.abierto,
      jornada: plan.abierto ? horaLegible(plan.ventana.inicio) + ' a ' + horaLegible(plan.ventana.fin) : null,
      motivo: plan.abierto ? null : (TIPOS_AUSENCIA[plan.motivo] || 'No trabaja'),
      turnos: citas
        .filter(function (c) { return c.fecha === dia; })
        .sort(function (a, b) { return a.inicio - b.inicio; })
        .map(function (c) { return turnoParaPeluquero(c, agenda); }),
    });
  }
  return { vista: dias === 7 ? 'semana' : 'dia', desde: desde, hasta: hasta, hoy: hoy(), dias: lista };
}

function detalleTurno(p, citaId) {
  var cita = citaDelPeluquero(p, citaId);
  return turnoParaPeluquero(cita, cargarAgenda(p.id, cita.fecha));
}

/** Cambia el estado de un turno (RF-020, RF-021). */
function cambiarEstadoTurno(p, citaId, estado, motivo) {
  var resultado = conCandado(function () {
    var cita = citaDelPeluquero(p, citaId);
    if ((TRANSICIONES[cita.estado] || []).indexOf(estado) === -1) {
      throw AppError('No se puede pasar de "' + ESTADOS_CITA[cita.estado] + '" a "' + (ESTADOS_CITA[estado] || estado) + '".', 'ESTADO_INVALIDO');
    }
    var cambios = { estado: estado, actualizado_en: Reloj.ahora().toISOString() };
    if (estado === 'cancelada') cambios.motivo_cancelacion = String(motivo || 'Cancelada por la barbería').slice(0, 200);
    var actualizada = Db.actualizar('Citas', cita.id, cambios);
    registrar({
      actor: actorPeluquero(p),
      peluqueroId: p.id,
      accion: estado === 'cancelada' ? 'cita_cancelada' : 'estado_cita',
      entidad: 'Citas',
      entidadId: cita.id,
      detalle: { de: cita.estado, a: estado },
    });
    return actualizada;
  });
  if (estado === 'cancelada') notificarCita(resultado, 'cancelada', true);
  return detalleTurno(p, citaId);
}

/** Horarios libres de una fecha para unos servicios (o para mover una cita). */
function horariosPeluquero(p, fecha, duracion, ignorarCitaId) {
  if (!esFechaValida(fecha)) throw AppError('Elige una fecha válida.', 'FECHA_INVALIDA');
  var ahora = ahoraPeluqueria();
  if (fecha < ahora.fecha) throw AppError('No se pueden agendar turnos en el pasado.', 'FECHA_NO_PERMITIDA');
  var r = horariosDisponibles(cargarAgenda(p.id, ahora.fecha), fecha, duracion, {
    ignorarCitaId: ignorarCitaId,
    noAntesDe: fecha === ahora.fecha ? ahora.minutos : 0,
  });
  return {
    fecha: fecha,
    fechaLegible: fechaLegible(fecha),
    duracionMin: duracion,
    horarios: r.horarios.map(function (m) { return { inicio: m, hora: aHora(m), texto: horaLegible(m) }; }),
    mensaje: r.motivo ? MOTIVOS_SIN_HORARIOS[r.motivo] : null,
  };
}

function horariosParaMover(p, citaId, fecha) {
  var cita = citaDelPeluquero(p, citaId);
  return horariosPeluquero(p, fecha, cita.duracion_min, cita.id);
}

function horariosParaManual(p, servicioIds, fecha) {
  return horariosPeluquero(p, fecha, resolverServicios(servicioIds).duracion);
}

/** El peluquero mueve una cita a otra fecha u hora libre. */
function moverTurno(p, citaId, fecha, inicio) {
  inicio = Number(inicio);
  var resultado = conCandado(function () {
    var cita = citaDelPeluquero(p, citaId);
    if (cita.estado !== 'confirmada') throw AppError('Solo se pueden mover turnos confirmados.', 'NO_MODIFICABLE');
    var ahora = ahoraPeluqueria();
    if (!esFechaValida(fecha) || fecha < ahora.fecha || (fecha === ahora.fecha && inicio < ahora.minutos)) {
      throw AppError('Elige una fecha y hora futuras.', 'FECHA_NO_PERMITIDA');
    }
    var fin = inicio + cita.duracion_min;
    var cabe = cabeEnAgenda(cargarAgenda(p.id, ahora.fecha), fecha, inicio, fin, { ignorarCitaId: cita.id });
    if (!cabe.ok) throw AppError('Ese horario no está disponible.', 'HORARIO_NO_DISPONIBLE', { motivo: cabe.motivo });
    var actualizada = Db.actualizar('Citas', cita.id, { fecha: fecha, inicio: inicio, fin: fin, actualizado_en: Reloj.ahora().toISOString() });
    registrar({
      actor: actorPeluquero(p),
      peluqueroId: p.id,
      accion: 'cita_reprogramada',
      entidad: 'Citas',
      entidadId: cita.id,
      detalle: { de: cita.fecha + ' ' + aHora(cita.inicio), a: fecha + ' ' + aHora(inicio) },
    });
    return actualizada;
  });
  notificarCita(resultado, 'reprogramada', true);
  return detalleTurno(p, citaId);
}

/** Turno recibido por teléfono o en el local (RF-022). */
function registrarTurnoManual(p, datos) {
  var cita = crearCita({
    origen: 'manual',
    peluqueroId: p.id,
    servicioIds: datos.servicioIds,
    fecha: datos.fecha,
    inicio: datos.inicio,
    cliente: datos.cliente,
    notas: datos.notas,
    actor: actorPeluquero(p),
  });
  if (cita.cliente_correo) notificarCita(cita, 'creada', true);
  return detalleTurno(p, cita.id);
}

/** Catálogo con los servicios que presta este peluquero marcados. */
function serviciosDelPeluquero(p) {
  var propios = Db.donde('ServiciosPeluquero', function (r) { return r.peluquero_id === p.id; }).map(function (r) {
    return r.servicio_id;
  });
  return {
    puedeEditar: p.puede_editar_servicios,
    servicios: Db.todos('Servicios')
      .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); })
      .map(function (s) {
        return {
          id: s.id,
          nombre: s.nombre,
          descripcion: s.descripcion,
          duracionMin: s.duracion_min,
          precio: s.precio,
          activo: s.activo,
          presta: propios.indexOf(s.id) !== -1,
        };
      }),
  };
}

/** El peluquero elige qué servicios presta (RF-009). */
function guardarServiciosQuePresta(p, servicioIds) {
  var ids = (servicioIds || []).map(Number).filter(function (id) { return Db.porId('Servicios', id); });
  conCandado(function () {
    Db.borrar('ServiciosPeluquero', function (r) { return r.peluquero_id === p.id; });
    ids.forEach(function (id) { Db.insertar('ServiciosPeluquero', { peluquero_id: p.id, servicio_id: id }); });
    registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: 'servicios_prestados', detalle: { servicios: ids } });
  });
  return serviciosDelPeluquero(p);
}

/**
 * Crea o edita un servicio del catálogo. Solo peluqueros marcados en la hoja
 * con puede_editar_servicios (RF-042). Las citas ya confirmadas conservan su
 * duración y precio originales (RNF-018).
 */
function guardarServicio(p, datos) {
  if (!p.puede_editar_servicios) throw AppError('No tienes permiso para editar servicios.', 'SIN_PERMISO');
  var nombre = String(datos.nombre || '').trim();
  var duracion = Number(datos.duracionMin);
  var precio = datos.precio === '' || datos.precio == null ? null : Number(datos.precio);
  if (!nombre || nombre.length > 60) throw AppError('Escribe el nombre del servicio.', 'DATOS_SERVICIO');
  if (!(duracion >= 5 && duracion <= 480 && Math.round(duracion) === duracion)) {
    throw AppError('La duración debe ser un número de minutos entre 5 y 480.', 'DATOS_SERVICIO');
  }
  if (precio !== null && !(precio >= 0 && Math.round(precio) === precio)) throw AppError('El precio no es válido.', 'DATOS_SERVICIO');

  conCandado(function () {
    var campos = {
      nombre: nombre,
      descripcion: String(datos.descripcion || '').slice(0, 200),
      duracion_min: duracion,
      precio: precio,
      activo: datos.activo !== false,
    };
    var servicio;
    if (datos.id) {
      var anterior = Db.porId('Servicios', datos.id);
      if (!anterior) throw AppError('No encontramos ese servicio.', 'NO_ENCONTRADO');
      servicio = Db.actualizar('Servicios', anterior.id, campos);
      registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: 'servicio_editado', entidad: 'Servicios', entidadId: servicio.id, detalle: { antes: { duracion_min: anterior.duracion_min, precio: anterior.precio }, despues: { duracion_min: duracion, precio: precio } } });
    } else {
      campos.orden = Db.todos('Servicios').length + 1;
      servicio = Db.insertar('Servicios', campos);
      registrar({ actor: actorPeluquero(p), peluqueroId: p.id, accion: 'servicio_creado', entidad: 'Servicios', entidadId: servicio.id });
    }
  });
  return serviciosDelPeluquero(p);
}

function notificacionesDelPeluquero(p) {
  return Db.donde('Notificaciones', function (n) { return n.peluquero_id === p.id; })
    .sort(function (a, b) { return b.id - a.id; })
    .slice(0, 50)
    .map(function (n) { return { id: n.id, mensaje: n.mensaje, enlace: n.enlace, leida: n.leida, creadoEn: n.creado_en }; });
}

function marcarNotificacionesLeidas(p) {
  conCandado(function () {
    Db.donde('Notificaciones', function (n) { return n.peluquero_id === p.id && !n.leida; }).forEach(function (n) {
      Db.actualizar('Notificaciones', n.id, { leida: true });
    });
  });
  return notificacionesDelPeluquero(p);
}

function contarNoLeidas(p) {
  return Db.donde('Notificaciones', function (n) { return n.peluquero_id === p.id && !n.leida; }).length;
}

/** Historial de cambios de la agenda del peluquero (RF-041). */
function registroDelPeluquero(p) {
  return Db.donde('Registro', function (r) { return r.peluquero_id === p.id; })
    .sort(function (a, b) { return b.id - a.id; })
    .slice(0, 100)
    .map(function (r) {
      return { fechaHora: r.fecha_hora, actor: r.actor, accion: r.accion, entidad: r.entidad, entidadId: r.entidad_id, detalle: r.detalle };
    });
}
