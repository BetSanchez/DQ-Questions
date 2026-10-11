# CCST Ciberseguridad · App de estudio

Aplicación web estática para practicar preguntas de la certificación **Cisco CCST Cybersecurity**.
Está hecha con HTML, CSS y JavaScript puro: no tiene dependencias ni proceso de build, así que
funciona directamente en GitHub Pages.

## Funciones

- **Modo Práctica**: comprueba cada respuesta y muestra la explicación (`nota`).
- **Modo Examen**: no da pistas durante el examen. Al final muestra el puntaje, el porcentaje y la revisión de cada pregunta.
- **Repasar falladas**: solo incluye las preguntas que has fallado. Si aciertas una, sale de la lista.
- Cambia el orden de las preguntas y de las opciones en cada sesión.
- Guarda las preguntas falladas y el mejor puntaje en `localStorage`. Puedes borrarlos con «Reiniciar progreso guardado».
- Se adapta a celular y laptop, tiene un botón para cambiar entre el modo claro (paleta pastel) y el modo oscuro (diseño original en azul), recuerda tu elección y se puede usar con teclado:
  - `1`–`6`: elegir una opción.
  - `Espacio`: marcar la opción que tiene el foco.
  - `Enter`: comprobar o avanzar.

## Estructura

```
index.html
css/styles.css
js/app.js
data/preguntas.json   ← banco de preguntas
README.md
```

## Formato de `data/preguntas.json`

Es un arreglo de objetos. Hay tres tipos de pregunta:

```json
[
  {
    "id": 1,
    "tipo": "opcion",
    "pregunta": "¿Qué protocolo cifra el tráfico web?",
    "opciones": ["HTTP", "HTTPS", "FTP", "Telnet"],
    "correctas": [1],
    "nota": "HTTPS usa TLS."
  },
  {
    "id": 2,
    "tipo": "multiple",
    "pregunta": "¿Cuáles son factores de autenticación? (Elija 2)",
    "opciones": ["Contraseña", "Huella dactilar", "Dirección IP", "Puerto"],
    "correctas": [0, 1],
    "nota": ""
  },
  {
    "id": 3,
    "tipo": "relacionar",
    "pregunta": "Relacione cada ataque con su descripción.",
    "pares": [
      { "izquierda": "Phishing", "derecha": "Correo engañoso" },
      { "izquierda": "DoS", "derecha": "Saturar un servicio" }
    ],
    "nota": ""
  }
]
```

- `correctas` contiene índices que empiezan en 0.
- En las preguntas `relacionar`, los `pares` deben venir bien emparejados. La app baraja la columna derecha.
- Si `nota` está vacía, no se muestra.

## Probar en local

Por seguridad, el navegador no deja que `fetch()` lea archivos cuando abres `index.html` con doble clic (`file://`).
Por eso necesitas un servidor local. Puedes usar cualquiera de estas opciones:

**Opción A: VS Code + Live Server**
1. Instala la extensión *Live Server*.
2. Haz clic derecho en `index.html` y elige **Open with Live Server**.

**Opción B: Python**
```bash
cd ruta/al/proyecto
python -m http.server 8000
```
Después abre <http://localhost:8000> en el navegador.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube estos archivos a la rama `main`, con `index.html` en la raíz:
   ```bash
   git init
   git add .
   git commit -m "App de estudio CCST Ciberseguridad"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
2. En el repositorio, ve a **Settings → Pages**.
3. En **Build and deployment → Source**, elige **Deploy from a branch**.
4. En **Branch**, elige `main` y la carpeta `/ (root)`. Pulsa **Save**.
5. Espera uno o dos minutos. La app quedará publicada en
   `https://TU-USUARIO.github.io/TU-REPO/`.

Todas las rutas son relativas, así que la app también funciona dentro de la subcarpeta del repositorio.
