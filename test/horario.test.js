'use strict';

// Fase 4: el peluquero administra su horario, descansos y ausencias, con
// advertencia previa cuando un cambio afecta citas confirmadas.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./entorno');

const CLIENTE = { nombre: 'Andrés Pérez', celular: '3001234567', correo: 'andres@example.com' };

function preparar() {
  const entorno = crearEntorno(); // miércoles 2026-11-11, 3:00 p. m.
  const { g } = entorno;
  const Db = g('Db');
  const p = Db.insertar('Peluqueros', { nombre: 'Tunero', correo: 'tunero@gmail.com', recibe_reservas: true, activo: true, version_sesion: 0 });
  for (const dia of [1, 2, 3, 4, 5, 6]) Db.insertar('HorarioSemanal', { peluquero_id: p.id, dia_semana: dia, inicio: 540, fin: 1140 });
  for (const s of Db.todos('Servicios')) Db.insertar('ServiciosPeluquero', { peluquero_id: p.id, servicio_id: s.id });
  const api = (peticion) => JSON.parse(JSON.stringify(g('atender')(peticion)));
  const token = g('crearSesion')(Db.porId('Peluqueros', p.id));
  const panel = (accion, datos = {}) => api({ accion, token, ...datos });
  const reservar = (inicio) => {
    const r = api({ accion: 'reservar', peluqueroId: p.id, servicioIds: [1], fecha: '2026-11-12', inicio, cliente: CLIENTE });
    assert.equal(r.ok, true, r.error);
    return r.datos;
  };
  const horas = () => api({ accion: 'disponibilidad', peluqueroId: p.id, servicioIds: [1] }).datos;
  return { entorno, g, api, panel, reservar, horas, p };
}

test('muestra la semana empezando el lunes, con jornada y días libres', () => {
  const { panel } = preparar();
  const h = panel('horario').datos;
  assert.equal(h.semana[0].nombre, 'lunes');
  assert.equal(h.semana[0].inicio, '09:00');
  assert.equal(h.semana[6].nombre, 'domingo');
  assert.equal(h.semana[6].trabaja, false);
});

test('cambiar la jornada se refleja en los horarios que ven los clientes', () => {
  const { panel, horas } = preparar();
  const dias = [1, 2, 3, 4, 5, 6].map((dia) => ({ dia, trabaja: true, inicio: '10:00', fin: '14:00' }));
  assert.equal(panel('horario.semana', { dias }).ok, true);
  const h = horas().horarios.map((x) => x.hora);
  assert.equal(h[0], '10:00');
  assert.equal(h.at(-1), '13:30');
});

test('advierte antes de aplicar un cambio que afecta citas confirmadas y no lo aplica sin decisión', () => {
  const { panel, reservar, g } = preparar();
  reservar(600); // jueves 10:00
  const r = panel('horario.ausencia', { tipo: 'vacaciones', fechaInicio: '2026-11-12', fechaFin: '2026-11-20' });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'CITAS_AFECTADAS');
  assert.equal(r.datos.citas.length, 1);
  assert.equal(r.datos.citas[0].cliente, 'Andrés Pérez');
  assert.equal(g('Db').todos('Ausencias').length, 0, 'no se aplicó');
});

test('"cancelar" aplica el cambio, cancela las citas afectadas y avisa a los clientes', () => {
  const { entorno, panel, reservar, horas, g } = preparar();
  reservar(600);
  const r = panel('horario.ausencia', { tipo: 'vacaciones', fechaInicio: '2026-11-12', fechaFin: '2026-11-20', resolucion: 'cancelar' });
  assert.equal(r.ok, true, r.error);
  assert.equal(g('Db').todos('Citas')[0].estado, 'cancelada');
  assert.match(entorno.correos.at(-1).subject, /cancelada/);
  assert.equal(horas().horarios.length, 0, 'durante las vacaciones no hay horarios');
  assert.match(horas().mensaje, /vacaciones/);
});

test('"conservar" aplica el cambio y deja la cita marcada para resolverla', () => {
  const { panel, reservar, g } = preparar();
  const cita = reservar(600);
  panel('horario.descanso', { dias: [4], inicio: '10:00', fin: '11:00', nombre: 'Diligencia', resolucion: 'conservar' });
  const id = g('Db').donde('Citas', (c) => c.codigo === cita.codigo)[0].id;
  assert.equal(panel('turno', { id }).datos.fueraDeDisponibilidad, true);
});

test('un cambio que no afecta citas se aplica de inmediato', () => {
  const { panel, reservar, horas } = preparar();
  reservar(600);
  const r = panel('horario.descanso', { dias: [1, 2, 3, 4, 5, 6], inicio: '13:00', fin: '14:00', nombre: 'Almuerzo' });
  assert.equal(r.ok, true);
  assert.equal(r.datos.descansos.length, 6);
  assert.ok(!horas().horarios.some((x) => x.hora === '13:00'));
});

test('bloqueo de una franja y horario especial de una fecha', () => {
  const { panel, horas } = preparar();
  panel('horario.ausencia', { tipo: 'bloqueo', fechaInicio: '2026-11-12', inicio: '09:00', fin: '12:00', motivo: 'Cita médica' });
  assert.equal(horas().horarios[0].hora, '12:00');
  panel('horario.especial', { fecha: '2026-11-12', inicio: '15:00', fin: '17:00' });
  const h = horas().horarios.map((x) => x.hora);
  assert.equal(h[0], '15:00');
  assert.equal(h.at(-1), '16:30');
});

test('terminar las vacaciones antes de tiempo devuelve la disponibilidad pero mantiene otros bloqueos', () => {
  const { panel, horas, g } = preparar();
  panel('horario.ausencia', { tipo: 'bloqueo', fechaInicio: '2026-11-12', inicio: '09:00', fin: '10:00' });
  g('Db').insertar('Ausencias', { peluquero_id: 1, tipo: 'vacaciones', fecha_inicio: '2026-11-05', fecha_fin: '2026-11-30', estado: 'activa' });
  assert.equal(horas().horarios.length, 0);

  const vacaciones = panel('horario').datos.ausencias.find((a) => a.tipo === 'vacaciones');
  assert.equal(vacaciones.enCurso, true);
  const r = panel('horario.ausencia.terminar', { id: vacaciones.id }).datos;
  assert.ok(!r.ausencias.some((a) => a.tipo === 'vacaciones'), 'terminó ayer: ya no aparece');
  assert.equal(g('Db').porId('Ausencias', vacaciones.id).fecha_fin, '2026-11-10');

  const h = horas().horarios.map((x) => x.hora);
  assert.equal(h[0], '10:00', 'el bloqueo de 9 a 10 sigue vigente');
});

test('al pasar la fecha de fin, la disponibilidad vuelve sola (reactivación automática)', () => {
  const { entorno, panel, api, p } = preparar();
  panel('horario.ausencia', { tipo: 'permiso', fechaInicio: '2026-11-12', fechaFin: '2026-11-12' });
  entorno.fijarAhora('2026-11-12T10:00:00-05:00'); // jueves: mañana es viernes
  const d = api({ accion: 'disponibilidad', peluqueroId: p.id, servicioIds: [1] }).datos;
  assert.equal(d.fecha, '2026-11-13');
  assert.equal(d.horarios[0].hora, '09:00');
});

test('pausar las reservas oculta los horarios sin borrar el horario', () => {
  const { panel, horas } = preparar();
  panel('horario.reservas', { recibe: false });
  assert.equal(horas().horarios.length, 0);
  assert.match(horas().mensaje, /no está recibiendo/);
  assert.equal(panel('horario').datos.semana[0].trabaja, true);
  panel('horario.reservas', { recibe: true });
  assert.ok(horas().horarios.length > 0);
});

test('valida horas, fechas y tipos', () => {
  const { panel } = preparar();
  assert.equal(panel('horario.descanso', { dias: [1], inicio: '14:00', fin: '13:00' }).codigo, 'HORA_INVALIDA');
  assert.equal(panel('horario.ausencia', { tipo: 'vacaciones', fechaInicio: '2026-11-01', fechaFin: '2026-11-05' }).codigo, 'FECHA_NO_PERMITIDA');
  assert.equal(panel('horario.ausencia', { tipo: 'fiesta', fechaInicio: '2026-11-12' }).codigo, 'TIPO_INVALIDO');
  assert.equal(panel('horario.especial', { fecha: '2026-13-40', inicio: '09:00', fin: '10:00' }).codigo, 'FECHA_INVALIDA');
});

test('un peluquero no puede borrar descansos de otro', () => {
  const { panel, g } = preparar();
  const ajeno = g('Db').insertar('Descansos', { peluquero_id: 99, dia_semana: 1, inicio: 780, fin: 840 });
  assert.equal(panel('horario.descanso.borrar', { id: ajeno.id }).codigo, 'NO_ENCONTRADO');
});

test('los cambios de horario quedan en el historial', () => {
  const { panel } = preparar();
  panel('horario.ausencia', { tipo: 'dia_libre', fechaInicio: '2026-11-13' });
  const acciones = panel('registro').datos.map((r) => r.accion);
  assert.ok(acciones.includes('ausencia_dia_libre'));
});
