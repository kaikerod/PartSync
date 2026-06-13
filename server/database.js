import { mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SETTINGS = {
  defaultRequester: ""
};

export async function createDatabase() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (connectionString) {
    return createPostgresDatabase(connectionString);
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL precisa estar configurado na Vercel.");
  }

  return createSqliteDatabase();
}

async function createSqliteDatabase() {
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = process.env.PARTSYNC_DB_PATH
    ? path.resolve(process.env.PARTSYNC_DB_PATH)
    : path.join(
        process.env.PARTSYNC_DATA_DIR
          ? path.resolve(process.env.PARTSYNC_DATA_DIR)
          : path.join(process.cwd(), "data"),
        "partsync.sqlite"
      );

  await mkdir(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      requester TEXT NOT NULL,
      device_model TEXT NOT NULL,
      device_model_code TEXT NOT NULL DEFAULT '',
      imei TEXT NOT NULL DEFAULT '',
      part_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      urgency TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      order_id TEXT
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_request_logs_request_id
      ON request_logs(request_id);
  `);

  addSqliteColumn(db, "ALTER TABLE requests ADD COLUMN order_id TEXT;");
  addSqliteColumn(db, "ALTER TABLE requests ADD COLUMN device_model_code TEXT NOT NULL DEFAULT '';");
  addSqliteColumn(db, "ALTER TABLE requests ADD COLUMN imei TEXT NOT NULL DEFAULT '';");

  return new SqlitePartsDatabase(db, dbPath);
}

async function createPostgresDatabase(connectionString) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connectionString);
  const database = new PostgresPartsDatabase(sql);
  await database.initialize();
  return database;
}

class SqlitePartsDatabase {
  constructor(db, dbPath) {
    this.db = db;
    this.kind = "sqlite";
    this.path = dbPath;

    this.insertRequest = db.prepare(`
      INSERT INTO requests (
        id, created_at, requester, device_model, device_model_code, imei, part_name,
        quantity, urgency, notes, status, order_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.insertLog = db.prepare(`
      INSERT INTO request_logs (request_id, timestamp, status, notes)
      VALUES (?, ?, ?, ?)
    `);
  }

  async getRequests() {
    const rows = this.db.prepare(`
      SELECT
        id,
        created_at AS createdAt,
        requester,
        device_model AS deviceModel,
        device_model_code AS deviceModelCode,
        imei,
        part_name AS partName,
        quantity,
        urgency,
        notes,
        status,
        order_id AS orderId
      FROM requests
      ORDER BY created_at DESC
    `).all();

    const logRows = this.db.prepare(`
      SELECT request_id AS requestId, timestamp, status, notes
      FROM request_logs
      ORDER BY id ASC
    `).all();

    return hydrateRequests(rows, logRows);
  }

  async replaceRequests(requests) {
    const normalizedRequests = normalizeRequests(requests);

    this.runInTransaction(() => {
      this.db.exec("DELETE FROM request_logs");
      this.db.exec("DELETE FROM requests");

      for (const request of normalizedRequests) {
        this.insertRequest.run(
          request.id,
          request.createdAt,
          request.requester,
          request.deviceModel,
          request.deviceModelCode,
          request.imei,
          request.partName,
          request.quantity,
          request.urgency,
          request.notes,
          request.status,
          request.orderId || null
        );

        for (const log of request.logs) {
          this.insertLog.run(request.id, log.timestamp, log.status, log.notes);
        }
      }
    });

    return this.getRequests();
  }

  async getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings").all();
    return hydrateSettings(rows);
  }

  async saveSettings(settings) {
    const nextSettings = { ...DEFAULT_SETTINGS, ...settings };

    this.runInTransaction(() => {
      this.db.exec("DELETE FROM settings");
      const insertSetting = this.db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
      `);

      for (const [key, value] of Object.entries(nextSettings)) {
        insertSetting.run(key, JSON.stringify(value ?? ""));
      }
    });

    return this.getSettings();
  }

  async reset() {
    this.runInTransaction(() => {
      this.db.exec("DELETE FROM request_logs");
      this.db.exec("DELETE FROM requests");
      this.db.exec("DELETE FROM settings");
    });

    return {
      requests: await this.getRequests(),
      settings: await this.getSettings()
    };
  }

  runInTransaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

class PostgresPartsDatabase {
  constructor(sql) {
    this.sql = sql;
    this.kind = "postgres";
    this.path = "neon-postgres";
  }

  async initialize() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        requester TEXT NOT NULL,
        device_model TEXT NOT NULL,
        device_model_code TEXT NOT NULL DEFAULT '',
        imei TEXT NOT NULL DEFAULT '',
        part_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        urgency TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        order_id TEXT
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS request_logs (
        id BIGSERIAL PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT ''
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_request_logs_request_id
      ON request_logs(request_id)
    `;

    await this.sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS order_id TEXT`;
    await this.sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS device_model_code TEXT NOT NULL DEFAULT ''`;
    await this.sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS imei TEXT NOT NULL DEFAULT ''`;
  }

  async getRequests() {
    const rows = await this.sql`
      SELECT
        id,
        created_at AS "createdAt",
        requester,
        device_model AS "deviceModel",
        device_model_code AS "deviceModelCode",
        imei,
        part_name AS "partName",
        quantity,
        urgency,
        notes,
        status,
        order_id AS "orderId"
      FROM requests
      ORDER BY created_at DESC
    `;

    const logRows = await this.sql`
      SELECT request_id AS "requestId", timestamp, status, notes
      FROM request_logs
      ORDER BY id ASC
    `;

    return hydrateRequests(rows, logRows);
  }

  async replaceRequests(requests) {
    const normalizedRequests = normalizeRequests(requests);
    const statements = [
      this.sql`DELETE FROM request_logs`,
      this.sql`DELETE FROM requests`
    ];

    for (const request of normalizedRequests) {
      statements.push(this.sql`
        INSERT INTO requests (
          id, created_at, requester, device_model, device_model_code, imei, part_name,
          quantity, urgency, notes, status, order_id
        ) VALUES (
          ${request.id}, ${request.createdAt}, ${request.requester},
          ${request.deviceModel}, ${request.deviceModelCode}, ${request.imei},
          ${request.partName}, ${request.quantity}, ${request.urgency},
          ${request.notes}, ${request.status}, ${request.orderId || null}
        )
      `);

      for (const log of request.logs) {
        statements.push(this.sql`
          INSERT INTO request_logs (request_id, timestamp, status, notes)
          VALUES (${request.id}, ${log.timestamp}, ${log.status}, ${log.notes})
        `);
      }
    }

    await this.sql.transaction(statements);
    return this.getRequests();
  }

  async getSettings() {
    const rows = await this.sql`SELECT key, value FROM settings`;
    return hydrateSettings(rows);
  }

  async saveSettings(settings) {
    const nextSettings = { ...DEFAULT_SETTINGS, ...settings };
    const statements = [this.sql`DELETE FROM settings`];

    for (const [key, value] of Object.entries(nextSettings)) {
      statements.push(this.sql`
        INSERT INTO settings (key, value)
        VALUES (${key}, ${JSON.stringify(value ?? "")})
      `);
    }

    await this.sql.transaction(statements);
    return this.getSettings();
  }

  async reset() {
    await this.sql.transaction([
      this.sql`DELETE FROM request_logs`,
      this.sql`DELETE FROM requests`,
      this.sql`DELETE FROM settings`
    ]);

    return {
      requests: await this.getRequests(),
      settings: await this.getSettings()
    };
  }

  close() {}
}

function hydrateRequests(rows, logRows) {
  const logsByRequest = new Map();

  for (const log of logRows) {
    if (!logsByRequest.has(log.requestId)) {
      logsByRequest.set(log.requestId, []);
    }

    logsByRequest.get(log.requestId).push({
      timestamp: log.timestamp,
      status: log.status,
      notes: log.notes
    });
  }

  return rows.map((request) => ({
    ...request,
    logs: logsByRequest.get(request.id) ?? []
  }));
}

function hydrateSettings(rows) {
  const settings = { ...DEFAULT_SETTINGS };

  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings;
}

function normalizeRequests(requests) {
  if (!Array.isArray(requests)) {
    throw badRequest("Campo requests precisa ser array.");
  }

  return requests.map(normalizeRequest);
}

function normalizeRequest(request) {
  const normalized = {
    id: requiredString(request.id, "id"),
    createdAt: requiredString(request.createdAt, "createdAt"),
    requester: requiredString(request.requester, "requester"),
    deviceModel: requiredString(request.deviceModel, "deviceModel"),
    deviceModelCode: optionalString(request.deviceModelCode),
    imei: optionalString(request.imei),
    partName: requiredString(request.partName, "partName"),
    quantity: Number(request.quantity),
    urgency: requiredString(request.urgency, "urgency"),
    notes: optionalString(request.notes),
    status: requiredString(request.status, "status"),
    orderId: request.orderId ? String(request.orderId).trim() : "",
    logs: Array.isArray(request.logs) ? request.logs : []
  };

  if (!Number.isInteger(normalized.quantity) || normalized.quantity < 1) {
    throw badRequest("Campo quantity precisa ser inteiro maior que zero.");
  }

  if (normalized.logs.length === 0) {
    normalized.logs.push({
      timestamp: normalized.createdAt,
      status: normalized.status,
      notes: "Solicitação registrada no sistema"
    });
  } else {
    normalized.logs = normalized.logs.map((log) =>
      normalizeLog(log, normalized.status, normalized.createdAt)
    );
  }

  return normalized;
}

function normalizeLog(log, fallbackStatus, fallbackTimestamp) {
  return {
    timestamp: optionalString(log.timestamp) || fallbackTimestamp,
    status: optionalString(log.status) || fallbackStatus,
    notes: optionalString(log.notes)
  };
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest(`Campo ${fieldName} precisa ser texto obrigatório.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function addSqliteColumn(db, statement) {
  try {
    db.exec(statement);
  } catch {
    // Column might already exist.
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
