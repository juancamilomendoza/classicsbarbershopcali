/**
 * Cliente de la API. Envía { accion, ...datos } como text/plain para evitar
 * la consulta CORS previa que Apps Script no admite.
 */
window.Api = (function () {
  'use strict';

  function ErrorApi(mensaje, codigo, datos) {
    var e = new Error(mensaje);
    e.codigo = codigo;
    e.datos = datos;
    return e;
  }

  function desenvolver(respuesta) {
    if (!respuesta || !respuesta.ok) {
      throw ErrorApi((respuesta && respuesta.error) || 'Ocurrió un error.', respuesta && respuesta.codigo, respuesta && respuesta.datos);
    }
    return respuesta.datos;
  }

  function llamar(accion, datos) {
    var peticion = Object.assign({ accion: accion }, datos || {});
    if (window.TuneroDemo && window.TuneroDemo.activo) {
      return window.TuneroDemo.listo.then(function () {
        // Pequeña espera para que el modo demostración se sienta como la API real.
        return new Promise(function (r) { setTimeout(r, 250); });
      }).then(function () {
        return desenvolver(JSON.parse(JSON.stringify(window.atender(peticion))));
      });
    }
    return fetch(window.TUNERO_CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify(peticion),
      redirect: 'follow',
    })
      .catch(function () {
        throw ErrorApi('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.', 'SIN_CONEXION');
      })
      .then(function (r) { return r.json(); })
      .then(desenvolver);
  }

  return { llamar: llamar };
})();
