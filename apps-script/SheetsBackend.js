/**
 * Conexión con la hoja de Google Sheets a la que está vinculado el script.
 * Las pruebas reemplazan `backend` por una versión en memoria.
 */
function backend() {
  return SheetsBackend;
}

var SheetsBackend = {
  hoja: function (tabla) {
    var hoja = SpreadsheetApp.getActive().getSheetByName(tabla);
    if (!hoja) throw new Error('Falta la pestaña "' + tabla + '". Ejecuta la función instalar().');
    return hoja;
  },

  leer: function (tabla) {
    return this.hoja(tabla).getDataRange().getValues();
  },

  agregar: function (tabla, fila) {
    this.hoja(tabla).appendRow(fila);
  },

  reemplazar: function (tabla, numeroFila, fila) {
    this.hoja(tabla).getRange(numeroFila, 1, 1, fila.length).setValues([fila]);
  },

  borrar: function (tabla, numeroFila) {
    this.hoja(tabla).deleteRow(numeroFila);
  },
};

/**
 * Ejecuta `fn` con el candado global del script: solo una petición a la vez
 * puede modificar datos. Junto con volver a validar dentro del candado, esto
 * impide dobles reservas aunque dos clientes confirmen al mismo tiempo
 * (RF-036, RNF-007).
 */
function conCandado(fn) {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(CONFIG.ESPERA_CANDADO_MS)) {
    throw AppError('El sistema está ocupado. Intenta de nuevo en unos segundos.', 'OCUPADO');
  }
  try {
    Db.reiniciar(); // leer datos frescos ya con el candado tomado
    var resultado = fn();
    SpreadsheetApp.flush();
    return resultado;
  } finally {
    candado.releaseLock();
  }
}
