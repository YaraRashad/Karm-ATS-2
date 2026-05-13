import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = process.env.PORT || 8080;
const root = join(process.cwd(), "dist");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(root, clean === "/" ? "index.html" : clean);
}

createServer(async (req, res) => {
  try {
    const path = safePath(req.url);
    const ext = extname(path);
    res.setHeader("Cache-Control", ext === ".html" ? "no-store" : "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", contentTypes[ext] || "application/octet-stream");
    createReadStream(path)
      .on("error", async () => {
        const index = await readFile(join(root, "index.html"));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(index);
      })
      .pipe(res);
  } catch {
    res.writeHead(500);
    res.end("Server error");
  }
}).listen(port, () => {
  console.log(`Karm ATS frontend listening on ${port}`);
});
