/* =========================================================
   CCST Ciberseguridad – Aplicación de estudio
   JavaScript puro (ES6+), sin dependencias ni proceso de build.
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   Configuración
   --------------------------------------------------------- */
const RUTA_PREGUNTAS = 'data/preguntas.json';

// Claves usadas en localStorage
const CLAVES = {
  falladas: 'ccst-ciber.falladas',
  mejorPuntaje: 'ccst-ciber.mejorPuntaje',
  tema: 'ccst-ciber.tema', // también se lee en el <head> de index.html
};

// Modos de estudio: "conRetro" indica si se corrige cada pregunta al momento
const MODOS = {
  practica: { nombre: 'Modo Práctica', conRetro: true },
  examen: { nombre: 'Modo Examen', conRetro: false },
  repaso: { nombre: 'Repaso de falladas', conRetro: true },
};

// Teclas numéricas admitidas para elegir opciones (1–6)
const MAX_TECLA_OPCION = 6;

const PANTALLAS = [
  'pantalla-carga',
  'pantalla-error',
  'pantalla-inicio',
  'pantalla-pregunta',
  'pantalla-resultados',
];

/* ---------------------------------------------------------
   Estado de la aplicación
   --------------------------------------------------------- */
const estado = {
  banco: [],   // Preguntas válidas cargadas del JSON (sin modificar)
  modo: null,  // 'practica' | 'examen' | 'repaso'
  sesion: [],  // Preguntas preparadas (barajadas) de la sesión actual
  indice: 0,   // Posición de la pregunta visible
};

/* ---------------------------------------------------------
   Utilidades generales
   --------------------------------------------------------- */

/** Atajo para obtener un elemento por id. */
const $ = (id) => document.getElementById(id);

/** Crea un elemento con clase y texto opcionales (siempre como texto, nunca HTML). */
function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

/** Devuelve una copia barajada de la lista (algoritmo Fisher-Yates). */
function barajar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Indica si un valor es una cadena con contenido. */
function tieneTexto(valor) {
  return typeof valor === 'string' && valor.trim() !== '';
}

/** Anuncia un mensaje a lectores de pantalla. */
function anunciar(mensaje) {
  const region = $('anuncio');
  region.textContent = '';
  // Pequeño retraso para que el lector detecte el cambio
  setTimeout(() => { region.textContent = mensaje; }, 50);
}

/** Formatea una fecha ISO en formato local corto. */
function formatearFecha(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------------------------------------------------------
   Almacenamiento (localStorage siempre dentro de try/catch)
   --------------------------------------------------------- */

/** Lee y decodifica un valor guardado; si falla, devuelve el valor por defecto. */
function leerGuardado(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(clave);
    return valor === null ? porDefecto : JSON.parse(valor);
  } catch (error) {
    return porDefecto;
  }
}

/** Guarda un valor como JSON; devuelve false si no se pudo. */
function escribirGuardado(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (error) {
    return false;
  }
}

/** Elimina un valor guardado, ignorando errores. */
function borrarGuardado(clave) {
  try {
    localStorage.removeItem(clave);
  } catch (error) {
    /* Sin acceso a localStorage: no hay nada que borrar */
  }
}

/** Lista de ids fallados (normalizados como texto). */
function obtenerFalladas() {
  const lista = leerGuardado(CLAVES.falladas, []);
  return Array.isArray(lista) ? lista.map(String) : [];
}

function guardarFalladas(ids) {
  escribirGuardado(CLAVES.falladas, [...new Set(ids)]);
}

/** Añade varios ids a la lista de falladas. */
function marcarFalladas(ids) {
  guardarFalladas([...obtenerFalladas(), ...ids.map(String)]);
}

/** Quita un id de la lista de falladas. */
function quitarFallada(id) {
  guardarFalladas(obtenerFalladas().filter((x) => x !== String(id)));
}

/** Preguntas del banco que están en la lista de falladas. */
function falladasDelBanco() {
  const ids = new Set(obtenerFalladas());
  return estado.banco.filter((p) => ids.has(String(p.id)));
}

/** Mejor puntaje guardado o null. */
function obtenerMejorPuntaje() {
  const mejor = leerGuardado(CLAVES.mejorPuntaje, null);
  return mejor && typeof mejor.porcentaje === 'number' ? mejor : null;
}

/** Guarda el puntaje si supera al mejor; devuelve true si es un nuevo récord. */
function registrarPuntaje(resultado) {
  const mejor = obtenerMejorPuntaje();
  if (mejor && mejor.porcentaje >= resultado.porcentaje) return false;
  escribirGuardado(CLAVES.mejorPuntaje, resultado);
  return true;
}

/* ---------------------------------------------------------
   Carga y validación de preguntas
   --------------------------------------------------------- */

/** Comprueba que una pregunta tenga los campos mínimos según su tipo. */
function esPreguntaValida(p) {
  if (!p || p.id === undefined || p.id === null || !tieneTexto(p.pregunta)) return false;
  if (p.tipo === 'relacionar') {
    return Array.isArray(p.pares) && p.pares.length > 0 &&
      p.pares.every((par) => par && tieneTexto(par.izquierda) && tieneTexto(par.derecha));
  }
  if (p.tipo === 'opcion' || p.tipo === 'multiple') {
    return Array.isArray(p.opciones) && p.opciones.length > 1 &&
      Array.isArray(p.correctas) && p.correctas.length > 0 &&
      p.correctas.every((i) => Number.isInteger(i) && i >= 0 && i < p.opciones.length);
  }
  return false;
}

/** Descarga el JSON y devuelve solo las preguntas válidas. */
async function cargarPreguntas() {
  const respuesta = await fetch(RUTA_PREGUNTAS, { cache: 'no-cache' });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} al pedir ${RUTA_PREGUNTAS}`);

  const datos = await respuesta.json();
  if (!Array.isArray(datos)) throw new Error('El JSON no contiene un arreglo de preguntas.');

  const validas = datos.filter(esPreguntaValida);
  if (validas.length < datos.length) {
    console.warn(`Se ignoraron ${datos.length - validas.length} preguntas con formato incorrecto.`);
  }
  if (!validas.length) throw new Error('El JSON no contiene preguntas válidas.');
  return validas;
}

/* ---------------------------------------------------------
   Preparación de preguntas para una sesión
   --------------------------------------------------------- */

/**
 * Crea una copia de trabajo de la pregunta con las opciones barajadas.
 * Cada opción conserva si es correcta, así el barajado no altera la solución.
 */
function prepararPregunta(original) {
  const item = { original, tipo: original.tipo, comprobada: false };

  if (original.tipo === 'relacionar') {
    // Columna izquierda en su orden; cada fila recuerda su pareja correcta
    item.filas = original.pares.map((par) => ({ izquierda: par.izquierda, correcta: par.derecha }));
    // Opciones de la columna derecha barajadas (sin duplicados)
    item.derechas = barajar([...new Set(original.pares.map((par) => par.derecha))]);
    item.respuesta = item.filas.map(() => '');
  } else {
    const correctas = new Set(original.correctas);
    item.opciones = barajar(original.opciones.map((texto, i) => ({
      texto: String(texto),
      correcta: correctas.has(i),
    })));
    item.numCorrectas = item.opciones.filter((op) => op.correcta).length;
    item.multiple = original.tipo === 'multiple' || item.numCorrectas > 1;
    item.respuesta = []; // índices elegidos dentro de item.opciones
  }
  return item;
}

/* ---------------------------------------------------------
   Evaluación de respuestas
   --------------------------------------------------------- */

/** Correcta solo si todo coincide exactamente. */
function esCorrecta(item) {
  if (item.tipo === 'relacionar') {
    return item.filas.every((fila, i) => item.respuesta[i] === fila.correcta);
  }
  return item.opciones.every((op, i) => item.respuesta.includes(i) === op.correcta);
}

/** La respuesta está completa y se puede comprobar. */
function estaCompleta(item) {
  if (item.tipo === 'relacionar') return item.respuesta.every((valor) => valor !== '');
  return item.respuesta.length > 0;
}

/** El usuario contestó al menos algo. */
function tieneRespuesta(item) {
  if (item.tipo === 'relacionar') return item.respuesta.some((valor) => valor !== '');
  return item.respuesta.length > 0;
}

/** En modos con retroalimentación, una pregunta comprobada ya no se puede cambiar. */
function estaBloqueada(item) {
  return MODOS[estado.modo].conRetro && item.comprobada;
}

/** Textos de la respuesta del usuario, para la revisión. */
function textosUsuario(item) {
  if (item.tipo === 'relacionar') {
    return item.filas.map((fila, i) => `${fila.izquierda} → ${item.respuesta[i] || 'sin responder'}`);
  }
  const elegidas = item.opciones.filter((_, i) => item.respuesta.includes(i)).map((op) => op.texto);
  return elegidas.length ? elegidas : ['Sin responder'];
}

/** Textos de la respuesta correcta, para la revisión. */
function textosCorrectos(item) {
  if (item.tipo === 'relacionar') {
    return item.filas.map((fila) => `${fila.izquierda} → ${fila.correcta}`);
  }
  return item.opciones.filter((op) => op.correcta).map((op) => op.texto);
}

/* ---------------------------------------------------------
   Navegación entre pantallas
   --------------------------------------------------------- */

function mostrarPantalla(id) {
  PANTALLAS.forEach((pantalla) => { $(pantalla).hidden = pantalla !== id; });
  window.scrollTo(0, 0);
}

/** Muestra el error de carga con instrucciones para usar un servidor local. */
function mostrarError(error) {
  const desdeArchivo = location.protocol === 'file:';
  $('detalle-error').textContent = desdeArchivo
    ? 'La página está abierta como archivo local (file://).'
    : String(error && error.message ? error.message : error);
  mostrarPantalla('pantalla-error');
}

/* ---------------------------------------------------------
   Pantalla de inicio
   --------------------------------------------------------- */

function mostrarInicio() {
  const falladas = falladasDelBanco().length;
  const mejor = obtenerMejorPuntaje();

  estado.modo = null;
  estado.sesion = [];

  $('dato-total').textContent = estado.banco.length;
  $('dato-falladas').textContent = falladas;
  $('dato-mejor').textContent = mejor ? `${mejor.porcentaje}%` : '—';
  $('detalle-mejor').textContent = mejor
    ? `Mejor examen: ${mejor.aciertos} de ${mejor.total} aciertos · ${formatearFecha(mejor.fecha)}`
    : 'Aún no has completado ningún examen.';

  $('btn-repaso').disabled = falladas === 0;
  $('cuenta-repaso').textContent = falladas ? String(falladas) : '';
  $('texto-repaso').textContent = falladas
    ? 'Practica solo las preguntas que has respondido mal.'
    : 'No tienes preguntas falladas por ahora.';

  $('btn-reiniciar').disabled = falladas === 0 && !mejor;

  mostrarPantalla('pantalla-inicio');
}

/** Borra falladas y mejor puntaje tras confirmar. */
function reiniciarProgreso() {
  if (!confirm('¿Borrar las preguntas falladas y el mejor puntaje guardados?')) return;
  borrarGuardado(CLAVES.falladas);
  borrarGuardado(CLAVES.mejorPuntaje);
  mostrarInicio();
  anunciar('Progreso reiniciado.');
}

/* ---------------------------------------------------------
   Sesión de preguntas
   --------------------------------------------------------- */

/** Comienza una sesión en el modo indicado. */
function iniciarSesion(modo) {
  const fuente = modo === 'repaso' ? falladasDelBanco() : estado.banco;
  if (!fuente.length) return;

  estado.modo = modo;
  estado.sesion = barajar(fuente).map(prepararPregunta);
  estado.indice = 0;

  mostrarPantalla('pantalla-pregunta');
  mostrarPregunta();
  enfocarEnunciado();
}

function preguntaActual() {
  return estado.sesion[estado.indice];
}

/** Dibuja la pregunta actual completa. */
function mostrarPregunta() {
  const item = preguntaActual();

  $('etiqueta-modo').textContent = MODOS[estado.modo].nombre;
  $('etiqueta-tipo').textContent = nombreTipo(item);
  $('enunciado').textContent = item.original.pregunta;

  const zona = $('zona-respuestas');
  zona.replaceChildren(item.tipo === 'relacionar' ? crearRelacionar(item) : crearOpciones(item));

  actualizarProgreso();
  mostrarRetroalimentacion(item);
  actualizarControles();
}

function nombreTipo(item) {
  if (item.tipo === 'relacionar') return 'Relacionar';
  return item.multiple ? 'Selección múltiple' : 'Opción única';
}

/** Texto de ayuda bajo el enunciado (ej. "Elija 3"). */
function actualizarInstruccion(item) {
  let texto = '';
  if (item.tipo === 'relacionar') {
    texto = 'Elige la pareja correcta para cada elemento.';
  } else if (item.multiple) {
    texto = `Elija ${item.numCorrectas} · seleccionadas: ${item.respuesta.length}`;
  } else {
    texto = 'Elija 1';
  }
  $('instruccion').textContent = texto;
}

/** Actualiza contador y barra de progreso. */
function actualizarProgreso() {
  const total = estado.sesion.length;
  const actual = estado.indice + 1;
  const porcentaje = Math.round((actual / total) * 100);

  $('contador').textContent = `${actual}/${total}`;
  $('barra-relleno').style.width = `${porcentaje}%`;
  const barra = $('barra-progreso');
  barra.setAttribute('aria-valuenow', String(porcentaje));
  barra.setAttribute('aria-valuetext', `Pregunta ${actual} de ${total}`);
}

/* ----- Preguntas de opción única / múltiple ----- */

function crearOpciones(item) {
  const lista = crear('div', item.multiple ? 'opciones opciones-multiples' : 'opciones');
  lista.setAttribute('role', 'group');
  lista.setAttribute('aria-labelledby', 'enunciado');

  item.opciones.forEach((opcion, i) => {
    const boton = crear('button', 'opcion');
    boton.type = 'button';
    boton.append(
      crear('span', 'opcion-tecla', String(i + 1)),
      crear('span', 'opcion-texto', opcion.texto),
      crear('span', 'opcion-marca'),
    );
    boton.addEventListener('click', () => alternarOpcion(i));
    lista.append(boton);
  });

  pintarOpciones(item, lista);
  return lista;
}

/** Aplica selección y, si corresponde, colores de corrección sin recrear los botones. */
function pintarOpciones(item, lista) {
  const solucion = estaBloqueada(item);
  lista.querySelectorAll('.opcion').forEach((boton, i) => {
    const opcion = item.opciones[i];
    const elegida = item.respuesta.includes(i);
    const marca = boton.querySelector('.opcion-marca');

    boton.setAttribute('aria-pressed', String(elegida));
    boton.classList.toggle('seleccionada', elegida && !solucion);
    boton.classList.toggle('correcta', solucion && opcion.correcta);
    boton.classList.toggle('incorrecta', solucion && elegida && !opcion.correcta);
    boton.disabled = solucion;

    // Texto además del color, para no depender solo de él
    marca.textContent = '';
    if (solucion && opcion.correcta) marca.textContent = elegida ? '✓ Correcta' : '✓ Era correcta';
    else if (solucion && elegida) marca.textContent = '✗ Incorrecta';
  });
}

/** Selecciona (o deselecciona en múltiple) la opción indicada. */
function alternarOpcion(indice) {
  const item = preguntaActual();
  if (!item || item.tipo === 'relacionar' || estaBloqueada(item)) return;
  if (indice < 0 || indice >= item.opciones.length) return;

  if (item.multiple) {
    const posicion = item.respuesta.indexOf(indice);
    if (posicion === -1) item.respuesta.push(indice);
    else item.respuesta.splice(posicion, 1);
  } else {
    item.respuesta = [indice];
  }

  pintarOpciones(item, $('zona-respuestas'));
  actualizarControles();
}

/* ----- Preguntas de relacionar ----- */

function crearRelacionar(item) {
  const lista = crear('div', 'relacionar');
  const bloqueada = estaBloqueada(item);

  item.filas.forEach((fila, i) => {
    const contenedor = crear('div', 'fila-relacion');
    const idSelect = `relacion-${i}`;

    const etiqueta = crear('label', 'relacion-izquierda', fila.izquierda);
    etiqueta.htmlFor = idSelect;

    const select = crear('select', 'relacion-select');
    select.id = idSelect;
    select.append(new Option('— Selecciona —', ''));
    item.derechas.forEach((texto) => select.append(new Option(texto, texto)));
    select.value = item.respuesta[i];
    select.disabled = bloqueada;
    select.addEventListener('change', () => {
      item.respuesta[i] = select.value;
      actualizarControles();
    });

    const campo = crear('div', 'relacion-derecha');
    campo.append(select);

    if (bloqueada) {
      const acierto = item.respuesta[i] === fila.correcta;
      contenedor.classList.add(acierto ? 'correcta' : 'incorrecta');
      campo.append(crear('p', 'relacion-solucion',
        acierto ? '✓ Correcto' : `✗ Correcto: ${fila.correcta}`));
    }

    contenedor.append(etiqueta, campo);
    lista.append(contenedor);
  });

  return lista;
}

/* ----- Retroalimentación (modo Práctica / Repaso) ----- */

function mostrarRetroalimentacion(item) {
  const caja = $('retroalimentacion');
  caja.replaceChildren();
  caja.className = 'retroalimentacion';

  if (!estaBloqueada(item)) {
    caja.hidden = true;
    return;
  }

  const acierto = esCorrecta(item);
  caja.classList.add(acierto ? 'es-correcta' : 'es-incorrecta');
  caja.append(crear('p', 'retro-titulo', acierto ? '✓ ¡Correcto!' : '✗ Incorrecto'));
  if (tieneTexto(item.original.nota)) {
    caja.append(crear('p', 'retro-nota', item.original.nota));
  }
  caja.hidden = false;
}

/* ----- Botones de control ----- */

function actualizarControles() {
  const item = preguntaActual();
  const conRetro = MODOS[estado.modo].conRetro;
  const esUltima = estado.indice === estado.sesion.length - 1;

  $('btn-anterior').disabled = estado.indice === 0;

  const comprobar = $('btn-comprobar');
  comprobar.hidden = !conRetro || item.comprobada;
  comprobar.disabled = !estaCompleta(item);

  let textoSiguiente = 'Siguiente →';
  if (esUltima) textoSiguiente = estado.modo === 'examen' ? 'Finalizar examen' : 'Ver resultados';
  $('btn-siguiente').textContent = textoSiguiente;

  actualizarInstruccion(item);
}

/** Corrige la pregunta actual y actualiza la lista de falladas. */
function comprobar() {
  const item = preguntaActual();
  if (!MODOS[estado.modo].conRetro || item.comprobada || !estaCompleta(item)) return;

  item.comprobada = true;
  const acierto = esCorrecta(item);
  if (!acierto) marcarFalladas([item.original.id]);
  else if (estado.modo === 'repaso') quitarFallada(item.original.id);

  mostrarPregunta();
  anunciar(acierto ? 'Respuesta correcta.' : 'Respuesta incorrecta.');
  $('btn-siguiente').focus();
}

function irA(indice) {
  estado.indice = indice;
  mostrarPregunta();
  enfocarEnunciado();
}

function anterior() {
  if (estado.indice > 0) irA(estado.indice - 1);
}

function siguiente() {
  if (estado.indice < estado.sesion.length - 1) irA(estado.indice + 1);
  else finalizarSesion();
}

/** Acción de la tecla Enter: comprobar si toca, si no avanzar. */
function accionPrincipal() {
  const item = preguntaActual();
  if (MODOS[estado.modo].conRetro && !item.comprobada) {
    if (estaCompleta(item)) comprobar();
    return;
  }
  siguiente();
}

/** Lleva el foco al enunciado para lectores de pantalla y teclado. */
function enfocarEnunciado() {
  $('enunciado').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function salirAlInicio() {
  if (confirm('¿Salir al inicio? Se perderá el avance de esta sesión.')) mostrarInicio();
}

/** Pide confirmación si quedan preguntas pendientes y muestra los resultados. */
function finalizarSesion() {
  const conRetro = MODOS[estado.modo].conRetro;
  const pendientes = estado.sesion.filter((item) =>
    conRetro ? !item.comprobada : !estaCompleta(item)).length;

  if (pendientes > 0) {
    const detalle = conRetro ? 'sin comprobar' : 'sin responder o incompletas';
    const mensaje = `Tienes ${pendientes} pregunta(s) ${detalle}; contarán como incorrectas. ¿Terminar de todos modos?`;
    if (!confirm(mensaje)) return;
  }
  mostrarResultados();
}

/* ---------------------------------------------------------
   Resultados y revisión
   --------------------------------------------------------- */

function mostrarResultados() {
  const conRetro = MODOS[estado.modo].conRetro;
  // En práctica solo cuentan como acertadas las preguntas comprobadas
  const acertadas = estado.sesion.filter((item) => (!conRetro || item.comprobada) && esCorrecta(item));
  const total = estado.sesion.length;
  const porcentaje = Math.round((acertadas.length / total) * 100);

  let esRecord = false;
  if (estado.modo === 'examen') {
    const falladas = estado.sesion.filter((item) => !esCorrecta(item)).map((item) => item.original.id);
    marcarFalladas(falladas);
    esRecord = registrarPuntaje({
      porcentaje,
      aciertos: acertadas.length,
      total,
      fecha: new Date().toISOString(),
    });
  }

  $('titulo-resultados').textContent = `Resultados · ${MODOS[estado.modo].nombre}`;
  $('resultado-porcentaje').textContent = `${porcentaje}%`;
  $('resultado-aciertos').textContent = `${acertadas.length} de ${total} correctas`;
  $('resultado-mensaje').textContent = mensajeSegunPorcentaje(porcentaje);
  $('resultado-record').hidden = !esRecord;

  const hayFalladas = falladasDelBanco().length > 0;
  $('btn-resultado-repaso').disabled = !hayFalladas;

  pintarRevision(new Set(acertadas));

  mostrarPantalla('pantalla-resultados');
  $('titulo-resultados').focus({ preventScroll: true });
}

function mensajeSegunPorcentaje(porcentaje) {
  if (porcentaje >= 90) return '¡Excelente! Dominas el tema.';
  if (porcentaje >= 75) return 'Muy bien. Repasa las que fallaste y estarás listo.';
  if (porcentaje >= 50) return 'Vas por buen camino; sigue practicando.';
  return 'Sigue estudiando: revisa las explicaciones de cada pregunta.';
}

/** Construye la lista de revisión con la respuesta del usuario y la correcta. */
function pintarRevision(acertadas) {
  const lista = $('lista-revision');
  lista.replaceChildren(...estado.sesion.map((item, i) =>
    crearItemRevision(item, i + 1, acertadas.has(item))));
  lista.classList.toggle('solo-incorrectas', $('filtro-incorrectas').checked);
}

function crearItemRevision(item, numero, acierto) {
  const conRetro = MODOS[estado.modo].conRetro;
  const li = crear('li', `revision-item ${acierto ? 'correcta' : 'incorrecta'}`);

  let estadoTexto = acierto ? '✓ Correcta' : '✗ Incorrecta';
  if (!acierto && !tieneRespuesta(item)) estadoTexto = 'Sin responder';
  else if (!acierto && conRetro && !item.comprobada) estadoTexto = 'Sin comprobar';

  const encabezado = crear('div', 'revision-encabezado');
  encabezado.append(
    crear('span', '', `Pregunta ${numero}`),
    crear('span', `insignia ${acierto ? 'insignia-ok' : 'insignia-error'}`, estadoTexto),
  );

  li.append(
    encabezado,
    crear('p', 'revision-enunciado', item.original.pregunta),
    crearBloqueRevision('Tu respuesta', textosUsuario(item), acierto ? 'ok' : 'error'),
    crearBloqueRevision('Respuesta correcta', textosCorrectos(item), 'ok'),
  );

  if (tieneTexto(item.original.nota)) {
    li.append(crear('p', 'revision-nota', item.original.nota));
  }
  return li;
}

function crearBloqueRevision(titulo, textos, tipo) {
  const bloque = crear('div', `revision-bloque ${tipo}`);
  const lista = crear('ul');
  textos.forEach((texto) => lista.append(crear('li', '', texto)));
  bloque.append(crear('strong', '', titulo), lista);
  return bloque;
}

/* ---------------------------------------------------------
   Teclado
   --------------------------------------------------------- */

/** Teclas 1–6 eligen opción y Enter comprueba o avanza. */
function manejarTeclado(evento) {
  if ($('pantalla-pregunta').hidden) return;
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return;

  const objetivo = evento.target;
  const etiqueta = objetivo.tagName;
  const enCampo = etiqueta === 'SELECT' || etiqueta === 'INPUT' || etiqueta === 'TEXTAREA';

  // Números: elegir opción
  if (/^[1-9]$/.test(evento.key) && !enCampo) {
    const numero = Number(evento.key);
    if (numero <= MAX_TECLA_OPCION) {
      evento.preventDefault();
      alternarOpcion(numero - 1);
    }
    return;
  }

  if (evento.key !== 'Enter' || enCampo) return;

  // Sobre una opción, Enter comprueba/avanza (la barra espaciadora la selecciona)
  const sobreOpcion = objetivo.classList && objetivo.classList.contains('opcion');
  // Sobre otros botones, Enter conserva su comportamiento normal
  if (etiqueta === 'BUTTON' && !sobreOpcion) return;
  if (etiqueta === 'A') return;

  evento.preventDefault();
  accionPrincipal();
}

/* ---------------------------------------------------------
   Tema claro (pastel) / oscuro (diseño original)
   --------------------------------------------------------- */

function temaActual() {
  return document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro';
}

/** Aplica el tema en <html> y actualiza el botón. */
function aplicarTema(tema) {
  if (tema === 'oscuro') document.documentElement.dataset.tema = 'oscuro';
  else delete document.documentElement.dataset.tema;
  actualizarBotonTema();
}

/** El botón muestra el modo al que se cambiará al pulsarlo. */
function actualizarBotonTema() {
  const oscuro = temaActual() === 'oscuro';
  const boton = $('btn-tema');
  boton.setAttribute('aria-pressed', String(oscuro));
  boton.querySelector('.boton-tema-icono').textContent = oscuro ? '☀' : '☾';
  boton.querySelector('.boton-tema-texto').textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
  boton.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

/** Cambia de tema y guarda la preferencia. */
function alternarTema() {
  const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema(nuevo);
  escribirGuardado(CLAVES.tema, nuevo);
  anunciar(nuevo === 'oscuro' ? 'Modo oscuro activado.' : 'Modo claro activado.');
}

/* ---------------------------------------------------------
   Inicialización
   --------------------------------------------------------- */

function enlazarEventos() {
  $('btn-tema').addEventListener('click', alternarTema);

  document.querySelectorAll('.boton-modo').forEach((boton) => {
    boton.addEventListener('click', () => iniciarSesion(boton.dataset.modo));
  });

  $('btn-reiniciar').addEventListener('click', reiniciarProgreso);
  $('btn-reintentar').addEventListener('click', () => location.reload());

  $('btn-anterior').addEventListener('click', anterior);
  $('btn-comprobar').addEventListener('click', comprobar);
  $('btn-siguiente').addEventListener('click', siguiente);
  $('btn-salir').addEventListener('click', salirAlInicio);

  $('btn-resultado-inicio').addEventListener('click', mostrarInicio);
  $('btn-resultado-repaso').addEventListener('click', () => iniciarSesion('repaso'));
  $('filtro-incorrectas').addEventListener('change', (e) => {
    $('lista-revision').classList.toggle('solo-incorrectas', e.target.checked);
  });

  document.addEventListener('keydown', manejarTeclado);
}

async function iniciarApp() {
  aplicarTema(leerGuardado(CLAVES.tema, 'claro'));
  enlazarEventos();
  mostrarPantalla('pantalla-carga');
  try {
    estado.banco = await cargarPreguntas();
    mostrarInicio();
  } catch (error) {
    console.error('Error al cargar las preguntas:', error);
    mostrarError(error);
  }
}

document.addEventListener('DOMContentLoaded', iniciarApp);
