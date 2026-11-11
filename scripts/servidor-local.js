'use strict';

// Servidor local para probar la página en modo demostración:
//   npm run web   →   http://localhost:8080
// Sirve web/ en la raíz y apps-script/ en /apps-script/, igual que GitHub Pages.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const puerto = Number(process.env.PORT) || 8080;

http
  .createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const base = ruta.startsWith('/apps-script/') ? RAIZ : path.join(RAIZ, 'web');
    const archivo = path.normalize(path.join(base, ruta === '/' ? 'index.html' : ruta));
    if (!archivo.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(archivo, (err, datos) => {
      if (err) {
        res.writeHead(404).end('No encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': (TIPOS[path.extname(archivo)] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(datos);
    });
  })
  .listen(puerto, () => console.log(`TUNERO en modo demostración: http://localhost:${puerto}`));
