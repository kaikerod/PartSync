import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./server/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;
const distDir = path.join(projectRoot, "dist");
const requestedPort = Number(process.env.PORT || 5173);
const isProduction = process.argv.includes("--prod") || process.env.NODE_ENV === "production";

const database = await createDatabase();
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
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Erro interno do servidor."
    });
  }
});

listen(requestedPort);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    database.close();
    if (vite) await vite.close();
    server.close(() => process.exit(0));
  });
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, database: database.path });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/requests") {
    sendJson(res, 200, database.getRequests());
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/requests") {
    const body = await readJson(req);
    const requests = database.replaceRequests(body.requests);
    sendJson(res, 200, { requests });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, database.getSettings());
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const body = await readJson(req);
    const settings = database.saveSettings(body.settings ?? body);
    sendJson(res, 200, { settings });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/migrate") {
    const body = await readJson(req);
    const currentRequests = database.getRequests();

    if (currentRequests.length === 0 && Array.isArray(body.requests) && body.requests.length > 0) {
      database.replaceRequests(body.requests);
    }

    if (body.settings && typeof body.settings === "object") {
      database.saveSettings(body.settings);
    }

    sendJson(res, 200, {
      requests: database.getRequests(),
      settings: database.getSettings()
    });
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/data") {
    sendJson(res, 200, database.reset());
    return;
  }

  throw httpError(404, "Rota API não encontrada.");
}

async function readJson(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw httpError(413, "JSON maior que limite de 1 MB.");
    }
  }

  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, "JSON inválido.");
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
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

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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
      console.log(`SQLite em ${database.path}`);
    }
  });
}
