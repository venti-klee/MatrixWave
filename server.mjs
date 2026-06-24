import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const port = Number(process.env.PORT || 4173);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".md": "text/markdown; charset=utf-8" };

const server = createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
  let file = normalize(join(root, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
  response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => console.log(`MatrixWave running at http://127.0.0.1:${port}`));
