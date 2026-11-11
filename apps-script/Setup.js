/**
 * Instalación de la hoja. Ejecutar `instalar` una vez desde el editor de Apps
 * Script (menú Ejecutar). Es seguro ejecutarla de nuevo: solo crea lo que falte
 * y nunca borra datos.
 */
function instalar() {
  var libro = SpreadsheetApp.getActive();
  libro.setSpreadsheetTimeZone(CONFIG.ZONA_HORARIA);

  Object.keys(TABLAS).forEach(function (tabla) {
    var columnas = Db.columnas(tabla);
    var hoja = libro.getSheetByName(tabla) || libro.insertSheet(tabla);
    // Texto plano en todas las celdas: Sheets no convierte fechas ni horas.
    hoja.getRange(1, 1, hoja.getMaxRows(), Math.max(columnas.length, hoja.getMaxColumns())).setNumberFormat('@');
    var existentes = hoja.getLastColumn() > 0 ? hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0] : [];
    var faltantes = columnas.filter(function (c) {
      return existentes.indexOf(c) === -1;
    });
    if (faltantes.length) {
      hoja.getRange(1, existentes.length + 1, 1, faltantes.length).setValues([faltantes]);
    }
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, hoja.getLastColumn()).setFontWeight('bold').setBackground('#1b1b1b').setFontColor('#f5efe6');
  });

  var hojaInicial = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (hojaInicial && hojaInicial.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(hojaInicial);

  Db.reiniciar();
  cargarServiciosIniciales();
  SpreadsheetApp.flush();
  Logger.log('Listo: pestañas creadas y servicios cargados.');
}

/** Carga Corte, Barba y Cejas si el catálogo está vacío (RN-002). */
function cargarServiciosIniciales() {
  if (Db.todos('Servicios').length) return;
  SERVICIOS_INICIALES.forEach(function (s, i) {
    Db.insertar('Servicios', {
      nombre: s.nombre,
      descripcion: s.descripcion,
      duracion_min: s.duracion_min,
      precio: null,
      activo: true,
      orden: i + 1,
    });
  });
}
