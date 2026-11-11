/**
 * Carga la agenda de un peluquero desde la hoja, en el formato que espera el
 * motor de disponibilidad (Availability.js).
 */
function cargarAgenda(peluqueroId, desdeFecha) {
  var id = Number(peluqueroId);
  var delPeluquero = function (o) {
    return o.peluquero_id === id;
  };

  var semanal = {};
  Db.donde('HorarioSemanal', delPeluquero).forEach(function (h) {
    if (h.dia_semana !== null && h.inicio !== null && h.fin !== null) {
      semanal[h.dia_semana] = { inicio: h.inicio, fin: h.fin };
    }
  });

  var especiales = {};
  Db.donde('HorariosEspeciales', delPeluquero).forEach(function (h) {
    if (h.fecha >= desdeFecha && h.inicio !== null && h.fin !== null) {
      especiales[h.fecha] = { inicio: h.inicio, fin: h.fin };
    }
  });

  return {
    semanal: semanal,
    especiales: especiales,
    descansos: Db.donde('Descansos', delPeluquero).map(function (d) {
      return { id: d.id, diaSemana: d.dia_semana, inicio: d.inicio, fin: d.fin };
    }),
    ausencias: Db.donde('Ausencias', function (a) {
      return delPeluquero(a) && a.estado !== 'cancelada' && a.fecha_fin >= desdeFecha;
    }).map(function (a) {
      return {
        id: a.id,
        tipo: a.tipo,
        fechaInicio: a.fecha_inicio,
        fechaFin: a.fecha_fin,
        inicio: a.tipo === 'bloqueo' ? a.inicio : null,
        fin: a.tipo === 'bloqueo' ? a.fin : null,
      };
    }),
    citas: Db.donde('Citas', function (c) {
      return delPeluquero(c) && c.fecha >= desdeFecha && ESTADOS_QUE_OCUPAN.indexOf(c.estado) !== -1;
    }).map(function (c) {
      return { id: c.id, fecha: c.fecha, inicio: c.inicio, fin: c.fin };
    }),
  };
}
