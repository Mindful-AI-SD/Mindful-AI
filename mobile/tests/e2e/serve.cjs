const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../dist");
const types = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
http.createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = path.resolve(root, "." + name);
  if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403); response.end(); return; }
  if (!path.extname(file)) file = path.join(root, "index.html");
  fs.readFile(file, (error, data) => {
    response.writeHead(error ? 404 : 200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(error ? "Not found" : data);
  });
}).listen(4173, "127.0.0.1");
