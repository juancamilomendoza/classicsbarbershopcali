'use strict';

// Pruebas de creación de citas contra una hoja en memoria.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./entorno');

const CLIENTE = { nombre: 'Andrés Pérez', celular: '300 123 4567', correo: 'andres@example.com' };

/** Peluquero que trabaja de lunes a sábado de 9:00 a 18:00 y presta los 3 servicios. */
function prepararPeluqueria(entorno) {
  const { g } = entorno;
  const Db = g('Db');
  const peluquero = Db.insertar('Peluqueros', {
    nombre: 'Tunero',
    correo: 'tunero@example.com',
    celular: '3000000000',
    puede_editar_servicios: true,
    recibe_reservas: true,
    activo: true,
  });
  for (const dia of [1, 2, 3, 4, 5, 6]) {
    Db.insertar('HorarioSemanal', { peluquero_id: peluquero.id, dia_semana: dia, inicio: 540, fin: 1080 });
  }
  const servicios = Db.todos('Servicios');
  for (const s of servicios) Db.insertar('ServiciosPeluquero', { peluquero_id: peluquero.id, servicio_id: s.id });
  const id = (nombre) => servicios.find((s) => s.nombre === nombre).id;
  return { peluquero, corte: id('Corte'), barba: id('Barba'), cejas: id('Cejas') };
}

function reservar(entorno, datos) {
  return entorno.g('crearCita')({ origen: 'web', cliente: CLIENTE, fecha: '2026-11-12', ...datos });
}

test('la hoja inicia con Corte 20, Barba 5 y Cejas 30 minutos', () => {
  const { g } = crearEntorno();
  const servicios = g('Db').todos('Servicios').map((s) => `${s.nombre} ${s.duracion_min}`);
  assert.deepEqual([...servicios], ['Corte 20', 'Barba 5', 'Cejas 30']);
});

test('corte + barba suma 25 minutos y los tres servicios 55', () => {
  const entorno = crearEntorno();
  const { corte, barba, cejas } = prepararPeluqueria(entorno);
  const resolver = entorno.g('resolverServicios');
  assert.equal(resolver([corte, barba]).duracion, 25);
  assert.equal(resolver([corte, barba, cejas]).duracion, 55);
  assert.equal(resolver([corte, cejas]).duracion, 50);
  assert.equal(resolver([barba, cejas]).duracion, 35);
});

test('crea la cita con su código, la guarda en la hoja como texto legible y la registra', () => {
  const entorno = crearEntorno();
  const { peluquero, corte, barba } = prepararPeluqueria(entorno);
  const cita = reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte, barba], inicio: 600 });

  assert.equal(cita.duracion_min, 25);
  assert.equal(cita.fin, 625);
  assert.match(cita.codigo, /^[A-Z2-9]{8}$/);
  assert.equal(cita.cliente_celular, '3001234567');

  const hoja = entorno.hojas.Citas;
  const fila = Object.fromEntries(hoja[0].map((c, i) => [c, hoja[1][i]]));
  assert.equal(fila.inicio, '10:00');
  assert.equal(fila.fin, '10:25');
  assert.equal(fila.estado, 'confirmada');
  assert.equal(entorno.hojas.CitaServicios.length, 3, 'encabezado + 2 servicios');

  const registro = entorno.g('Db').todos('Registro');
  assert.equal(registro[0].accion, 'cita_creada');
  assert.ok(!JSON.stringify(registro[0].detalle).includes(cita.codigo), 'el registro no guarda el código');
});

test('las reservas web solo se permiten para mañana', () => {
  const entorno = crearEntorno();
  const { peluquero, corte } = prepararPeluqueria(entorno);
  for (const fecha of ['2026-11-11', '2026-11-13']) {
    assert.throws(
      () => reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte], fecha, inicio: 600 }),
      (e) => e.codigo === 'FECHA_NO_PERMITIDA'
    );
  }
});

test('"mañana" se calcula con la hora de Colombia, no la del servidor', () => {
  // 11 de noviembre 23:30 en Bogotá = 12 de noviembre 04:30 UTC.
  const entorno = crearEntorno({ ahora: '2026-11-12T04:30:00Z' });
  assert.equal(entorno.g('manana')(), '2026-11-12');
});

test('si dos clientes confirman el mismo horario a la vez, solo uno obtiene la cita', () => {
  const entorno = crearEntorno();
  const { peluquero, corte } = prepararPeluqueria(entorno);

  // Ambos clientes vieron las 10:00 libres. Mientras el segundo espera el
  // candado, el primero termina su reserva.
  let primera;
  entorno.candado.alTomar = () => {
    primera = reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte], inicio: 600 });
  };
  assert.throws(
    () => reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte], inicio: 590 }),
    (e) => e.codigo === 'HORARIO_NO_DISPONIBLE'
  );
  assert.equal(primera.estado, 'confirmada');
  assert.equal(entorno.g('Db').todos('Citas').length, 1);
});

test('no permite reservar durante vacaciones ni fuera de la jornada', () => {
  const entorno = crearEntorno();
  const { peluquero, corte, cejas } = prepararPeluqueria(entorno);
  assert.throws(
    () => reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte, cejas], inicio: 1050 }),
    (e) => e.codigo === 'HORARIO_NO_DISPONIBLE',
    '17:30 + 50 min termina después de las 18:00'
  );
  entorno.g('Db').insertar('Ausencias', {
    peluquero_id: peluquero.id,
    tipo: 'vacaciones',
    fecha_inicio: '2026-11-12',
    fecha_fin: '2026-11-20',
    estado: 'activa',
  });
  assert.throws(
    () => reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte], inicio: 600 }),
    (e) => e.codigo === 'HORARIO_NO_DISPONIBLE' && e.datos.motivo === 'vacaciones'
  );
});

test('rechaza reservas si el peluquero pausó su agenda', () => {
  const entorno = crearEntorno();
  const { peluquero, corte } = prepararPeluqueria(entorno);
  entorno.g('Db').actualizar('Peluqueros', peluquero.id, { recibe_reservas: false });
  assert.throws(
    () => reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte], inicio: 600 }),
    (e) => e.codigo === 'AGENDA_CERRADA'
  );
});

test('valida nombre, celular y correo del cliente', () => {
  const entorno = crearEntorno();
  const { peluquero, corte } = prepararPeluqueria(entorno);
  for (const cliente of [
    { ...CLIENTE, nombre: '' },
    { ...CLIENTE, celular: '123' },
    { ...CLIENTE, correo: 'sin-arroba' },
  ]) {
    assert.throws(
      () => reservar(entorno, { peluqueroId: peluquero.id, servicioIds: [corte], inicio: 600, cliente }),
      (e) => e.codigo === 'DATOS_CLIENTE'
    );
  }
});

test('conserva columnas agregadas a mano al actualizar una fila', () => {
  const entorno = crearEntorno();
  const { hojas, g } = entorno;
  hojas.Servicios[0].push('mi_nota');
  hojas.Servicios[1].push('favorito');
  g('Db').reiniciar();
  g('Db').actualizar('Servicios', 1, { precio: 25000 });
  assert.equal(hojas.Servicios[1].at(-1), 'favorito');
  assert.equal(g('Db').porId('Servicios', 1).precio, 25000);
});
