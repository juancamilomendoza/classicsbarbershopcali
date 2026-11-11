/**
 * Panel del peluquero.
 *
 *   #/panel                 Iniciar sesión con Google
 *   #/agenda?fecha=&vista=  Agenda por día o por semana
 *   #/turno/<id>            Detalle, estado, cancelar o mover
 *   #/turno-nuevo           Registrar un turno recibido por otro canal
 *   #/mis-servicios         Servicios que presta (y catálogo, con permiso)
 *   #/avisos                Notificaciones
 *   #/historial             Registro de cambios
 */
(function () {
  'use strict';

  var T = window.Tunero;
  var esc = T.esc;
  var CLAVE_SESION = 'tunero-sesion';
  var yo = null; // { peluquero, noLeidas }

  // ---------- sesión ----------

  function token() {
    try { return localStorage.getItem(CLAVE_SESION); } catch (e) { return null; }
  }

  function guardarToken(valor) {
    try {
      if (valor) localStorage.setItem(CLAVE_SESION, valor);
      else localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* sin almacenamiento */ }
  }

  function salir() {
    guardarToken(null);
    yo = null;
    location.hash = '#/panel';
  }

  /** Llama a la API con el token; si la sesión venció, vuelve al inicio de sesión. */
  function llamar(accion, datos) {
    return Api.llamar(accion, Object.assign({ token: token() }, datos || {})).catch(function (e) {
      if (e.codigo === 'SESION_INVALIDA') {
        guardarToken(null);
        yo = null;
        location.hash = '#/panel?vencida=1';
      }
      throw e;
    });
  }

  function cargarYo() {
    return llamar('yo').then(function (d) { yo = d; return d; });
  }

  /** Envuelve una vista del panel: exige sesión y pinta la navegación. */
  function protegida(vista) {
    return function (ruta) {
      if (!token()) { location.hash = '#/panel'; return; }
      T.pintar(T.cargando());
      cargarYo().then(function () { vista(ruta); }).catch(function (e) {
        if (e.codigo !== 'SESION_INVALIDA') T.mostrarError(e);
      });
    };
  }

  function navegacion(actual) {
    var enlaces = [
      ['agenda', 'Agenda'],
      ['turno-nuevo', 'Nuevo turno'],
      ['mis-servicios', 'Servicios'],
      ['avisos', 'Avisos' + (yo && yo.noLeidas ? ' <span class="contador">' + yo.noLeidas + '</span>' : '')],
      ['historial', 'Historial'],
    ];
    return (
      '<div class="panel-cabecera"><p>Hola, <strong>' + esc(yo.peluquero.nombre) + '</strong></p>' +
      '<button class="enlace" id="salir" type="button">Cerrar sesión</button></div>' +
      '<nav class="pestanas" aria-label="Panel del peluquero">' +
      enlaces.map(function (e) {
        return '<a href="#/' + e[0] + '"' + (e[0] === actual ? ' aria-current="page"' : '') + '>' + e[1] + '</a>';
      }).join('') + '</nav>'
    );
  }

  function pintarPanel(actual, html) {
    T.pintar(navegacion(actual) + html);
    document.getElementById('salir').addEventListener('click', salir);
  }

  // ---------- inicio de sesión ----------

  function vistaIngreso(ruta) {
    if (token()) { location.hash = '#/agenda'; return; }
    var aviso = ruta.params.vencida ? T.alerta('info', 'Tu sesión expiró. Vuelve a iniciar sesión.') : '';
    T.pintar(
      '<section class="panel ingreso"><h1>Acceso peluqueros</h1>' + aviso +
      '<p class="ayuda">Entra con la cuenta de Google que la barbería registró para ti.</p>' +
      '<div id="boton-google" class="boton-google">' + T.cargando() + '</div><div id="msg"></div></section>'
    );
    var msg = document.getElementById('msg');
    var entrar = function (promesa) {
      msg.innerHTML = T.cargando('Verificando…');
      promesa.then(function (r) {
        guardarToken(r.token);
        location.hash = '#/agenda';
      }).catch(function (e) { msg.innerHTML = T.alerta('error', e.message); });
    };

    if (window.TuneroDemo && window.TuneroDemo.activo) {
      window.TuneroDemo.peluquerosDemo().then(function (lista) {
        document.getElementById('boton-google').innerHTML =
          '<p class="nota">En modo demostración se entra sin Google:</p><div class="acciones acciones--izq">' +
          lista.map(function (p) { return '<button class="boton boton--secundario" data-id="' + p.id + '">Entrar como ' + esc(p.nombre) + '</button>'; }).join('') +
          '</div>';
        document.querySelectorAll('[data-id]').forEach(function (b) {
          b.addEventListener('click', function () { entrar(window.TuneroDemo.iniciarSesion(Number(b.dataset.id))); });
        });
      });
      return;
    }

    Api.llamar('sesion.config').then(function (c) {
      if (!c.googleClientId) throw new Error('Falta configurar el inicio de sesión con Google (ver README).');
      return cargarGoogle().then(function () {
        google.accounts.id.initialize({
          client_id: c.googleClientId,
          callback: function (respuesta) { entrar(Api.llamar('sesion.google', { credencial: respuesta.credential })); },
        });
        var caja = document.getElementById('boton-google');
        caja.innerHTML = '';
        google.accounts.id.renderButton(caja, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es' });
      });
    }).catch(function (e) {
      document.getElementById('boton-google').innerHTML = '';
      msg.innerHTML = T.alerta('error', e.message);
    });
  }

  var googleCargado = null;
  function cargarGoogle() {
    if (!googleCargado) {
      googleCargado = new Promise(function (resolver, rechazar) {
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.onload = resolver;
        s.onerror = function () { rechazar(new Error('No se pudo cargar el inicio de sesión de Google.')); };
        document.head.appendChild(s);
      });
    }
    return googleCargado;
  }

  // ---------- agenda ----------

  function sumarDias(fecha, dias) {
    var d = new Date(fecha + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function tarjetaTurno(t) {
    return (
      '<li><a class="turno turno--' + esc(t.estado) + '" href="#/turno/' + t.id + '">' +
      '<span class="turno__hora">' + esc(t.horaTexto) + '</span>' +
      '<span class="turno__cuerpo"><strong>' + esc(t.cliente.nombre) + '</strong>' +
      '<small>' + esc(t.servicios.map(function (s) { return s.nombre; }).join(' + ')) + ' · ' + t.duracionMin + ' min</small>' +
      (t.fueraDeDisponibilidad ? '<small class="advertencia">⚠ Queda por fuera de tu disponibilidad: cancélalo o muévelo</small>' : '') +
      '</span><span class="estado estado--' + esc(t.estado) + '">' + esc(t.estadoTexto) + '</span></a></li>'
    );
  }

  function vistaAgenda(ruta) {
    var vista = ruta.params.vista === 'semana' ? 'semana' : 'dia';
    pintarPanel('agenda', T.cargando('Cargando agenda…'));
    llamar('agenda', { fecha: ruta.params.fecha, vista: vista }).then(function (a) {
      var paso = vista === 'semana' ? 7 : 1;
      var enlace = function (fecha, v) { return '#/agenda?fecha=' + fecha + '&vista=' + (v || vista); };
      var dias = a.dias.map(function (d) {
        var activos = d.turnos.filter(function (t) { return t.estado !== 'cancelada'; }).length;
        return (
          '<section class="dia' + (d.fecha === a.hoy ? ' dia--hoy' : '') + '"><h2>' + esc(d.fechaLegible) +
          (d.fecha === a.hoy ? ' <span class="etiqueta">Hoy</span>' : '') + '</h2>' +
          '<p class="ayuda">' + (d.abierto ? 'Jornada: ' + esc(d.jornada) + ' · ' + activos + ' turno' + (activos === 1 ? '' : 's') : esc(d.motivo)) + '</p>' +
          (d.turnos.length ? '<ul class="turnos">' + d.turnos.map(tarjetaTurno).join('') + '</ul>' : (d.abierto ? '<p class="vacio">Sin turnos.</p>' : '')) +
          '</section>'
        );
      }).join('');
      pintarPanel('agenda',
        '<div class="agenda-barra">' +
        '<div class="grupo"><a class="boton boton--secundario boton--chico" href="' + enlace(sumarDias(a.desde, -paso)) + '" aria-label="Anterior">‹</a>' +
        '<a class="boton boton--secundario boton--chico" href="' + enlace(a.hoy) + '">Hoy</a>' +
        '<a class="boton boton--secundario boton--chico" href="' + enlace(sumarDias(a.desde, paso)) + '" aria-label="Siguiente">›</a></div>' +
        '<div class="grupo" role="group" aria-label="Vista"><a class="boton boton--chico ' + (vista === 'dia' ? '' : 'boton--secundario') + '" href="' + enlace(a.desde, 'dia') + '">Día</a>' +
        '<a class="boton boton--chico ' + (vista === 'semana' ? '' : 'boton--secundario') + '" href="' + enlace(a.desde, 'semana') + '">Semana</a></div>' +
        '</div>' + dias +
        '<div class="acciones"><a class="boton" href="#/turno-nuevo">+ Registrar turno</a></div>'
      );
    }).catch(function (e) { pintarPanel('agenda', T.alerta('error', e.message)); });
  }

  // ---------- detalle del turno ----------

  var NOMBRES_ACCION = { en_atencion: 'Empezar atención', completada: 'Marcar completado', no_asistio: 'No asistió', cancelada: 'Cancelar turno' };

  function enlaceWhatsApp(celular, texto) {
    var numero = String(celular).replace(/\D/g, '');
    if (numero.length === 10) numero = '57' + numero; // celulares de Colombia
    return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);
  }

  function vistaTurno(ruta) {
    var id = Number(ruta.partes[0]);
    pintarPanel('agenda', T.cargando());
    llamar('turno', { id: id }).then(function (t) { pintarTurno(t); }).catch(function (e) {
      pintarPanel('agenda', T.alerta('error', e.message) + '<a href="#/agenda">Volver a la agenda</a>');
    });
  }

  function pintarTurno(t, aviso) {
    var saludo = 'Hola ' + t.cliente.nombre + ', te escribimos de TUNERO CLASSIC BARBER sobre tu cita del ' + t.fechaLegible + ' a las ' + t.horaTexto + '.';
    pintarPanel('agenda',
      '<p><a href="#/agenda?fecha=' + t.fecha + '">‹ Volver a la agenda</a></p>' +
      '<section class="panel"><h1>' + esc(t.cliente.nombre) + ' <span class="estado estado--' + esc(t.estado) + '">' + esc(t.estadoTexto) + '</span></h1>' +
      (aviso ? T.alerta('ok', aviso) : '') +
      (t.fueraDeDisponibilidad ? T.alerta('error', 'Este turno queda por fuera de tu disponibilidad actual (ausencia, bloqueo o cambio de horario). Cancélalo o muévelo.') : '') +
      '<dl class="resumen">' +
      '<div><dt>Cuándo</dt><dd>' + esc(t.fechaLegible) + ', ' + esc(t.horaTexto) + ' a ' + esc(t.horaFinTexto) + '</dd></div>' +
      '<div><dt>Servicios</dt><dd>' + esc(t.servicios.map(function (s) { return s.nombre; }).join(' + ')) + ' (' + t.duracionMin + ' min)</dd></div>' +
      '<div><dt>Celular</dt><dd><a href="tel:' + esc(t.cliente.celular) + '">' + esc(t.cliente.celular) + '</a> · <a href="' + esc(enlaceWhatsApp(t.cliente.celular, saludo)) + '" target="_blank" rel="noopener">WhatsApp</a></dd></div>' +
      (t.cliente.correo ? '<div><dt>Correo</dt><dd>' + esc(t.cliente.correo) + '</dd></div>' : '') +
      '<div><dt>Origen</dt><dd>' + (t.origen === 'manual' ? 'Registrado por la barbería' : 'Reserva en la web') + '</dd></div>' +
      (t.notas ? '<div><dt>Notas</dt><dd>' + esc(t.notas) + '</dd></div>' : '') +
      (t.motivoCancelacion ? '<div><dt>Motivo de cancelación</dt><dd>' + esc(t.motivoCancelacion) + '</dd></div>' : '') +
      '</dl>' +
      (t.siguientes.length
        ? '<div class="acciones acciones--izq">' + t.siguientes.filter(function (e) { return e !== 'cancelada'; }).map(function (e) {
            return '<button class="boton boton--secundario" data-estado="' + e + '">' + NOMBRES_ACCION[e] + '</button>';
          }).join('') +
          (t.estado === 'confirmada' ? '<button class="boton boton--secundario" id="mover">Mover</button>' : '') +
          (t.siguientes.indexOf('cancelada') !== -1 ? '<button class="boton boton--peligro" id="cancelar">Cancelar turno</button>' : '') +
          '</div>'
        : '') +
      '<div id="zona"></div></section>'
    );
    var zona = document.getElementById('zona');
    document.querySelectorAll('[data-estado]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        llamar('turno.estado', { id: t.id, estado: b.dataset.estado }).then(function (n) { pintarTurno(n, 'Estado actualizado.'); })
          .catch(function (e) { b.disabled = false; zona.innerHTML = T.alerta('error', e.message); });
      });
    });
    var cancelar = document.getElementById('cancelar');
    if (cancelar) cancelar.addEventListener('click', function () {
      zona.innerHTML =
        '<form id="f-cancelar" class="confirmar"><div class="campo"><label for="motivo">Motivo (se le envía al cliente si tiene correo)</label>' +
        '<input id="motivo" name="motivo" maxlength="200" placeholder="Ej.: incapacidad, cierre del local"></div>' +
        '<div class="acciones"><button class="boton boton--secundario" type="button" id="no">Volver</button>' +
        '<button class="boton boton--peligro" type="submit">Cancelar turno</button></div><div id="msg"></div></form>';
      document.getElementById('no').addEventListener('click', function () { zona.innerHTML = ''; });
      document.getElementById('f-cancelar').addEventListener('submit', function (ev) {
        ev.preventDefault();
        llamar('turno.estado', { id: t.id, estado: 'cancelada', motivo: ev.target.motivo.value }).then(function (n) {
          pintarTurno(n, 'Turno cancelado.' + (n.cliente.correo ? ' Le enviamos un correo al cliente.' : ' El cliente no tiene correo: avísale por WhatsApp.'));
        }).catch(function (e) { document.getElementById('msg').innerHTML = T.alerta('error', e.message); });
      });
      document.getElementById('motivo').focus();
    });
    var mover = document.getElementById('mover');
    if (mover) mover.addEventListener('click', function () { formularioMover(t, zona); });
  }

  function formularioMover(t, zona) {
    zona.innerHTML =
      '<form id="f-mover" class="subpanel"><h2>Mover turno</h2>' +
      '<div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value="' + esc(t.fecha) + '"></div>' +
      '<div id="horarios"></div><div id="msg"></div>' +
      '<div class="acciones"><button class="boton boton--secundario" type="button" id="no">Volver</button>' +
      '<button class="boton" type="submit">Mover a este horario</button></div></form>';
    var form = document.getElementById('f-mover');
    var cargar = function () {
      var caja = document.getElementById('horarios');
      caja.innerHTML = T.cargando('Buscando horarios…');
      llamar('turno.horarios', { id: t.id, fecha: form.fecha.value }).then(function (d) {
        caja.innerHTML = d.horarios.length ? T.botonesHorario(d.horarios, null) : T.alerta('info', d.mensaje || 'Sin horarios.');
      }).catch(function (e) { caja.innerHTML = T.alerta('error', e.message); });
    };
    form.fecha.addEventListener('change', cargar);
    cargar();
    document.getElementById('no').addEventListener('click', function () { zona.innerHTML = ''; });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var inicio = new FormData(form).get('horario');
      if (inicio === null) { document.getElementById('msg').innerHTML = T.alerta('error', 'Elige un horario.'); return; }
      llamar('turno.mover', { id: t.id, fecha: form.fecha.value, inicio: Number(inicio) }).then(function (n) {
        pintarTurno(n, 'Turno movido.' + (n.cliente.correo ? ' Le enviamos un correo al cliente.' : ''));
      }).catch(function (e) { document.getElementById('msg').innerHTML = T.alerta('error', e.message); });
    });
  }

  // ---------- turno manual ----------

  function vistaTurnoNuevo() {
    pintarPanel('turno-nuevo', T.cargando());
    llamar('servicios').then(function (cat) {
      var propios = cat.servicios.filter(function (s) { return s.activo && s.presta; });
      var hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      pintarPanel('turno-nuevo',
        '<form id="f-manual" class="panel" novalidate><h1>Registrar turno</h1>' +
        '<p class="ayuda">Para citas recibidas por teléfono, WhatsApp o en el local. Se valida la disponibilidad igual que en la web.</p>' +
        '<fieldset><legend><h2>Servicios</h2></legend><div class="opciones">' +
        propios.map(function (s) {
          return '<label class="opcion"><input type="checkbox" name="servicio" value="' + s.id + '" data-min="' + s.duracionMin + '">' +
            '<span class="opcion__cuerpo"><strong>' + esc(s.nombre) + '</strong><small>' + s.duracionMin + ' min</small></span></label>';
        }).join('') + '</div></fieldset>' +
        '<div class="campo"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" min="' + hoy + '" value="' + hoy + '"></div>' +
        '<div id="horarios"><p class="nota">Elige servicios para ver los horarios.</p></div>' +
        '<div class="campo"><label for="nombre">Nombre del cliente</label><input id="nombre" name="nombre" maxlength="80"></div>' +
        '<div class="campo"><label for="celular">Celular</label><input id="celular" name="celular" type="tel" inputmode="tel"></div>' +
        '<div class="campo"><label for="correo">Correo <span class="opcional">(opcional, para enviarle la confirmación)</span></label><input id="correo" name="correo" type="email"></div>' +
        '<div class="campo"><label for="notas">Notas <span class="opcional">(opcional)</span></label><input id="notas" name="notas" maxlength="300"></div>' +
        '<div id="msg"></div><div class="acciones"><button class="boton" type="submit">Registrar turno</button></div></form>'
      );
      var form = document.getElementById('f-manual');
      var elegidos = function () {
        return Array.prototype.filter.call(form.querySelectorAll('[name=servicio]'), function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
      };
      var cargar = function () {
        var caja = document.getElementById('horarios');
        if (!elegidos().length) { caja.innerHTML = '<p class="nota">Elige servicios para ver los horarios.</p>'; return; }
        caja.innerHTML = T.cargando('Buscando horarios…');
        llamar('manual.horarios', { servicioIds: elegidos(), fecha: form.fecha.value }).then(function (d) {
          caja.innerHTML = '<p class="ayuda">Duración: ' + d.duracionMin + ' min.</p>' +
            (d.horarios.length ? T.botonesHorario(d.horarios, null) : T.alerta('info', d.mensaje || 'Sin horarios.'));
        }).catch(function (e) { caja.innerHTML = T.alerta('error', e.message); });
      };
      form.addEventListener('change', function (ev) { if (ev.target.name === 'servicio' || ev.target.name === 'fecha') cargar(); });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var datos = new FormData(form);
        var msg = document.getElementById('msg');
        if (!elegidos().length || datos.get('horario') === null) { msg.innerHTML = T.alerta('error', 'Elige servicios y un horario.'); return; }
        llamar('manual.crear', {
          servicioIds: elegidos(),
          fecha: datos.get('fecha'),
          inicio: Number(datos.get('horario')),
          cliente: { nombre: datos.get('nombre'), celular: datos.get('celular'), correo: datos.get('correo') },
          notas: datos.get('notas'),
        }).then(function (t) { location.hash = '#/turno/' + t.id; })
          .catch(function (e) { msg.innerHTML = T.alerta('error', e.message); if (e.codigo === 'HORARIO_NO_DISPONIBLE') cargar(); });
      });
    }).catch(function (e) { pintarPanel('turno-nuevo', T.alerta('error', e.message)); });
  }

  // ---------- servicios ----------

  function vistaServicios(ruta, aviso) {
    pintarPanel('mis-servicios', T.cargando());
    llamar('servicios').then(function (cat) {
      var editable = cat.puedeEditar;
      pintarPanel('mis-servicios',
        '<form id="f-presta" class="panel"><h1>Servicios que prestas</h1>' + (aviso ? T.alerta('ok', aviso) : '') +
        '<p class="ayuda">Los clientes solo te verán para los servicios marcados.</p><div class="opciones">' +
        cat.servicios.filter(function (s) { return s.activo; }).map(function (s) {
          return '<label class="opcion"><input type="checkbox" name="servicio" value="' + s.id + '"' + (s.presta ? ' checked' : '') + '>' +
            '<span class="opcion__cuerpo"><strong>' + esc(s.nombre) + '</strong><small>' + s.duracionMin + ' min' + (s.precio != null ? ' · ' + T.pesos(s.precio) : '') + '</small></span></label>';
        }).join('') + '</div><div class="acciones"><button class="boton" type="submit">Guardar</button></div></form>' +
        (editable
          ? '<section class="panel"><h2>Catálogo de servicios</h2><p class="ayuda">Los cambios de duración o precio no alteran las citas ya confirmadas.</p>' +
            cat.servicios.map(formularioServicio).join('') + formularioServicio(null) + '</section>'
          : '')
      );
      document.getElementById('f-presta').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var ids = Array.prototype.filter.call(ev.target.querySelectorAll('[name=servicio]'), function (c) { return c.checked; })
          .map(function (c) { return Number(c.value); });
        llamar('servicios.prestar', { servicioIds: ids }).then(function () { vistaServicios(ruta, 'Servicios guardados.'); })
          .catch(function (e) { T.mostrarError(e); });
      });
      document.querySelectorAll('.f-servicio').forEach(function (form) {
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var d = new FormData(form);
          llamar('servicios.guardar', { servicio: {
            id: d.get('id') ? Number(d.get('id')) : null,
            nombre: d.get('nombre'),
            descripcion: d.get('descripcion'),
            duracionMin: Number(d.get('duracion')),
            precio: d.get('precio') === '' ? null : Number(d.get('precio')),
            activo: d.get('activo') === 'on',
          } }).then(function () { vistaServicios(ruta, 'Catálogo actualizado.'); })
            .catch(function (e) { form.querySelector('.msg').innerHTML = T.alerta('error', e.message); });
        });
      });
    }).catch(function (e) { pintarPanel('mis-servicios', T.alerta('error', e.message)); });
  }

  function formularioServicio(s) {
    var id = s ? s.id : 'nuevo';
    return (
      '<form class="f-servicio servicio-edicion"><h3>' + (s ? esc(s.nombre) : 'Nuevo servicio') + '</h3>' +
      '<input type="hidden" name="id" value="' + (s ? s.id : '') + '">' +
      '<div class="rejilla">' +
      '<div class="campo"><label for="n-' + id + '">Nombre</label><input id="n-' + id + '" name="nombre" maxlength="60" value="' + esc(s ? s.nombre : '') + '"></div>' +
      '<div class="campo"><label for="d-' + id + '">Duración (min)</label><input id="d-' + id + '" name="duracion" type="number" min="5" max="480" step="5" value="' + (s ? s.duracionMin : '') + '"></div>' +
      '<div class="campo"><label for="p-' + id + '">Precio (COP)</label><input id="p-' + id + '" name="precio" type="number" min="0" step="1000" value="' + (s && s.precio != null ? s.precio : '') + '"></div>' +
      '</div>' +
      '<div class="campo"><label for="t-' + id + '">Descripción</label><input id="t-' + id + '" name="descripcion" maxlength="200" value="' + esc(s ? s.descripcion : '') + '"></div>' +
      '<label class="consentimiento"><input type="checkbox" name="activo"' + (!s || s.activo ? ' checked' : '') + '> <span>Activo (se ofrece a los clientes)</span></label>' +
      '<div class="msg"></div><div class="acciones"><button class="boton boton--secundario" type="submit">' + (s ? 'Guardar cambios' : 'Agregar servicio') + '</button></div></form>'
    );
  }

  // ---------- avisos e historial ----------

  function vistaAvisos() {
    pintarPanel('avisos', T.cargando());
    llamar('notificaciones.leer').then(function (lista) {
      yo.noLeidas = 0;
      pintarPanel('avisos', '<section class="panel"><h1>Avisos</h1>' +
        (lista.length
          ? '<ul class="lista">' + lista.map(function (n) {
              return '<li><a href="' + esc(n.enlace || '#/agenda') + '">' + esc(n.mensaje) + '</a><small>' + esc(new Date(n.creadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })) + '</small></li>';
            }).join('') + '</ul>'
          : '<p class="vacio">No tienes avisos.</p>') + '</section>');
    }).catch(function (e) { pintarPanel('avisos', T.alerta('error', e.message)); });
  }

  var ACCIONES = {
    inicio_sesion: 'Inició sesión',
    cita_creada: 'Cita creada',
    cita_cancelada: 'Cita cancelada',
    cita_reprogramada: 'Cita reprogramada',
    estado_cita: 'Estado de cita',
    servicios_prestados: 'Servicios que presta',
    servicio_editado: 'Servicio editado',
    servicio_creado: 'Servicio creado',
  };

  function vistaHistorial() {
    pintarPanel('historial', T.cargando());
    llamar('registro').then(function (lista) {
      pintarPanel('historial', '<section class="panel"><h1>Historial de cambios</h1>' +
        (lista.length
          ? '<ul class="lista">' + lista.map(function (r) {
              var quien = r.actor.indexOf('peluquero:') === 0 ? 'Tú' : r.actor === 'cliente' ? 'Cliente' : r.actor;
              var detalle = r.detalle ? Object.keys(r.detalle).map(function (k) { return k + ': ' + JSON.stringify(r.detalle[k]); }).join(' · ') : '';
              return '<li><strong>' + esc(ACCIONES[r.accion] || r.accion) + '</strong>' +
                (r.entidad === 'Citas' && r.entidadId ? ' · <a href="#/turno/' + r.entidadId + '">turno ' + r.entidadId + '</a>' : '') +
                '<small>' + esc(new Date(r.fechaHora).toLocaleString('es-CO', { timeZone: 'America/Bogota' })) + ' · ' + esc(quien) + (detalle ? ' · ' + esc(detalle) : '') + '</small></li>';
            }).join('') + '</ul>'
          : '<p class="vacio">Sin cambios registrados.</p>') + '</section>');
    }).catch(function (e) { pintarPanel('historial', T.alerta('error', e.message)); });
  }

  Object.assign(T.rutas, {
    'panel': vistaIngreso,
    'agenda': protegida(vistaAgenda),
    'turno': protegida(vistaTurno),
    'turno-nuevo': protegida(vistaTurnoNuevo),
    'mis-servicios': protegida(vistaServicios),
    'avisos': protegida(vistaAvisos),
    'historial': protegida(vistaHistorial),
  });
})();
