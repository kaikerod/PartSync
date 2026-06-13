import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, handleNodeApi, httpError, sendJson, toErrorResponse } from "./server/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;
const distDir = path.join(projectRoot, "dist");
const requestedPort = Number(process.env.PORT || 5173);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";

const vite = isProduction
  ? null
  : await import("vite").then(({ createServer }) =>
      createServer({
        appType: "spa",
        server: { middlewareMode: true }
      })
    );

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (vite) {
      vite.middlewares(req, res, (error) => {
        if (error) {
          vite.ssrFixStacktrace(error);
          sendJson(res, 500, { error: "Erro no Vite dev server." });
        } else {
          sendJson(res, 404, { error: "Rota não encontrada." });
        }
      });
      return;
    }

    await serveStaticFile(url.pathname, res);
  } catch (error) {
    const result = toErrorResponse(error);
    sendJson(res, result.statusCode, result.payload);
  }
});

listen(requestedPort);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await closeDatabase();
    if (vite) await vite.close();
    server.close(() => process.exit(0));
  });
}

async function handleApi(req, res, url) {
  await handleNodeApi(req, res, url.pathname);
}

async function serveStaticFile(pathname, res) {
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(distDir, `.${requestedPath}`);

  if (!filePath.startsWith(distDir)) {
    throw httpError(403, "Caminho inválido.");
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      streamFile(filePath, res);
      return;
    }
  } catch {
    streamFile(path.join(distDir, "index.html"), res);
  }
}

function streamFile(filePath, res) {
  res.writeHead(200, {
    "Content-Type": contentType(filePath)
  });
  createReadStream(filePath).pipe(res);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  return types[ext] ?? "application/octet-stream";
}

function listen(port) {
  server.once("error", (error) => {
    const canTryNextPort =
      error.code === "EADDRINUSE" &&
      !process.env.PORT &&
      port < requestedPort + 10;

    if (canTryNextPort) {
      listen(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    if (!process.env.PARTSYNC_SILENT) {
      console.log(`PartSync em http://localhost:${port}`);
    }
  });
}
