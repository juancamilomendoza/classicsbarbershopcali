/**
 * Operaciones del cliente (sin cuenta). El cliente se identifica con su
 * celular y el código de la cita; solo ve y modifica esa cita (RN-009).
 */

var MAX_INTENTOS_CODIGO = 10; // por celular, cada 15 minutos

/** Servicios activos para la página de inicio (RF-006). */
function listarServicios() {
  return Db.donde('Servicios', function (s) { return s.activo; })
    .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); })
    .map(function (s) {
      return { id: s.id, nombre: s.nombre, descripcion: s.descripcion, duracionMin: s.duracion_min, precio: s.precio };
    });
}

/** Peluqueros activos que prestan todos los servicios elegidos (RF-009). */
function listarPeluqueros(servicioIds) {
  var elegidos = servicioIds && servicioIds.length ? resolverServicios(servicioIds).servicios : [];
  return Db.donde('Peluqueros', function (p) { return p.activo; })
    .filter(function (p) { return prestaServicios(p.id, elegidos); })
    .map(function (p) {
      return { id: p.id, nombre: p.nombre, recibeReservas: p.recibe_reservas };
    });
}

/** Horarios libres de mañana para un peluquero y unos servicios (RF-010, RF-011). */
function disponibilidadCliente(peluqueroId, servicioIds, ignorarCitaId) {
  var peluquero = peluqueroActivo(peluqueroId);
  var elegidos = resolverServicios(servicioIds);
  var fecha = manana();
  var base = { fecha: fecha, fechaLegible: fechaLegible(fecha), duracionMin: elegidos.duracion, horarios: [] };

  if (!prestaServicios(peluquero.id, elegidos.servicios)) {
    throw AppError('Este peluquero no presta todos los servicios elegidos.', 'SERVICIO_NO_PRESTADO');
  }
  if (!peluquero.recibe_reservas) {
    base.mensaje = MOTIVOS_SIN_HORARIOS.agenda_cerrada;
    return base;
  }
  var r = horariosDisponibles(cargarAgenda(peluquero.id, hoy()), fecha, elegidos.duracion, {
    ignorarCitaId: ignorarCitaId,
  });
  base.horarios = r.horarios.map(function (m) { return { inicio: m, hora: aHora(m), texto: horaLegible(m) }; });
  if (r.motivo) base.mensaje = MOTIVOS_SIN_HORARIOS[r.motivo];
  return base;
}

/** Vista pública de una cita: lo que el cliente necesita ver (RF-013). */
function citaParaCliente(cita) {
  var servicios = Db.donde('CitaServicios', function (s) { return s.cita_id === cita.id; });
  var peluquero = Db.porId('Peluqueros', cita.peluquero_id);
  return {
    codigo: cita.codigo,
    estado: cita.estado,
    clienteNombre: cita.cliente_nombre,
    peluquero: peluquero ? { id: peluquero.id, nombre: peluquero.nombre } : null,
    servicios: servicios.map(function (s) { return { id: s.servicio_id, nombre: s.nombre, duracionMin: s.duracion_min, precio: s.precio }; }),
    duracionMin: cita.duracion_min,
    fecha: cita.fecha,
    fechaLegible: fechaLegible(cita.fecha),
    hora: aHora(cita.inicio),
    horaTexto: horaLegible(cita.inicio),
    horaFinTexto: horaLegible(cita.fin),
    puedeModificar: puedeModificarCliente(cita),
    limiteHoras: CONFIG.HORAS_MINIMAS_CANCELACION,
  };
}

function puedeModificarCliente(cita) {
  return cita.estado === 'confirmada' && minutosHasta(cita.fecha, cita.inicio) >= CONFIG.HORAS_MINIMAS_CANCELACION * 60;
}

function normalizarCelular(celular) {
  return String(celular || '').replace(/[^\d+]/g, '');
}

/**
 * Busca la cita por celular y código. Limita los intentos fallidos para que
 * los códigos no se puedan adivinar probando muchos.
 */
function buscarCitaCliente(celular, codigo) {
  var cel = normalizarCelular(celular);
  var cod = String(codigo || '').trim().toUpperCase();
  var cache = CacheService.getScriptCache();
  var llave = 'intentos:' + cel;
  var intentos = Number(cache.get(llave) || 0);
  if (intentos >= MAX_INTENTOS_CODIGO) {
    throw AppError('Demasiados intentos. Espera 15 minutos e intenta de nuevo.', 'DEMASIADOS_INTENTOS');
  }
  var cita = Db.donde('Citas', function (c) {
    return c.codigo === cod && c.cliente_celular === cel;
  })[0];
  if (!cita) {
    cache.put(llave, String(intentos + 1), 900);
    throw AppError('No encontramos una cita con ese celular y código.', 'NO_ENCONTRADA');
  }
  return cita;
}

function exigirModificable(cita) {
  if (cita.estado !== 'confirmada') throw AppError('Esta cita ya no se puede modificar.', 'NO_MODIFICABLE');
  if (!puedeModificarCliente(cita)) {
    throw AppError(
      'Solo puedes cancelar o reprogramar hasta ' + CONFIG.HORAS_MINIMAS_CANCELACION +
        ' horas antes. Comunícate con la barbería.',
      'FUERA_DE_PLAZO'
    );
  }
}

/** El cliente cancela su cita (RF-015). */
function cancelarCitaCliente(celular, codigo) {
  var cita = conCandado(function () {
    var c = buscarCitaCliente(celular, codigo);
    exigirModificable(c);
    var actualizada = Db.actualizar('Citas', c.id, {
      estado: 'cancelada',
      motivo_cancelacion: 'Cancelada por el cliente',
      actualizado_en: Reloj.ahora().toISOString(),
    });
    registrar({ actor: 'cliente', peluqueroId: c.peluquero_id, accion: 'cita_cancelada', entidad: 'Citas', entidadId: c.id });
    return actualizada;
  });
  notificarCita(cita, 'cancelada');
  return citaParaCliente(cita);
}

/** Horarios de mañana a los que el cliente puede mover su cita (RF-016). */
function horariosReprogramacion(celular, codigo) {
  var cita = buscarCitaCliente(celular, codigo);
  exigirModificable(cita);
  var servicioIds = Db.donde('CitaServicios', function (s) { return s.cita_id === cita.id; }).map(function (s) {
    return s.servicio_id;
  });
  return disponibilidadCliente(cita.peluquero_id, servicioIds, cita.id);
}

/** Mueve la cita a otro horario libre de mañana con el mismo peluquero. */
function reprogramarCitaCliente(celular, codigo, inicio) {
  inicio = Number(inicio);
  var cita = conCandado(function () {
    var c = buscarCitaCliente(celular, codigo);
    exigirModificable(c);
    var fecha = manana();
    var fin = inicio + c.duracion_min;
    var peluquero = peluqueroActivo(c.peluquero_id);
    if (!peluquero.recibe_reservas) throw AppError(MOTIVOS_SIN_HORARIOS.agenda_cerrada, 'AGENDA_CERRADA');
    var cabe = cabeEnAgenda(cargarAgenda(c.peluquero_id, hoy()), fecha, inicio, fin, { ignorarCitaId: c.id });
    if (!(inicio >= 0) || !cabe.ok) {
      throw AppError('Ese horario ya no está disponible. Elige otro.', 'HORARIO_NO_DISPONIBLE', { motivo: cabe.motivo });
    }
    var actualizada = Db.actualizar('Citas', c.id, {
      fecha: fecha,
      inicio: inicio,
      fin: fin,
      actualizado_en: Reloj.ahora().toISOString(),
    });
    registrar({
      actor: 'cliente',
      peluqueroId: c.peluquero_id,
      accion: 'cita_reprogramada',
      entidad: 'Citas',
      entidadId: c.id,
      detalle: { de: c.fecha + ' ' + aHora(c.inicio), a: fecha + ' ' + aHora(inicio) },
    });
    return actualizada;
  });
  notificarCita(cita, 'reprogramada');
  return citaParaCliente(cita);
}
