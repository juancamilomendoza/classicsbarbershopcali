'use strict';

// Carga los archivos de apps-script/ en un contexto de Node con imitaciones
// de los servicios de Google (Utilities, LockService, SpreadsheetApp) y una
// hoja en memoria. Así se prueban las reglas de negocio sin Google.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const CARPETA = path.join(__dirname, '..', 'apps-script');

function formatoFecha(fecha, zona) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const v = (t) => partes.find((p) => p.type === t).value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}

function crearEntorno({ ahora = '2026-11-11T15:00:00-05:00' } = {}) {
  const hojas = {};
  const candado = { alTomar: null, tomado: false };
  const correos = [];
  const cache = new Map();
  const correo = { falla: false };
  const propiedades = { GOOGLE_CLIENT_ID: 'cliente-tunero.apps.googleusercontent.com' };

  const contexto = {
    console,
    Utilities: {
      formatDate: (fecha, zona) => formatoFecha(fecha, zona),
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (valor, llave) =>
        Array.from(crypto.createHmac('sha256', llave).update(valor).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => (b + 256) % 256)).toString('base64url') + '=',
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propiedades ? propiedades[k] : null),
        setProperty: (k, v) => {
          propiedades[k] = v;
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          // Permite simular otra petición que tenía el candado antes.
          if (candado.alTomar) {
            const fn = candado.alTomar;
            candado.alTomar = null;
            fn();
          }
          if (candado.tomado) throw new Error('El candado ya estaba tomado');
          candado.tomado = true;
          return true;
        },
        releaseLock() {
          candado.tomado = false;
        },
      }),
    },
    SpreadsheetApp: { flush() {} },
    MailApp: {
      sendEmail(mensaje) {
        if (correo.falla) throw new Error('Cuota de correo agotada');
        correos.push(mensaje);
      },
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
      }),
    },
    Logger: { log() {} },
  };
  vm.createContext(contexto);

  for (const archivo of fs.readdirSync(CARPETA).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(CARPETA, archivo), 'utf8'), contexto, { filename: archivo });
  }

  // Hoja en memoria: cada pestaña es una matriz con los encabezados en la fila 1.
  contexto.MemoriaBackend = {
    leer: (tabla) => hojas[tabla].map((f) => f.slice()),
    agregar: (tabla, fila) => hojas[tabla].push(fila.slice()),
    reemplazar: (tabla, n, fila) => {
      hojas[tabla][n - 1] = fila.slice();
    },
    borrar: (tabla, n) => hojas[tabla].splice(n - 1, 1),
  };
  vm.runInContext('function backend() { return MemoriaBackend; }', contexto);

  const g = (codigo) => vm.runInContext(codigo, contexto);
  for (const tabla of Object.keys(g('TABLAS'))) hojas[tabla] = [g('Db.columnas')(tabla)];

  const reloj = g('Reloj');
  let instante = new Date(ahora);
  reloj.ahora = () => instante;

  g('cargarServiciosIniciales')();

  return {
    g,
    hojas,
    candado,
    correos,
    correo,
    propiedades,
    fijarAhora(iso) {
      instante = new Date(iso);
    },
  };
}

module.exports = { crearEntorno };
