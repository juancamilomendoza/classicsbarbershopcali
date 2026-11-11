/**
 * Reglas para crear citas.
 *
 * Los clientes no tienen cuenta: reservan con nombre, celular y correo, y
 * reciben un código para consultar, cancelar o reprogramar su cita.
 */

var ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

/** Código corto y difícil de adivinar para identificar una cita. */
function generarCodigo() {
  var hex = Utilities.getUuid().replace(/-/g, '');
  var codigo = '';
  for (var i = 0; i < 8; i++) {
    codigo += ALFABETO_CODIGO.charAt(parseInt(hex.substr(i * 2, 2), 16) % ALFABETO_CODIGO.length);
  }
  return codigo;
}

/** Valida los servicios elegidos y suma su duración (RN-003). */
function resolverServicios(servicioIds) {
  var ids = (servicioIds || []).map(Number).filter(function (id, i, arr) {
    return id > 0 && arr.indexOf(id) === i;
  });
  if (!ids.length) throw AppError('Elige al menos un servicio.', 'SIN_SERVICIOS');
  var servicios = ids.map(function (id) {
    var s = Db.porId('Servicios', id);
    if (!s || !s.activo) throw AppError('Uno de los servicios elegidos no está disponible.', 'SERVICIO_INVALIDO');
    return s;
  });
  var duracion = servicios.reduce(function (total, s) {
    return total + s.duracion_min;
  }, 0);
  return { servicios: servicios, duracion: duracion };
}

function peluqueroActivo(peluqueroId) {
  var p = Db.porId('Peluqueros', peluqueroId);
  if (!p || !p.activo) throw AppError('El peluquero elegido no existe.', 'PELUQUERO_INVALIDO');
  return p;
}

/** ¿El peluquero presta todos estos servicios? (RF-009) */
function prestaServicios(peluqueroId, servicios) {
  var ofrecidos = Db.donde('ServiciosPeluquero', function (r) {
    return r.peluquero_id === Number(peluqueroId);
  }).map(function (r) {
    return r.servicio_id;
  });
  return servicios.every(function (s) {
    return ofrecidos.indexOf(s.id) !== -1;
  });
}

function validarCliente(cliente) {
  cliente = cliente || {};
  var nombre = String(cliente.nombre || '').trim();
  var celular = String(cliente.celular || '').replace(/[^\d+]/g, '');
  var correo = String(cliente.correo || '').trim().toLowerCase();
  if (nombre.length < 2 || nombre.length > 80) throw AppError('Escribe tu nombre.', 'DATOS_CLIENTE');
  if (!/^\+?\d{7,15}$/.test(celular)) throw AppError('Escribe un número de celular válido.', 'DATOS_CLIENTE');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 120) {
    throw AppError('Escribe un correo electrónico válido.', 'DATOS_CLIENTE');
  }
  return { nombre: nombre, celular: celular, correo: correo };
}

/**
 * Crea una cita. `datos`:
 *   peluqueroId, servicioIds, fecha, inicio (minutos),
 *   cliente { nombre, celular, correo }, origen ('web' | 'manual'), actor
 *
 * Reservas web: solo para mañana (RN-004) y si el peluquero recibe reservas
 * (RF-031). Reservas manuales del peluquero: desde hoy en adelante (RF-022).
 * En ambos casos la disponibilidad se vuelve a comprobar dentro del candado
 * justo antes de guardar (RN-006).
 */
function crearCita(datos) {
  var origen = datos.origen === 'manual' ? 'manual' : 'web';
  var cliente = validarCliente(datos.cliente);
  var inicio = Number(datos.inicio);
  if (!esFechaValida(datos.fecha) || !(inicio >= 0 && inicio < 1440)) {
    throw AppError('La fecha u hora no son válidas.', 'HORARIO_INVALIDO');
  }

  return conCandado(function () {
    var peluquero = peluqueroActivo(datos.peluqueroId);
    var elegidos = resolverServicios(datos.servicioIds);
    if (!prestaServicios(peluquero.id, elegidos.servicios)) {
      throw AppError('Este peluquero no presta todos los servicios elegidos.', 'SERVICIO_NO_PRESTADO');
    }

    var ahora = ahoraPeluqueria();
    if (origen === 'web') {
      if (datos.fecha !== manana()) {
        throw AppError('Solo se pueden reservar turnos para mañana.', 'FECHA_NO_PERMITIDA');
      }
      if (!peluquero.recibe_reservas) throw AppError(MOTIVOS_SIN_HORARIOS.agenda_cerrada, 'AGENDA_CERRADA');
    } else if (datos.fecha < ahora.fecha || (datos.fecha === ahora.fecha && inicio < ahora.minutos)) {
      throw AppError('No se pueden registrar turnos en el pasado.', 'FECHA_NO_PERMITIDA');
    }

    var fin = inicio + elegidos.duracion;
    var agenda = cargarAgenda(peluquero.id, ahora.fecha);
    var cabe = cabeEnAgenda(agenda, datos.fecha, inicio, fin);
    if (!cabe.ok) {
      throw AppError('Ese horario ya no está disponible. Elige otro.', 'HORARIO_NO_DISPONIBLE', { motivo: cabe.motivo });
    }

    var marca = Reloj.ahora().toISOString();
    var cita = Db.insertar('Citas', {
      codigo: generarCodigo(),
      peluquero_id: peluquero.id,
      cliente_nombre: cliente.nombre,
      cliente_celular: cliente.celular,
      cliente_correo: cliente.correo,
      fecha: datos.fecha,
      inicio: inicio,
      fin: fin,
      duracion_min: elegidos.duracion,
      estado: 'confirmada',
      origen: origen,
      notas: datos.notas ? String(datos.notas).slice(0, 300) : '',
      creado_en: marca,
      actualizado_en: marca,
    });
    elegidos.servicios.forEach(function (s) {
      Db.insertar('CitaServicios', {
        cita_id: cita.id,
        servicio_id: s.id,
        nombre: s.nombre,
        duracion_min: s.duracion_min,
        precio: s.precio,
      });
    });
    registrar({
      actor: datos.actor || 'cliente',
      peluqueroId: peluquero.id,
      accion: 'cita_creada',
      entidad: 'Citas',
      entidadId: cita.id,
      detalle: { fecha: cita.fecha, inicio: aHora(inicio), duracion_min: elegidos.duracion, origen: origen },
    });
    return cita;
  });
}
