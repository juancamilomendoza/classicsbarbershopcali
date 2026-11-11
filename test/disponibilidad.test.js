'use strict';

// Pruebas del motor de disponibilidad (Availability.js), sin hoja.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./entorno');

const { g } = crearEntorno();
const horariosDisponibles = g('horariosDisponibles');
const cabeEnAgenda = g('cabeEnAgenda');
const aMinutos = g('aMinutos');
const aHora = g('aHora');

// Miércoles 2026-11-11 → jueves 2026-11-12 es "mañana".
const JUEVES = '2026-11-12';

function agendaBase(cambios = {}) {
  return {
    // Lunes a sábado de 9:00 a 18:00
    semanal: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, { inicio: aMinutos('09:00'), fin: aMinutos('18:00') }])),
    descansos: [],
    especiales: {},
    ausencias: [],
    citas: [],
    ...cambios,
  };
}

const horas = (resultado) => resultado.horarios.map(aHora);

test('ofrece inicios cada 15 minutos dentro de la jornada', () => {
  const r = horariosDisponibles(agendaBase(), JUEVES, 55, { intervalo: 15 });
  assert.equal(horas(r)[0], '09:00');
  assert.equal(horas(r)[1], '09:15');
  // La última cita de 55 min que cabe antes de las 18:00 empieza a las 17:00.
  assert.equal(horas(r).at(-1), '17:00');
});

test('no ofrece un turno que no cabe completo antes del cierre', () => {
  const r = horariosDisponibles(agendaBase(), JUEVES, 25, { intervalo: 15 });
  assert.ok(!horas(r).includes('17:45'), 'a las 17:45 la cita terminaría 18:10');
  assert.ok(horas(r).includes('17:30'));
});

test('no ofrece un turno que no cabe completo antes de un descanso', () => {
  const agenda = agendaBase({
    descansos: [{ diaSemana: 4, inicio: aMinutos('13:00'), fin: aMinutos('14:00') }],
  });
  const r = horas(horariosDisponibles(agenda, JUEVES, 50, { intervalo: 15 }));
  assert.ok(r.includes('12:00'), '12:00 + 50 min = 12:50, cabe');
  assert.ok(!r.includes('12:15'), '12:15 + 50 min = 13:05, se cruza con el descanso');
  assert.ok(!r.includes('13:30'));
  assert.ok(r.includes('14:00'), 'se reanuda al terminar el descanso');
});

test('ofrece el hueco justo al terminar otra cita, aunque no caiga en el intervalo', () => {
  const agenda = agendaBase({
    citas: [{ id: 1, fecha: JUEVES, inicio: aMinutos('09:00'), fin: aMinutos('09:25') }],
  });
  const r = horas(horariosDisponibles(agenda, JUEVES, 20, { intervalo: 15 }));
  assert.equal(r[0], '09:25');
  assert.ok(!r.includes('09:15'));
});

test('no muestra horarios durante las vacaciones', () => {
  const agenda = agendaBase({
    ausencias: [{ tipo: 'vacaciones', fechaInicio: '2026-11-10', fechaFin: '2026-11-20', inicio: null, fin: null }],
  });
  const r = horariosDisponibles(agenda, JUEVES, 20);
  assert.equal(r.horarios.length, 0);
  assert.equal(r.motivo, 'vacaciones');
});

test('al terminar las vacaciones vuelve la disponibilidad, pero se mantienen otros bloqueos', () => {
  const agenda = agendaBase({
    ausencias: [
      { tipo: 'vacaciones', fechaInicio: '2026-11-01', fechaFin: '2026-11-11', inicio: null, fin: null },
      { tipo: 'bloqueo', fechaInicio: JUEVES, fechaFin: JUEVES, inicio: aMinutos('10:00'), fin: aMinutos('11:00') },
    ],
  });
  const r = horas(horariosDisponibles(agenda, JUEVES, 20, { intervalo: 15 }));
  assert.ok(r.includes('09:00'), 'el día después de las vacaciones hay horarios');
  assert.ok(!r.includes('10:00') && !r.includes('10:30'), 'el bloqueo de 10 a 11 sigue vigente');
  assert.ok(r.includes('11:00'));
});

test('los días libres y los días sin jornada no tienen horarios', () => {
  const libre = agendaBase({
    ausencias: [{ tipo: 'dia_libre', fechaInicio: JUEVES, fechaFin: JUEVES, inicio: null, fin: null }],
  });
  assert.equal(horariosDisponibles(libre, JUEVES, 20).motivo, 'dia_libre');
  assert.equal(horariosDisponibles(agendaBase(), '2026-11-15', 20).motivo, 'no_trabaja', 'domingo');
});

test('un horario especial reemplaza la jornada habitual de esa fecha', () => {
  const agenda = agendaBase({ especiales: { [JUEVES]: { inicio: aMinutos('12:00'), fin: aMinutos('15:00') } } });
  const r = horas(horariosDisponibles(agenda, JUEVES, 20, { intervalo: 15 }));
  assert.equal(r[0], '12:00');
  assert.equal(r.at(-1), '14:30');
});

test('cabeEnAgenda rechaza solapes con otras citas y respeta la cita que se reprograma', () => {
  const agenda = agendaBase({
    citas: [{ id: 7, fecha: JUEVES, inicio: aMinutos('10:00'), fin: aMinutos('10:50') }],
  });
  assert.equal(cabeEnAgenda(agenda, JUEVES, aMinutos('10:30'), aMinutos('10:55')).motivo, 'ocupado');
  assert.ok(cabeEnAgenda(agenda, JUEVES, aMinutos('10:30'), aMinutos('10:55'), { ignorarCitaId: 7 }).ok);
  assert.ok(cabeEnAgenda(agenda, JUEVES, aMinutos('10:50'), aMinutos('11:15')).ok, 'puede empezar justo al terminar');
});
