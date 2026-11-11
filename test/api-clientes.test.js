'use strict';

// Flujo del cliente a través de la API: reservar, consultar, cancelar y
// reprogramar con celular + código.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./entorno');

const CLIENTE = { nombre: 'Andrés Pérez', celular: '3001234567', correo: 'andres@example.com' };

function preparar(opciones) {
  const entorno = crearEntorno(opciones);
  const Db = entorno.g('Db');
  const peluquero = Db.insertar('Peluqueros', {
    nombre: 'Tunero',
    correo: 'tunero@example.com',
    recibe_reservas: true,
    activo: true,
  });
  for (const dia of [1, 2, 3, 4, 5, 6]) {
    Db.insertar('HorarioSemanal', { peluquero_id: peluquero.id, dia_semana: dia, inicio: 540, fin: 1080 });
  }
  Db.insertar('Descansos', { peluquero_id: peluquero.id, dia_semana: 4, inicio: 780, fin: 840, nombre: 'Almuerzo' });
  for (const s of Db.todos('Servicios')) Db.insertar('ServiciosPeluquero', { peluquero_id: peluquero.id, servicio_id: s.id });
  const api = (peticion) => JSON.parse(JSON.stringify(entorno.g('atender')(peticion)));
  return { entorno, api, peluquero };
}

function reservar(api, peluquero, inicio = 600) {
  const r = api({
    accion: 'reservar',
    peluqueroId: peluquero.id,
    servicioIds: [1, 2],
    fecha: '2026-11-12',
    inicio,
    cliente: CLIENTE,
  });
  assert.equal(r.ok, true, r.error);
  return r.datos;
}

test('inicio devuelve servicios y peluqueros', () => {
  const { api } = preparar();
  const r = api({ accion: 'inicio' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos.servicios.map((s) => s.nombre), ['Corte', 'Barba', 'Cejas']);
  assert.equal(r.datos.peluqueros[0].nombre, 'Tunero');
});

test('disponibilidad muestra solo horarios de mañana que caben antes del almuerzo', () => {
  const { api, peluquero } = preparar();
  const r = api({ accion: 'disponibilidad', peluqueroId: peluquero.id, servicioIds: [1, 3] });
  assert.equal(r.datos.fecha, '2026-11-12');
  assert.equal(r.datos.duracionMin, 50);
  const horas = r.datos.horarios.map((h) => h.hora);
  assert.ok(horas.includes('12:00'));
  assert.ok(!horas.includes('12:15'), '12:15 + 50 min se cruza con el almuerzo de 13:00');
});

test('reservar confirma, envía correo al cliente y avisa al peluquero', () => {
  const { entorno, api, peluquero } = preparar();
  const cita = reservar(api, peluquero);
  assert.equal(cita.estado, 'confirmada');
  assert.equal(cita.duracionMin, 25);
  assert.equal(cita.horaTexto, '10:00 a. m.');
  assert.equal(cita.fechaLegible, 'jueves 12 de noviembre');

  const alCliente = entorno.correos.find((c) => c.to === CLIENTE.correo);
  assert.match(alCliente.subject, /confirmada/);
  assert.ok(alCliente.body.includes(cita.codigo));
  assert.equal(entorno.g('Db').todos('Notificaciones').length, 1);
});

test('un fallo del correo no revierte la reserva y queda para reintento', () => {
  const { entorno, api, peluquero } = preparar();
  entorno.correo.falla = true;
  const cita = reservar(api, peluquero);
  assert.equal(cita.estado, 'confirmada');
  const Db = entorno.g('Db');
  assert.ok(Db.todos('Envios').every((e) => e.estado === 'fallido'));

  entorno.correo.falla = false;
  entorno.g('reintentarEnvios')();
  assert.ok(Db.todos('Envios').every((e) => e.estado === 'enviado'));
  assert.equal(Db.todos('Citas').length, 1);
});

test('consultar exige el celular correcto: otro número con el mismo código no ve la cita', () => {
  const { api, peluquero } = preparar();
  const cita = reservar(api, peluquero);
  const propia = api({ accion: 'cita.consultar', celular: '300 123 4567', codigo: cita.codigo.toLowerCase() });
  assert.equal(propia.ok, true);
  const ajena = api({ accion: 'cita.consultar', celular: '3109999999', codigo: cita.codigo });
  assert.equal(ajena.ok, false);
  assert.equal(ajena.codigo, 'NO_ENCONTRADA');
});

test('bloquea temporalmente tras muchos códigos equivocados', () => {
  const { api } = preparar();
  for (let i = 0; i < 10; i++) api({ accion: 'cita.consultar', celular: CLIENTE.celular, codigo: 'XXXXXXXX' });
  const r = api({ accion: 'cita.consultar', celular: CLIENTE.celular, codigo: 'XXXXXXXX' });
  assert.equal(r.codigo, 'DEMASIADOS_INTENTOS');
});

test('el cliente cancela y el horario vuelve a quedar libre', () => {
  const { api, peluquero } = preparar();
  const cita = reservar(api, peluquero);
  const r = api({ accion: 'cita.cancelar', celular: CLIENTE.celular, codigo: cita.codigo });
  assert.equal(r.datos.estado, 'cancelada');
  const disp = api({ accion: 'disponibilidad', peluqueroId: peluquero.id, servicioIds: [1, 2] });
  assert.ok(disp.datos.horarios.some((h) => h.hora === '10:00'));
});

test('no permite cancelar con menos de 2 horas de anticipación', () => {
  const { entorno, api, peluquero } = preparar();
  const cita = reservar(api, peluquero, 540); // jueves 9:00
  entorno.fijarAhora('2026-11-12T07:30:00-05:00'); // jueves 7:30, faltan 90 minutos
  const r = api({ accion: 'cita.cancelar', celular: CLIENTE.celular, codigo: cita.codigo });
  assert.equal(r.codigo, 'FUERA_DE_PLAZO');
});

test('el cliente reprograma a otro horario libre y no puede caer encima de otra cita', () => {
  const { api, peluquero } = preparar();
  const mia = reservar(api, peluquero, 600);
  reservar(api, peluquero, 660); // otra persona a las 11:00

  const horarios = api({ accion: 'cita.horarios', celular: CLIENTE.celular, codigo: mia.codigo });
  const horas = horarios.datos.horarios.map((h) => h.hora);
  assert.ok(horas.includes('10:00'), 'su propio horario sigue disponible para ella');
  assert.ok(!horas.includes('11:00'));

  const choque = api({ accion: 'cita.reprogramar', celular: CLIENTE.celular, codigo: mia.codigo, inicio: 650 });
  assert.equal(choque.codigo, 'HORARIO_NO_DISPONIBLE');

  const ok = api({ accion: 'cita.reprogramar', celular: CLIENTE.celular, codigo: mia.codigo, inicio: 900 });
  assert.equal(ok.datos.hora, '15:00');
});

test('acciones desconocidas y errores internos no exponen detalles', () => {
  const { api } = preparar();
  assert.equal(api({ accion: 'Db.borrar' }).codigo, 'ACCION_DESCONOCIDA');
  assert.equal(api({ accion: 'toString' }).codigo, 'ACCION_DESCONOCIDA');
});
