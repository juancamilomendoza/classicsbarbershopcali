'use strict';

// Panel del peluquero: inicio de sesión con Google, agenda, estados,
// turnos manuales, reprogramación y servicios.

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./entorno');

const CLIENTE = { nombre: 'Andrés Pérez', celular: '3001234567', correo: 'andres@example.com' };
const CLIENT_ID = 'cliente-tunero.apps.googleusercontent.com';

function preparar() {
  const entorno = crearEntorno(); // miércoles 2026-11-11, 3:00 p. m.
  const { g } = entorno;
  const Db = g('Db');
  const crear = (nombre, correo, permisos) => {
    const p = Db.insertar('Peluqueros', { nombre, correo, recibe_reservas: true, activo: true, puede_editar_servicios: permisos, version_sesion: 0 });
    for (const dia of [1, 2, 3, 4, 5, 6]) Db.insertar('HorarioSemanal', { peluquero_id: p.id, dia_semana: dia, inicio: 540, fin: 1140 });
    for (const s of Db.todos('Servicios')) Db.insertar('ServiciosPeluquero', { peluquero_id: p.id, servicio_id: s.id });
    return p;
  };
  const tunero = crear('Tunero', 'Tunero@gmail.com', true);
  const carlos = crear('Carlos', 'carlos@gmail.com', false);

  // Google responde según el correo que trae la "credencial" de prueba.
  g('this').consultarCredencialGoogle = (credencial) => {
    const [correo, aud = CLIENT_ID, verificado = 'true'] = credencial.split('|');
    return { email: correo, aud, iss: 'https://accounts.google.com', email_verified: verificado, exp: String(Date.parse('2026-11-12T00:00:00Z') / 1000) };
  };

  const api = (peticion) => JSON.parse(JSON.stringify(g('atender')(peticion)));
  const entrar = (correo) => {
    const r = api({ accion: 'sesion.google', credencial: correo });
    assert.equal(r.ok, true, r.error);
    return r.datos.token;
  };
  const reservar = (peluqueroId, inicio, fecha = '2026-11-12') => {
    const r = api({ accion: 'reservar', peluqueroId, servicioIds: [1, 2], fecha, inicio, cliente: CLIENTE });
    assert.equal(r.ok, true, r.error);
    return g('Db').donde('Citas', (c) => c.codigo === r.datos.codigo)[0];
  };
  return { entorno, g, api, entrar, reservar, tunero, carlos };
}

test('inicia sesión con Google si el correo está en la pestaña Peluqueros (sin importar mayúsculas)', () => {
  const { api } = preparar();
  const r = api({ accion: 'sesion.google', credencial: 'tunero@gmail.com' });
  assert.equal(r.ok, true);
  assert.equal(r.datos.peluquero.nombre, 'Tunero');
  assert.equal(r.datos.peluquero.correo, 'Tunero@gmail.com');
  assert.ok(!('version_sesion' in r.datos.peluquero));
});

test('rechaza cuentas que no son peluqueros o credenciales de otra aplicación', () => {
  const { api } = preparar();
  assert.equal(api({ accion: 'sesion.google', credencial: 'intruso@gmail.com' }).codigo, 'NO_AUTORIZADO');
  assert.equal(api({ accion: 'sesion.google', credencial: 'tunero@gmail.com|otra-app' }).codigo, 'CREDENCIAL_INVALIDA');
  assert.equal(api({ accion: 'sesion.google', credencial: 'tunero@gmail.com|' + CLIENT_ID + '|false' }).codigo, 'CREDENCIAL_INVALIDA');
});

test('las acciones del panel exigen una sesión válida y no aceptan tokens alterados', () => {
  const { api, entrar, g, tunero } = preparar();
  assert.equal(api({ accion: 'agenda' }).codigo, 'SESION_INVALIDA');
  const token = entrar('tunero@gmail.com');
  assert.equal(api({ accion: 'yo', token }).ok, true);

  const [, version, vence, firma] = token.split('.');
  assert.equal(api({ accion: 'yo', token: ['2', version, vence, firma].join('.') }).codigo, 'SESION_INVALIDA', 'otro id con la misma firma');

  g('Db').actualizar('Peluqueros', tunero.id, { version_sesion: 1 });
  assert.equal(api({ accion: 'yo', token }).codigo, 'SESION_INVALIDA', 'subir la versión cierra la sesión');
});

test('la agenda muestra solo los turnos propios y un peluquero no puede ver turnos de otro', () => {
  const { api, entrar, reservar, tunero, carlos } = preparar();
  const cita = reservar(tunero.id, 600);
  reservar(carlos.id, 600);

  const token = entrar('tunero@gmail.com');
  const agenda = api({ accion: 'agenda', token, fecha: '2026-11-12' }).datos;
  assert.equal(agenda.dias.length, 1);
  assert.equal(agenda.dias[0].turnos.length, 1);
  assert.equal(agenda.dias[0].turnos[0].cliente.celular, '3001234567');

  const semana = api({ accion: 'agenda', token, fecha: '2026-11-12', vista: 'semana' }).datos;
  assert.equal(semana.desde, '2026-11-09', 'la semana empieza el lunes');
  assert.equal(semana.dias.length, 7);
  assert.equal(semana.dias[6].motivo, 'No trabaja', 'domingo');

  const ajeno = api({ accion: 'turno', token: entrar('carlos@gmail.com'), id: cita.id });
  assert.equal(ajeno.codigo, 'NO_ENCONTRADA');
});

test('el peluquero cambia el estado del turno y solo en el orden permitido', () => {
  const { api, entrar, reservar, tunero } = preparar();
  const cita = reservar(tunero.id, 600);
  const token = entrar('tunero@gmail.com');
  assert.equal(api({ accion: 'turno.estado', token, id: cita.id, estado: 'en_atencion' }).datos.estadoTexto, 'En atención');
  assert.equal(api({ accion: 'turno.estado', token, id: cita.id, estado: 'completada' }).datos.estado, 'completada');
  assert.equal(api({ accion: 'turno.estado', token, id: cita.id, estado: 'confirmada' }).codigo, 'ESTADO_INVALIDO');
});

test('si el peluquero cancela, el cliente recibe un correo y él no se avisa a sí mismo', () => {
  const { entorno, api, entrar, reservar, tunero, g } = preparar();
  const cita = reservar(tunero.id, 600);
  const avisosAntes = g('Db').todos('Notificaciones').length;
  const token = entrar('tunero@gmail.com');
  const r = api({ accion: 'turno.estado', token, id: cita.id, estado: 'cancelada', motivo: 'Incapacidad médica' });
  assert.equal(r.datos.motivoCancelacion, 'Incapacidad médica');
  const correo = entorno.correos.at(-1);
  assert.equal(correo.to, CLIENTE.correo);
  assert.match(correo.body, /Incapacidad médica/);
  assert.equal(g('Db').todos('Notificaciones').length, avisosAntes);
});

test('registra un turno manual de hoy sin correo, solo en horas que aún no pasan', () => {
  const { api, entrar } = preparar();
  const token = entrar('tunero@gmail.com');
  const horarios = api({ accion: 'manual.horarios', token, servicioIds: [1], fecha: '2026-11-11' }).datos;
  assert.equal(horarios.horarios[0].hora, '15:00', 'son las 3:00 p. m.');

  const cliente = { nombre: 'Don Jairo', celular: '3105550000' };
  const pasado = api({ accion: 'manual.crear', token, servicioIds: [1], fecha: '2026-11-11', inicio: 600, cliente });
  assert.equal(pasado.codigo, 'FECHA_NO_PERMITIDA');
  const ok = api({ accion: 'manual.crear', token, servicioIds: [1], fecha: '2026-11-11', inicio: 900, cliente });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.datos.origen, 'manual');
});

test('el peluquero mueve un turno a otro día libre y no encima de otro', () => {
  const { api, entrar, reservar, tunero } = preparar();
  const a = reservar(tunero.id, 600);
  reservar(tunero.id, 660);
  const token = entrar('tunero@gmail.com');
  assert.equal(api({ accion: 'turno.mover', token, id: a.id, fecha: '2026-11-12', inicio: 650 }).codigo, 'HORARIO_NO_DISPONIBLE');
  const movido = api({ accion: 'turno.mover', token, id: a.id, fecha: '2026-11-14', inicio: 600 });
  assert.equal(movido.datos.fecha, '2026-11-14');
});

test('marca los turnos que quedaron por fuera de la disponibilidad', () => {
  const { api, entrar, reservar, tunero, g } = preparar();
  const cita = reservar(tunero.id, 600);
  g('Db').insertar('Ausencias', { peluquero_id: tunero.id, tipo: 'imprevista', fecha_inicio: '2026-11-12', fecha_fin: '2026-11-12', estado: 'activa' });
  const token = entrar('tunero@gmail.com');
  assert.equal(api({ accion: 'turno', token, id: cita.id }).datos.fueraDeDisponibilidad, true);
});

test('solo quien tiene permiso edita servicios, y las citas confirmadas no cambian', () => {
  const { api, entrar, reservar, tunero, g } = preparar();
  const cita = reservar(tunero.id, 600);
  const sinPermiso = api({ accion: 'servicios.guardar', token: entrar('carlos@gmail.com'), servicio: { id: 1, nombre: 'Corte', duracionMin: 40 } });
  assert.equal(sinPermiso.codigo, 'SIN_PERMISO');

  const token = entrar('tunero@gmail.com');
  const r = api({ accion: 'servicios.guardar', token, servicio: { id: 1, nombre: 'Corte', duracionMin: 30, precio: 25000 } });
  assert.equal(r.datos.servicios[0].duracionMin, 30);
  assert.equal(g('Db').porId('Citas', cita.id).duracion_min, 25, 'la cita confirmada conserva su duración');

  const nuevo = api({ accion: 'servicios.guardar', token, servicio: { nombre: 'Mascarilla', duracionMin: 15 } });
  assert.equal(nuevo.datos.servicios.length, 4);
});

test('cada peluquero elige qué servicios presta y eso cambia a quién se ofrece', () => {
  const { api, entrar } = preparar();
  api({ accion: 'servicios.prestar', token: entrar('carlos@gmail.com'), servicioIds: [1, 2] });
  const conCejas = api({ accion: 'peluqueros', servicioIds: [3] }).datos.map((p) => p.nombre);
  assert.deepEqual([...conCejas], ['Tunero']);
});

test('notificaciones e historial del peluquero', () => {
  const { api, entrar, reservar, tunero } = preparar();
  reservar(tunero.id, 600);
  const token = entrar('tunero@gmail.com');
  assert.equal(api({ accion: 'yo', token }).datos.noLeidas, 1);
  const leidas = api({ accion: 'notificaciones.leer', token }).datos;
  assert.equal(leidas[0].leida, true);
  const registro = api({ accion: 'registro', token }).datos.map((r) => r.accion);
  assert.ok(registro.includes('cita_creada') && registro.includes('inicio_sesion'));
});
