/**
 * Modo demostración: cuando no hay API_URL configurada, carga el mismo código
 * de la API (carpeta apps-script/) en el navegador, con imitaciones de los
 * servicios de Google y una hoja guardada en localStorage. Sirve para probar
 * la página sin instalar nada.
 */
(function () {
  'use strict';

  var ARCHIVOS = [
    'Config.js', 'Errors.js', 'Time.js', 'Schema.js', 'Db.js', 'SheetsBackend.js', 'Availability.js',
    'Agenda.js', 'Registro.js', 'Notify.js', 'Bookings.js', 'Clientes.js', 'Setup.js', 'Api.js',
  ];
  var LLAVE = 'tunero-demo-hoja-v1';

  window.TuneroDemo = {
    activo: !window.TUNERO_CONFIG.API_URL,
    listo: null,
    reiniciar: function () {
      try { localStorage.removeItem(LLAVE); } catch (e) { /* sin almacenamiento */ }
      location.reload();
    },
  };
  if (!window.TuneroDemo.activo) return;

  // Imitaciones de los servicios de Google
  var cache = {};
  window.Utilities = {
    formatDate: function (fecha, zona) {
      var p = new Intl.DateTimeFormat('en-CA', {
        timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(fecha);
      var v = function (t) { return p.filter(function (x) { return x.type === t; })[0].value; };
      return v('year') + '-' + v('month') + '-' + v('day') + 'T' + v('hour') + ':' + v('minute');
    },
    getUuid: function () {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      return Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    },
  };
  window.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  window.SpreadsheetApp = { flush: guardar };
  window.MailApp = { sendEmail: function (m) { console.info('[correo de demostración] para ' + m.to + '\n' + m.subject + '\n\n' + m.body); } };
  window.CacheService = { getScriptCache: function () { return { get: function (k) { return cache[k] || null; }, put: function (k, v) { cache[k] = v; } }; } };
  window.ContentService = null;

  var hojas = null;
  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(hojas)); } catch (e) { /* sin almacenamiento */ }
  }

  function cargarScript(src) {
    return new Promise(function (resolver, rechazar) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolver;
      s.onerror = function () { rechazar(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function sembrar() {
    // Dos peluqueros de ejemplo, lunes a sábado de 9:00 a 7:00 p. m. con almuerzo.
    cargarServiciosIniciales();
    [['Tunero', 'tunero@example.com'], ['Carlos', 'carlos@example.com']].forEach(function (d) {
      var p = Db.insertar('Peluqueros', { nombre: d[0], correo: d[1], recibe_reservas: true, activo: true });
      [1, 2, 3, 4, 5, 6].forEach(function (dia) {
        Db.insertar('HorarioSemanal', { peluquero_id: p.id, dia_semana: dia, inicio: 540, fin: 1140 });
        Db.insertar('Descansos', { peluquero_id: p.id, dia_semana: dia, inicio: 780, fin: 840, nombre: 'Almuerzo' });
      });
      Db.todos('Servicios').forEach(function (s) {
        Db.insertar('ServiciosPeluquero', { peluquero_id: p.id, servicio_id: s.id });
      });
    });
    guardar();
  }

  window.TuneroDemo.listo = ARCHIVOS.reduce(function (cadena, archivo) {
    return cadena.then(function () { return cargarScript('apps-script/' + archivo); });
  }, Promise.resolve()).then(function () {
    try { hojas = JSON.parse(localStorage.getItem(LLAVE) || 'null'); } catch (e) { hojas = null; }
    var nueva = !hojas;
    if (nueva) {
      hojas = {};
      Object.keys(TABLAS).forEach(function (t) { hojas[t] = [Db.columnas(t)]; });
    }
    window.backend = function () {
      return {
        leer: function (t) { return hojas[t].map(function (f) { return f.slice(); }); },
        agregar: function (t, fila) { hojas[t].push(fila.slice()); guardar(); },
        reemplazar: function (t, n, fila) { hojas[t][n - 1] = fila.slice(); guardar(); },
        borrar: function (t, n) { hojas[t].splice(n - 1, 1); guardar(); },
      };
    };
    if (nueva) sembrar();
  });
})();
