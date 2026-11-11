/**
 * Página de TUNERO CLASSIC BARBER: navegación por rutas con # y vistas.
 *
 *   #/            Inicio: servicios y peluqueros
 *   #/reservar    Reserva en 4 pasos
 *   #/mi-cita     Consultar, cancelar o reprogramar con celular + código
 *   #/privacidad  Política de tratamiento de datos
 */
(function () {
  'use strict';

  var contenido = document.getElementById('contenido');
  var CLAVE_ULTIMA_CITA = 'tunero-ultima-cita';

  // ---------- utilidades ----------

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pesos(valor) {
    return valor == null ? '' : '$' + Number(valor).toLocaleString('es-CO');
  }

  function minutos(n) {
    return n + ' min';
  }

  function pintar(html) {
    contenido.innerHTML = html;
  }

  function cargando(texto) {
    return '<p class="cargando" role="status"><span class="girar" aria-hidden="true"></span>' + esc(texto || 'Cargando…') + '</p>';
  }

  function alerta(tipo, texto) {
    return '<div class="alerta alerta--' + tipo + '" role="' + (tipo === 'error' ? 'alert' : 'status') + '">' + esc(texto) + '</div>';
  }

  function enfocar(selector) {
    var el = contenido.querySelector(selector);
    if (el) el.focus();
  }

  function guardarUltimaCita(cita, celular) {
    try { sessionStorage.setItem(CLAVE_ULTIMA_CITA, JSON.stringify({ cita: cita, celular: celular })); } catch (e) { /* sin almacenamiento */ }
  }

  function leerUltimaCita() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_ULTIMA_CITA) || 'null'); } catch (e) { return null; }
  }

  var datosInicio = null;
  function inicio() {
    if (datosInicio) return Promise.resolve(datosInicio);
    return Api.llamar('inicio').then(function (d) { datosInicio = d; return d; });
  }

  function resumenCita(cita) {
    return (
      '<dl class="resumen">' +
      '<div><dt>Servicios</dt><dd>' + esc(cita.servicios.map(function (s) { return s.nombre; }).join(' + ')) + '</dd></div>' +
      '<div><dt>Duración</dt><dd>' + minutos(cita.duracionMin) + '</dd></div>' +
      '<div><dt>Peluquero</dt><dd>' + esc(cita.peluquero ? cita.peluquero.nombre : '') + '</dd></div>' +
      '<div><dt>Fecha</dt><dd>' + esc(cita.fechaLegible) + '</dd></div>' +
      '<div><dt>Hora</dt><dd>' + esc(cita.horaTexto) + ' a ' + esc(cita.horaFinTexto) + '</dd></div>' +
      '</dl>'
    );
  }

  // ---------- inicio ----------

  function vistaInicio() {
    pintar(cargando());
    inicio().then(function (d) {
      pintar(
        '<section class="portada">' +
        '<p class="portada__sobre">Cali · Barbería clásica</p>' +
        '<h1>Tu turno, sin esperas</h1>' +
        '<p class="portada__texto">Elige tus servicios, tu peluquero y la hora que te sirva. Reservamos turnos para mañana.</p>' +
        '<a class="boton boton--grande" href="#/reservar">Reservar turno</a>' +
        '</section>' +
        '<section aria-labelledby="t-servicios"><h2 id="t-servicios">Servicios</h2><ul class="tarjetas">' +
        d.servicios.map(function (s) {
          return '<li class="tarjeta"><h3>' + esc(s.nombre) + '</h3><p>' + esc(s.descripcion) + '</p>' +
            '<p class="tarjeta__dato"><span>' + minutos(s.duracionMin) + '</span>' + (s.precio != null ? '<span>' + pesos(s.precio) + '</span>' : '') + '</p></li>';
        }).join('') +
        '</ul><p class="nota">Puedes combinar servicios: la duración de tu cita es la suma de los que elijas.</p></section>' +
        (d.peluqueros.length
          ? '<section aria-labelledby="t-peluqueros"><h2 id="t-peluqueros">Peluqueros</h2><ul class="chips">' +
            d.peluqueros.map(function (p) { return '<li>' + esc(p.nombre) + '</li>'; }).join('') + '</ul></section>'
          : '')
      );
    }).catch(mostrarError);
  }

  // ---------- reservar ----------

  var reserva = null;

  function vistaReservar() {
    reserva = { servicioIds: [], peluquero: null, horario: null, disponibilidad: null };
    pintar(cargando());
    inicio().then(function () { pasoServicios(); }).catch(mostrarError);
  }

  function pasos(actual) {
    var nombres = ['Servicios', 'Peluquero', 'Horario', 'Tus datos'];
    return '<ol class="pasos" aria-label="Pasos de la reserva">' + nombres.map(function (n, i) {
      var estado = i + 1 < actual ? 'hecho' : i + 1 === actual ? 'actual' : '';
      return '<li class="pasos__item ' + estado + '"' + (estado === 'actual' ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + n + '</li>';
    }).join('') + '</ol>';
  }

  function serviciosElegidos() {
    return datosInicio.servicios.filter(function (s) { return reserva.servicioIds.indexOf(s.id) !== -1; });
  }

  function duracionElegida() {
    return serviciosElegidos().reduce(function (t, s) { return t + s.duracionMin; }, 0);
  }

  function pasoServicios() {
    pintar(
      pasos(1) +
      '<form id="f-servicios" class="panel">' +
      '<fieldset><legend><h1>¿Qué te vas a hacer?</h1></legend><p class="ayuda">Puedes elegir uno o varios.</p>' +
      '<div class="opciones">' +
      datosInicio.servicios.map(function (s) {
        return '<label class="opcion"><input type="checkbox" name="servicio" value="' + s.id + '"' +
          (reserva.servicioIds.indexOf(s.id) !== -1 ? ' checked' : '') + '>' +
          '<span class="opcion__cuerpo"><strong>' + esc(s.nombre) + '</strong><small>' + minutos(s.duracionMin) +
          (s.precio != null ? ' · ' + pesos(s.precio) : '') + '</small></span></label>';
      }).join('') +
      '</div></fieldset>' +
      '<p class="total" id="total" aria-live="polite"></p>' +
      '<div id="msg"></div>' +
      '<div class="acciones"><button class="boton" type="submit">Continuar</button></div>' +
      '</form>'
    );
    var form = document.getElementById('f-servicios');
    var actualizar = function () {
      reserva.servicioIds = Array.prototype.filter.call(form.servicio, function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
      var d = duracionElegida();
      document.getElementById('total').innerHTML = d ? 'Duración total: <strong>' + minutos(d) + '</strong>' : 'Elige al menos un servicio.';
    };
    form.addEventListener('change', actualizar);
    actualizar();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!reserva.servicioIds.length) {
        document.getElementById('msg').innerHTML = alerta('error', 'Elige al menos un servicio para continuar.');
        return;
      }
      pasoPeluquero();
    });
  }

  function pasoPeluquero() {
    pintar(pasos(2) + cargando('Buscando peluqueros…'));
    Api.llamar('peluqueros', { servicioIds: reserva.servicioIds }).then(function (lista) {
      var disponibles = lista.filter(function (p) { return p.recibeReservas; });
      pintar(
        pasos(2) +
        '<form id="f-peluquero" class="panel">' +
        '<fieldset><legend><h1>¿Con quién?</h1></legend>' +
        '<p class="ayuda">Duración de tu cita: ' + minutos(duracionElegida()) + '.</p>' +
        (disponibles.length
          ? '<div class="opciones">' + disponibles.map(function (p) {
              return '<label class="opcion"><input type="radio" name="peluquero" value="' + p.id + '" required' +
                (reserva.peluquero && reserva.peluquero.id === p.id ? ' checked' : '') + '>' +
                '<span class="opcion__cuerpo"><strong>' + esc(p.nombre) + '</strong></span></label>';
            }).join('') + '</div>'
          : alerta('info', 'Ningún peluquero está recibiendo reservas para estos servicios en este momento.')) +
        '</fieldset>' +
        '<div class="acciones"><button class="boton boton--secundario" type="button" id="atras">Atrás</button>' +
        (disponibles.length ? '<button class="boton" type="submit">Ver horarios</button>' : '') + '</div>' +
        '</form>'
      );
      document.getElementById('atras').addEventListener('click', pasoServicios);
      document.getElementById('f-peluquero').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var id = Number(new FormData(ev.target).get('peluquero'));
        reserva.peluquero = disponibles.filter(function (p) { return p.id === id; })[0];
        pasoHorario();
      });
    }).catch(mostrarError);
  }

  function botonesHorario(horarios, seleccionado) {
    return '<div class="horarios" role="radiogroup" aria-label="Horarios disponibles">' + horarios.map(function (h) {
      return '<label class="horario"><input type="radio" name="horario" value="' + h.inicio + '" required' +
        (seleccionado === h.inicio ? ' checked' : '') + '><span>' + esc(h.texto) + '</span></label>';
    }).join('') + '</div>';
  }

  function pasoHorario(aviso) {
    pintar(pasos(3) + cargando('Buscando horarios libres…'));
    Api.llamar('disponibilidad', { peluqueroId: reserva.peluquero.id, servicioIds: reserva.servicioIds }).then(function (d) {
      reserva.disponibilidad = d;
      pintar(
        pasos(3) +
        '<form id="f-horario" class="panel">' +
        '<fieldset><legend><h1>¿A qué hora?</h1></legend>' +
        '<p class="ayuda">Horarios de <strong>' + esc(reserva.peluquero.nombre) + '</strong> para <strong>' + esc(d.fechaLegible) +
        '</strong> (' + minutos(d.duracionMin) + ').</p>' +
        (aviso ? alerta('error', aviso) : '') +
        (d.horarios.length ? botonesHorario(d.horarios, reserva.horario) : alerta('info', d.mensaje || 'No hay horarios disponibles.')) +
        '</fieldset>' +
        '<div class="acciones"><button class="boton boton--secundario" type="button" id="atras">Atrás</button>' +
        (d.horarios.length ? '<button class="boton" type="submit">Continuar</button>' : '') + '</div>' +
        '</form>'
      );
      document.getElementById('atras').addEventListener('click', pasoPeluquero);
      document.getElementById('f-horario').addEventListener('submit', function (ev) {
        ev.preventDefault();
        reserva.horario = Number(new FormData(ev.target).get('horario'));
        pasoDatos();
      });
    }).catch(mostrarError);
  }

  function pasoDatos() {
    var d = reserva.disponibilidad;
    var h = d.horarios.filter(function (x) { return x.inicio === reserva.horario; })[0];
    var previo = reserva.cliente || {};
    pintar(
      pasos(4) +
      '<form id="f-datos" class="panel" novalidate>' +
      '<h1>Tus datos</h1>' +
      '<dl class="resumen">' +
      '<div><dt>Servicios</dt><dd>' + esc(serviciosElegidos().map(function (s) { return s.nombre; }).join(' + ')) + '</dd></div>' +
      '<div><dt>Duración</dt><dd>' + minutos(d.duracionMin) + '</dd></div>' +
      '<div><dt>Peluquero</dt><dd>' + esc(reserva.peluquero.nombre) + '</dd></div>' +
      '<div><dt>Cuándo</dt><dd>' + esc(d.fechaLegible) + ', ' + esc(h.texto) + '</dd></div>' +
      '</dl>' +
      '<div class="campo"><label for="nombre">Nombre</label><input id="nombre" name="nombre" autocomplete="name" required maxlength="80" value="' + esc(previo.nombre) + '"></div>' +
      '<div class="campo"><label for="celular">Celular</label><input id="celular" name="celular" type="tel" inputmode="tel" autocomplete="tel" required placeholder="300 123 4567" value="' + esc(previo.celular) + '"></div>' +
      '<div class="campo"><label for="correo">Correo electrónico</label><input id="correo" name="correo" type="email" autocomplete="email" required value="' + esc(previo.correo) + '">' +
      '<small class="ayuda">Te enviaremos la confirmación y tu código de cita.</small></div>' +
      '<div class="campo"><label for="notas">Notas para el peluquero <span class="opcional">(opcional)</span></label><textarea id="notas" name="notas" maxlength="300" rows="2"></textarea></div>' +
      '<label class="consentimiento"><input type="checkbox" name="acepto" required> <span>Autorizo el tratamiento de mis datos personales según la <a href="#/privacidad" target="_blank">política de tratamiento de datos</a>.</span></label>' +
      '<div id="msg"></div>' +
      '<div class="acciones"><button class="boton boton--secundario" type="button" id="atras">Atrás</button>' +
      '<button class="boton" type="submit">Confirmar reserva</button></div>' +
      '</form>'
    );
    document.getElementById('atras').addEventListener('click', function () { pasoHorario(); });
    document.getElementById('f-datos').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var form = ev.target;
      var msg = document.getElementById('msg');
      var datos = new FormData(form);
      reserva.cliente = { nombre: datos.get('nombre'), celular: datos.get('celular'), correo: datos.get('correo') };
      var faltante = ['nombre', 'celular', 'correo'].filter(function (c) { return !String(datos.get(c) || '').trim(); })[0];
      if (faltante) {
        msg.innerHTML = alerta('error', 'Completa tu ' + (faltante === 'correo' ? 'correo electrónico' : faltante) + '.');
        form[faltante].focus();
        return;
      }
      if (!datos.get('acepto')) {
        msg.innerHTML = alerta('error', 'Para reservar necesitamos tu autorización de tratamiento de datos.');
        return;
      }
      var boton = form.querySelector('[type=submit]');
      boton.disabled = true;
      boton.textContent = 'Confirmando…';
      Api.llamar('reservar', {
        peluqueroId: reserva.peluquero.id,
        servicioIds: reserva.servicioIds,
        fecha: d.fecha,
        inicio: reserva.horario,
        cliente: reserva.cliente,
        notas: datos.get('notas'),
      }).then(function (cita) {
        guardarUltimaCita(cita, reserva.cliente.celular);
        location.hash = '#/confirmacion';
      }).catch(function (e) {
        boton.disabled = false;
        boton.textContent = 'Confirmar reserva';
        if (e.codigo === 'HORARIO_NO_DISPONIBLE' || e.codigo === 'AGENDA_CERRADA') {
          reserva.horario = null;
          pasoHorario('Alguien acaba de tomar ese horario o ya no está disponible. Elige otro.');
          return;
        }
        msg.innerHTML = alerta('error', e.message);
      });
    });
    enfocar('#nombre');
  }

  function vistaConfirmacion() {
    var guardada = leerUltimaCita();
    if (!guardada) { location.hash = '#/mi-cita'; return; }
    var cita = guardada.cita;
    pintar(
      '<section class="panel confirmacion">' +
      '<p class="sello" aria-hidden="true">✓</p>' +
      '<h1>¡Tu cita está confirmada!</h1>' +
      '<p>Te enviamos el resumen a tu correo.</p>' +
      resumenCita(cita) +
      '<div class="codigo"><span>Tu código de cita</span><strong>' + esc(cita.codigo) + '</strong>' +
      '<small>Guárdalo: con él y tu celular puedes consultar, cancelar o reprogramar.</small></div>' +
      '<div class="acciones"><a class="boton boton--secundario" href="#/">Volver al inicio</a>' +
      '<a class="boton" href="#/mi-cita">Ver mi cita</a></div>' +
      '</section>'
    );
    enfocar('h1');
  }

  // ---------- mi cita ----------

  var miCita = null; // { celular, codigo, cita }

  function vistaMiCita() {
    var guardada = leerUltimaCita();
    var celular = miCita ? miCita.celular : guardada ? guardada.celular : '';
    var codigo = miCita ? miCita.codigo : guardada ? guardada.cita.codigo : '';
    pintar(
      '<form id="f-buscar" class="panel" novalidate>' +
      '<h1>Mi cita</h1>' +
      '<p class="ayuda">Escribe el celular con el que reservaste y el código que te enviamos por correo.</p>' +
      '<div class="campo"><label for="celular">Celular</label><input id="celular" name="celular" type="tel" inputmode="tel" autocomplete="tel" required value="' + esc(celular) + '"></div>' +
      '<div class="campo"><label for="codigo">Código de cita</label><input id="codigo" name="codigo" required autocapitalize="characters" autocomplete="off" maxlength="8" value="' + esc(codigo) + '"></div>' +
      '<div id="msg"></div>' +
      '<div class="acciones"><button class="boton" type="submit">Buscar</button></div>' +
      '</form><div id="detalle"></div>'
    );
    document.getElementById('f-buscar').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var datos = new FormData(ev.target);
      var cel = String(datos.get('celular') || '').trim();
      var cod = String(datos.get('codigo') || '').trim();
      var msg = document.getElementById('msg');
      if (!cel || !cod) { msg.innerHTML = alerta('error', 'Escribe tu celular y tu código.'); return; }
      msg.innerHTML = cargando('Buscando…');
      Api.llamar('cita.consultar', { celular: cel, codigo: cod }).then(function (cita) {
        msg.innerHTML = '';
        miCita = { celular: cel, codigo: cod, cita: cita };
        pintarDetalle();
      }).catch(function (e) {
        msg.innerHTML = alerta('error', e.message);
        document.getElementById('detalle').innerHTML = '';
      });
    });
    if (celular && codigo) document.getElementById('f-buscar').requestSubmit();
  }

  var ESTADOS = {
    confirmada: 'Confirmada', en_atencion: 'En atención', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
  };

  function pintarDetalle(aviso) {
    var cita = miCita.cita;
    var detalle = document.getElementById('detalle');
    detalle.innerHTML =
      '<section class="panel" aria-labelledby="t-detalle">' +
      '<h2 id="t-detalle">Cita de ' + esc(cita.clienteNombre) + ' <span class="estado estado--' + esc(cita.estado) + '">' + esc(ESTADOS[cita.estado] || cita.estado) + '</span></h2>' +
      (aviso ? alerta('ok', aviso) : '') +
      resumenCita(cita) +
      (cita.puedeModificar
        ? '<div class="acciones"><button class="boton boton--secundario" id="reprogramar">Cambiar horario</button>' +
          '<button class="boton boton--peligro" id="cancelar">Cancelar cita</button></div>'
        : cita.estado === 'confirmada'
          ? '<p class="nota">Faltan menos de ' + cita.limiteHoras + ' horas para tu cita. Si necesitas cambiarla, comunícate con la barbería.</p>'
          : '') +
      '<div id="zona-accion"></div></section>';
    if (!cita.puedeModificar) return;
    document.getElementById('cancelar').addEventListener('click', confirmarCancelacion);
    document.getElementById('reprogramar').addEventListener('click', mostrarReprogramacion);
  }

  function confirmarCancelacion() {
    var zona = document.getElementById('zona-accion');
    zona.innerHTML =
      '<div class="confirmar" role="alertdialog" aria-labelledby="t-conf">' +
      '<p id="t-conf"><strong>¿Seguro que quieres cancelar tu cita?</strong> El horario quedará libre para otra persona.</p>' +
      '<div class="acciones"><button class="boton boton--secundario" id="no">No, mantenerla</button>' +
      '<button class="boton boton--peligro" id="si">Sí, cancelar</button></div><div id="msg-accion"></div></div>';
    document.getElementById('no').addEventListener('click', function () { zona.innerHTML = ''; });
    var si = document.getElementById('si');
    si.focus();
    si.addEventListener('click', function () {
      si.disabled = true;
      Api.llamar('cita.cancelar', { celular: miCita.celular, codigo: miCita.codigo }).then(function (cita) {
        miCita.cita = cita;
        pintarDetalle('Tu cita fue cancelada. Te enviamos la confirmación por correo.');
      }).catch(function (e) {
        si.disabled = false;
        document.getElementById('msg-accion').innerHTML = alerta('error', e.message);
      });
    });
  }

  function mostrarReprogramacion() {
    var zona = document.getElementById('zona-accion');
    zona.innerHTML = cargando('Buscando horarios…');
    Api.llamar('cita.horarios', { celular: miCita.celular, codigo: miCita.codigo }).then(function (d) {
      var actuales = d.horarios.filter(function (h) { return !(miCita.cita.fecha === d.fecha && h.hora === miCita.cita.hora); });
      zona.innerHTML =
        '<form id="f-reprogramar" class="subpanel"><fieldset><legend><h3>Elige el nuevo horario</h3></legend>' +
        '<p class="ayuda">' + esc(d.fechaLegible) + ' con ' + esc(miCita.cita.peluquero.nombre) + '.</p>' +
        (actuales.length ? botonesHorario(actuales, null) : alerta('info', d.mensaje || 'No hay otros horarios disponibles.')) +
        '</fieldset><div id="msg-accion"></div>' +
        '<div class="acciones"><button class="boton boton--secundario" type="button" id="volver">Volver</button>' +
        (actuales.length ? '<button class="boton" type="submit">Cambiar a este horario</button>' : '') + '</div></form>';
      document.getElementById('volver').addEventListener('click', function () { zona.innerHTML = ''; });
      document.getElementById('f-reprogramar').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var inicio = Number(new FormData(ev.target).get('horario'));
        var boton = ev.target.querySelector('[type=submit]');
        boton.disabled = true;
        Api.llamar('cita.reprogramar', { celular: miCita.celular, codigo: miCita.codigo, inicio: inicio }).then(function (cita) {
          miCita.cita = cita;
          pintarDetalle('Listo, tu cita cambió de horario. Te enviamos la confirmación por correo.');
        }).catch(function (e) {
          boton.disabled = false;
          document.getElementById('msg-accion').innerHTML = alerta('error', e.message);
        });
      });
    }).catch(function (e) { zona.innerHTML = alerta('error', e.message); });
  }

  // ---------- privacidad ----------

  function vistaPrivacidad() {
    pintar(
      '<article class="panel texto-legal"><h1>Política de tratamiento de datos personales</h1>' +
      '<p>En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, TUNERO CLASSIC BARBER informa cómo trata los datos personales de sus clientes.</p>' +
      '<h2>Datos que recogemos</h2><p>Nombre, número de celular, correo electrónico y los datos de tus citas (servicios, fecha, hora y peluquero).</p>' +
      '<h2>Para qué los usamos</h2><ul><li>Agendar, confirmar, modificar o cancelar tus citas.</li><li>Enviarte avisos sobre tus citas.</li><li>Atenderte el día de tu cita.</li></ul>' +
      '<p>No vendemos ni compartimos tus datos con terceros para fines comerciales.</p>' +
      '<h2>Quién accede</h2><p>Solo el personal de la barbería, y cada peluquero ve únicamente los datos de las citas que atiende.</p>' +
      '<h2>Tus derechos</h2><p>Puedes conocer, actualizar, rectificar y solicitar la supresión de tus datos, o revocar esta autorización, escribiendo a la barbería o en persona en el local.</p>' +
      '</article>'
    );
  }

  // ---------- errores y rutas ----------

  function mostrarError(e) {
    pintar('<section class="panel">' + alerta('error', (e && e.message) || 'Ocurrió un error.') +
      '<div class="acciones"><button class="boton" onclick="location.reload()">Intentar de nuevo</button></div></section>');
  }

  var RUTAS = {
    '': vistaInicio,
    'reservar': vistaReservar,
    'confirmacion': vistaConfirmacion,
    'mi-cita': vistaMiCita,
    'privacidad': vistaPrivacidad,
  };

  /** Ruta actual: '#/turno/5?x=1' → { nombre: 'turno', partes: ['5'], params: { x: '1' } }. */
  function rutaActual() {
    var texto = location.hash.replace(/^#\/?/, '');
    var corte = texto.indexOf('?');
    var camino = (corte === -1 ? texto : texto.slice(0, corte)).split('/');
    var params = {};
    new URLSearchParams(corte === -1 ? '' : texto.slice(corte + 1)).forEach(function (v, k) { params[k] = v; });
    return { nombre: camino[0], partes: camino.slice(1), params: params };
  }

  function navegar() {
    var ruta = rutaActual();
    var vista = RUTAS[ruta.nombre] || vistaInicio;
    if (ruta.nombre !== 'mi-cita') miCita = null;
    document.querySelectorAll('.menu a').forEach(function (a) {
      if (a.getAttribute('href') === '#/' + ruta.nombre) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    vista(ruta);
    window.scrollTo(0, 0);
  }

  // Utilidades compartidas con el panel del peluquero (panel.js).
  window.Tunero = {
    esc: esc,
    pesos: pesos,
    minutos: minutos,
    pintar: pintar,
    cargando: cargando,
    alerta: alerta,
    enfocar: enfocar,
    botonesHorario: botonesHorario,
    mostrarError: mostrarError,
    rutas: RUTAS,
    navegar: navegar,
  };

  if (window.TuneroDemo && window.TuneroDemo.activo) document.getElementById('aviso-demo').hidden = false;
  window.addEventListener('hashchange', navegar);
  window.addEventListener('DOMContentLoaded', navegar);
})();
