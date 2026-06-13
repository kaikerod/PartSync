import { createDatabase } from "./database.js";

let databasePromise;

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = createDatabase();
  }

  return databasePromise;
}

export async function closeDatabase() {
  if (!databasePromise) return;

  const database = await databasePromise;
  database.close?.();
  databasePromise = null;
}

export async function handleApiRequest({ method, pathname, body = {} }) {
  const database = await getDatabase();

  if (method === "GET" && pathname === "/api/health") {
    return jsonResult(200, {
      ok: true,
      database: database.kind,
      storage: database.path
    });
  }

  if (method === "GET" && pathname === "/api/requests") {
    return jsonResult(200, await database.getRequests());
  }

  if (method === "PUT" && pathname === "/api/requests") {
    const requests = await database.replaceRequests(body.requests);
    return jsonResult(200, { requests });
  }

  if (method === "GET" && pathname === "/api/settings") {
    return jsonResult(200, await database.getSettings());
  }

  if (method === "PUT" && pathname === "/api/settings") {
    const settings = await database.saveSettings(body.settings ?? body);
    return jsonResult(200, { settings });
  }

  if (method === "POST" && pathname === "/api/migrate") {
    const currentRequests = await database.getRequests();

    if (currentRequests.length === 0 && Array.isArray(body.requests) && body.requests.length > 0) {
      await database.replaceRequests(body.requests);
    }

    if (body.settings && typeof body.settings === "object") {
      await database.saveSettings(body.settings);
    }

    return jsonResult(200, {
      requests: await database.getRequests(),
      settings: await database.getSettings()
    });
  }

  if (method === "DELETE" && pathname === "/api/data") {
    return jsonResult(200, await database.reset());
  }

  throw httpError(404, "Rota API não encontrada.");
}

export async function handleNodeApi(req, res, pathname) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const resolvedPathname = pathname || new URL(req.url, "http://localhost").pathname;
    const body = await readJson(req);
    const result = await handleApiRequest({
      method: req.method,
      pathname: resolvedPathname,
      body
    });

    sendJson(res, result.statusCode, result.payload);
  } catch (error) {
    if (!error.statusCode) {
      console.error(error);
    }

    const result = toErrorResponse(error);
    sendJson(res, result.statusCode, result.payload);
  }
}

export async function readJson(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return {};
  }

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return parseJsonBody(req.body);
  }

  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw httpError(413, "JSON maior que limite de 1 MB.");
    }
  }

  return parseJsonBody(body);
}

export function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function toErrorResponse(error) {
  return jsonResult(error.statusCode || 500, {
    error: error.statusCode ? error.message : "Erro interno do servidor."
  });
}

function parseJsonBody(body) {
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, "JSON inválido.");
  }
}

function jsonResult(statusCode, payload) {
  return { statusCode, payload };
}
