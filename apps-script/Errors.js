/**
 * Error de negocio con un mensaje apto para mostrar al usuario.
 * `codigo` permite a la página web reaccionar a casos concretos.
 */
function AppError(mensaje, codigo, datos) {
  var error = new Error(mensaje);
  error.name = 'AppError';
  error.codigo = codigo || 'ERROR';
  error.datos = datos || null;
  return error;
}

function esAppError(error) {
  return Boolean(error) && error.name === 'AppError';
}
