/**
 * Acceso a los datos de la hoja.
 *
 * Cada tabla se lee completa una vez por petición y se guarda en memoria; las
 * escrituras van a la hoja y a la memoria a la vez. El volumen de una barbería
 * (cientos o pocos miles de filas) cabe sin problema.
 *
 * El "backend" es quien habla con la hoja real (ver SheetsBackend.js). En las
 * pruebas se reemplaza por uno en memoria.
 */
var Db = (function () {
  var cache = {};
  var encabezados = {};

  function columnas(tabla) {
    var def = TABLAS[tabla];
    if (!def) throw new Error('Tabla desconocida: ' + tabla);
    return Object.keys(def);
  }

  function leerCelda(tipo, valor) {
    var vacio = valor === '' || valor === null || valor === undefined;
    switch (tipo) {
      case 'entero':
        return vacio ? null : Number(valor);
      case 'sino':
        return ['SI', 'SÍ', 'TRUE', '1', 'X'].indexOf(String(valor).trim().toUpperCase()) !== -1;
      case 'hora':
        return vacio ? null : aMinutos(valor);
      case 'dia':
        return vacio ? null : numeroDiaSemana(valor);
      case 'json':
        return vacio ? null : JSON.parse(valor);
      default:
        return vacio ? '' : String(valor);
    }
  }

  function escribirCelda(tipo, valor) {
    if (valor === null || valor === undefined) return '';
    switch (tipo) {
      case 'sino':
        return valor ? 'SI' : 'NO';
      case 'hora':
        return aHora(valor);
      case 'dia':
        return DIAS_SEMANA[valor];
      case 'json':
        return JSON.stringify(valor);
      case 'entero':
        return String(valor);
      default:
        return String(valor);
    }
  }

  /**
   * Convierte un objeto en una fila, siguiendo el orden de las columnas de la
   * hoja. Las columnas que el código no conoce (agregadas a mano) conservan su
   * valor anterior.
   */
  function aFila(tabla, objeto, crudo) {
    var def = TABLAS[tabla];
    return (encabezados[tabla] || columnas(tabla)).map(function (c, j) {
      if (def[c]) return escribirCelda(def[c], objeto[c]);
      return crudo ? crudo[j] : '';
    });
  }

  function cargar(tabla) {
    if (cache[tabla]) return cache[tabla];
    var def = TABLAS[tabla];
    var valores = backend().leer(tabla);
    var cols = (valores[0] || []).map(function (c) { return String(c).trim(); });
    encabezados[tabla] = cols.length ? cols : columnas(tabla);
    var filas = [];
    for (var i = 1; i < valores.length; i++) {
      var fila = valores[i];
      if (fila.every(function (v) { return v === '' || v === null; })) continue;
      var objeto = { _fila: i + 1, _crudo: fila };
      cols.forEach(function (c, j) {
        if (def[c]) objeto[c] = leerCelda(def[c], fila[j]);
      });
      filas.push(objeto);
    }
    cache[tabla] = filas;
    return filas;
  }

  function copia(objeto) {
    var r = {};
    Object.keys(objeto).forEach(function (k) {
      if (k !== '_fila' && k !== '_crudo') r[k] = objeto[k];
    });
    return r;
  }

  return {
    /** Olvida lo leído; se llama al inicio de cada petición y dentro del candado. */
    reiniciar: function () {
      cache = {};
    },

    todos: function (tabla) {
      return cargar(tabla).map(copia);
    },

    donde: function (tabla, filtro) {
      return cargar(tabla).filter(filtro).map(copia);
    },

    porId: function (tabla, id) {
      var r = cargar(tabla).filter(function (o) { return o.id === Number(id); })[0];
      return r ? copia(r) : null;
    },

    /** Inserta y devuelve el objeto guardado (con `id` asignado si la tabla lo tiene). */
    insertar: function (tabla, objeto) {
      var filas = cargar(tabla);
      var nuevo = copia(objeto);
      if ('id' in TABLAS[tabla] && !nuevo.id) {
        nuevo.id = filas.reduce(function (max, o) { return Math.max(max, o.id || 0); }, 0) + 1;
      }
      backend().agregar(tabla, aFila(tabla, nuevo));
      delete cache[tabla];
      return nuevo;
    },

    /** Actualiza campos de la fila con ese id y devuelve el objeto resultante. */
    actualizar: function (tabla, id, cambios) {
      var actual = cargar(tabla).filter(function (o) { return o.id === Number(id); })[0];
      if (!actual) throw new Error('No existe ' + tabla + ' ' + id);
      var nuevo = copia(actual);
      Object.keys(cambios).forEach(function (k) { nuevo[k] = cambios[k]; });
      backend().reemplazar(tabla, actual._fila, aFila(tabla, nuevo, actual._crudo));
      delete cache[tabla];
      return nuevo;
    },

    /** Borra todas las filas que cumplan el filtro. */
    borrar: function (tabla, filtro) {
      var filas = cargar(tabla).filter(filtro).map(function (o) { return o._fila; });
      // De abajo hacia arriba para que los números de fila no se corran.
      filas.sort(function (a, b) { return b - a; }).forEach(function (f) { backend().borrar(tabla, f); });
      delete cache[tabla];
      return filas.length;
    },

    columnas: columnas,
  };
})();
