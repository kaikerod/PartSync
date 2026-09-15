import crypto from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SETTINGS = {
  defaultRequester: "",
  technicians: ["Técnico 1", "Técnico 2"]
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

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      order_id TEXT NOT NULL DEFAULT '',
      client_name TEXT NOT NULL,
      device_model TEXT NOT NULL,
      device_model_code TEXT NOT NULL DEFAULT '',
      imei TEXT NOT NULL DEFAULT '',
      part_name TEXT NOT NULL,
      technician TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'Agendado',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_request_logs_request_id
      ON request_logs(request_id);

    CREATE INDEX IF NOT EXISTS idx_appointments_date_technician
      ON appointments(scheduled_date, technician);
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

    this.insertAppointment = db.prepare(`
      INSERT INTO appointments (
        id, request_id, order_id, client_name, device_model, device_model_code, imei,
        part_name, technician, scheduled_date, start_time, end_time, duration_minutes,
        status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.updateAppointmentStmt = db.prepare(`
      UPDATE appointments SET
        request_id = ?,
        order_id = ?,
        client_name = ?,
        device_model = ?,
        device_model_code = ?,
        imei = ?,
        part_name = ?,
        technician = ?,
        scheduled_date = ?,
        start_time = ?,
        end_time = ?,
        duration_minutes = ?,
        status = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `);
  }

  addRequestLog(requestId, notes) {
    if (!requestId) return;
    const req = this.db.prepare("SELECT status FROM requests WHERE id = ?").get(requestId);
    if (!req) return;
    this.insertLog.run(requestId, new Date().toISOString(), req.status, notes);
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

  async getAppointments() {
    const rows = this.db.prepare(`
      SELECT
        id,
        request_id AS requestId,
        order_id AS orderId,
        client_name AS clientName,
        device_model AS deviceModel,
        device_model_code AS deviceModelCode,
        imei,
        part_name AS partName,
        technician,
        scheduled_date AS scheduledDate,
        start_time AS startTime,
        end_time AS endTime,
        duration_minutes AS durationMinutes,
        status,
        notes,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM appointments
      ORDER BY scheduled_date ASC, start_time ASC
    `).all();

    return rows;
  }

  async createAppointment(data) {
    const appointment = normalizeAppointment(data);

    // Conflict check (same technician and date, status != Cancelado)
    const conflict = this.db.prepare(`
      SELECT client_name, device_model, start_time, end_time
      FROM appointments
      WHERE scheduled_date = ?
        AND technician = ?
        AND status != 'Cancelado'
        AND id != ?
        AND start_time < ?
        AND end_time > ?
    `).get(
      appointment.scheduledDate,
      appointment.technician,
      appointment.id,
      appointment.endTime,
      appointment.startTime
    );

    if (conflict) {
      throw conflictError(
        `Conflito: ${appointment.technician} já possui o agendamento de "${conflict.client_name}" das ${conflict.start_time} às ${conflict.end_time}.`
      );
    }

    this.runInTransaction(() => {
      this.insertAppointment.run(
        appointment.id,
        appointment.requestId || null,
        appointment.orderId,
        appointment.clientName,
        appointment.deviceModel,
        appointment.deviceModelCode,
        appointment.imei,
        appointment.partName,
        appointment.technician,
        appointment.scheduledDate,
        appointment.startTime,
        appointment.endTime,
        appointment.durationMinutes,
        appointment.status,
        appointment.notes,
        appointment.createdAt,
        appointment.updatedAt
      );

      if (appointment.requestId) {
        const formattedDate = formatDatePtBr(appointment.scheduledDate);
        this.addRequestLog(
          appointment.requestId,
          `Reparo agendado com ${appointment.technician} para ${formattedDate} às ${appointment.startTime} (${appointment.durationMinutes} min)`
        );
      }
    });

    return appointment;
  }

  async updateAppointment(id, updates) {
    const existing = this.db.prepare(`
      SELECT * FROM appointments WHERE id = ?
    `).get(id);

    if (!existing) {
      throw notFound("Agendamento não encontrado.");
    }

    const merged = {
      id: existing.id,
      requestId: updates.requestId !== undefined ? updates.requestId : existing.request_id,
      orderId: updates.orderId !== undefined ? updates.orderId : existing.order_id,
      clientName: updates.clientName !== undefined ? updates.clientName : existing.client_name,
      deviceModel: updates.deviceModel !== undefined ? updates.deviceModel : existing.device_model,
      deviceModelCode: updates.deviceModelCode !== undefined ? updates.deviceModelCode : existing.device_model_code,
      imei: updates.imei !== undefined ? updates.imei : existing.imei,
      partName: updates.partName !== undefined ? updates.partName : existing.part_name,
      technician: updates.technician !== undefined ? updates.technician : existing.technician,
      scheduledDate: updates.scheduledDate !== undefined ? updates.scheduledDate : existing.scheduled_date,
      startTime: updates.startTime !== undefined ? updates.startTime : existing.start_time,
      durationMinutes: updates.durationMinutes !== undefined ? Number(updates.durationMinutes) : existing.duration_minutes,
      status: updates.status !== undefined ? updates.status : existing.status,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      createdAt: existing.created_at,
      updatedAt: new Date().toISOString()
    };

    const appointment = normalizeAppointment(merged);

    if (appointment.status !== "Cancelado") {
      const conflict = this.db.prepare(`
        SELECT client_name, device_model, start_time, end_time
        FROM appointments
        WHERE scheduled_date = ?
          AND technician = ?
          AND status != 'Cancelado'
          AND id != ?
          AND start_time < ?
          AND end_time > ?
      `).get(
        appointment.scheduledDate,
        appointment.technician,
        appointment.id,
        appointment.endTime,
        appointment.startTime
      );

      if (conflict) {
        throw conflictError(
          `Conflito: ${appointment.technician} já possui o agendamento de "${conflict.client_name}" das ${conflict.start_time} às ${conflict.end_time}.`
        );
      }
    }

    this.runInTransaction(() => {
      this.updateAppointmentStmt.run(
        appointment.requestId || null,
        appointment.orderId,
        appointment.clientName,
        appointment.deviceModel,
        appointment.deviceModelCode,
        appointment.imei,
        appointment.partName,
        appointment.technician,
        appointment.scheduledDate,
        appointment.startTime,
        appointment.endTime,
        appointment.durationMinutes,
        appointment.status,
        appointment.notes,
        appointment.updatedAt,
        appointment.id
      );

      if (appointment.requestId) {
        const dateStr = formatDatePtBr(appointment.scheduledDate);
        if (existing.status !== appointment.status) {
          if (appointment.status === "Em Reparo") {
            this.addRequestLog(appointment.requestId, `Reparo iniciado pelo técnico ${appointment.technician}`);
          } else if (appointment.status === "Concluído") {
            this.addRequestLog(appointment.requestId, `Reparo concluído com sucesso pelo técnico ${appointment.technician}`);
          } else if (appointment.status === "Cancelado") {
            this.addRequestLog(appointment.requestId, `Agendamento de reparo cancelado`);
          } else {
            this.addRequestLog(appointment.requestId, `Status do reparo alterado para ${appointment.status}`);
          }
        } else if (
          existing.scheduled_date !== appointment.scheduledDate ||
          existing.start_time !== appointment.startTime ||
          existing.technician !== appointment.technician
        ) {
          this.addRequestLog(
            appointment.requestId,
            `Reparo reagendado com ${appointment.technician} para ${dateStr} às ${appointment.startTime}`
          );
        }
      }
    });

    return appointment;
  }

  async deleteAppointment(id) {
    const existing = this.db.prepare("SELECT * FROM appointments WHERE id = ?").get(id);
    if (!existing) return;

    this.runInTransaction(() => {
      this.db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
      if (existing.request_id) {
        this.addRequestLog(existing.request_id, "Agendamento de reparo removido do calendário");
      }
    });
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
      this.db.exec("DELETE FROM appointments");
      this.db.exec("DELETE FROM settings");
    });

    return {
      requests: await this.getRequests(),
      appointments: await this.getAppointments(),
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

    await this.sql`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        request_id TEXT REFERENCES requests(id) ON DELETE SET NULL,
        order_id TEXT NOT NULL DEFAULT '',
        client_name TEXT NOT NULL,
        device_model TEXT NOT NULL,
        device_model_code TEXT NOT NULL DEFAULT '',
        imei TEXT NOT NULL DEFAULT '',
        part_name TEXT NOT NULL,
        technician TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        status TEXT NOT NULL DEFAULT 'Agendado',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_appointments_date_technician
      ON appointments(scheduled_date, technician)
    `;

    await this.sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS order_id TEXT`;
    await this.sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS device_model_code TEXT NOT NULL DEFAULT ''`;
    await this.sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS imei TEXT NOT NULL DEFAULT ''`;
  }

  async addRequestLog(requestId, notes) {
    if (!requestId) return;
    const rows = await this.sql`SELECT status FROM requests WHERE id = ${requestId}`;
    if (!rows || rows.length === 0) return;
    await this.sql`
      INSERT INTO request_logs (request_id, timestamp, status, notes)
      VALUES (${requestId}, ${new Date().toISOString()}, ${rows[0].status}, ${notes})
    `;
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

  async getAppointments() {
    const rows = await this.sql`
      SELECT
        id,
        request_id AS "requestId",
        order_id AS "orderId",
        client_name AS "clientName",
        device_model AS "deviceModel",
        device_model_code AS "deviceModelCode",
        imei,
        part_name AS "partName",
        technician,
        scheduled_date AS "scheduledDate",
        start_time AS "startTime",
        end_time AS "endTime",
        duration_minutes AS "durationMinutes",
        status,
        notes,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM appointments
      ORDER BY scheduled_date ASC, start_time ASC
    `;

    return rows;
  }

  async createAppointment(data) {
    const appointment = normalizeAppointment(data);

    const conflicts = await this.sql`
      SELECT client_name, device_model, start_time, end_time
      FROM appointments
      WHERE scheduled_date = ${appointment.scheduledDate}
        AND technician = ${appointment.technician}
        AND status != 'Cancelado'
        AND id != ${appointment.id}
        AND start_time < ${appointment.endTime}
        AND end_time > ${appointment.startTime}
    `;

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      throw conflictError(
        `Conflito: ${appointment.technician} já possui o agendamento de "${conflict.client_name}" das ${conflict.start_time} às ${conflict.end_time}.`
      );
    }

    await this.sql`
      INSERT INTO appointments (
        id, request_id, order_id, client_name, device_model, device_model_code, imei,
        part_name, technician, scheduled_date, start_time, end_time, duration_minutes,
        status, notes, created_at, updated_at
      ) VALUES (
        ${appointment.id}, ${appointment.requestId || null}, ${appointment.orderId},
        ${appointment.clientName}, ${appointment.deviceModel}, ${appointment.deviceModelCode},
        ${appointment.imei}, ${appointment.partName}, ${appointment.technician},
        ${appointment.scheduledDate}, ${appointment.startTime}, ${appointment.endTime},
        ${appointment.durationMinutes}, ${appointment.status}, ${appointment.notes},
        ${appointment.createdAt}, ${appointment.updatedAt}
      )
    `;

    if (appointment.requestId) {
      const formattedDate = formatDatePtBr(appointment.scheduledDate);
      await this.addRequestLog(
        appointment.requestId,
        `Reparo agendado com ${appointment.technician} para ${formattedDate} às ${appointment.startTime} (${appointment.durationMinutes} min)`
      );
    }

    return appointment;
  }

  async updateAppointment(id, updates) {
    const rows = await this.sql`SELECT * FROM appointments WHERE id = ${id}`;
    if (!rows || rows.length === 0) {
      throw notFound("Agendamento não encontrado.");
    }
    const existing = rows[0];

    const merged = {
      id: existing.id,
      requestId: updates.requestId !== undefined ? updates.requestId : existing.request_id,
      orderId: updates.orderId !== undefined ? updates.orderId : existing.order_id,
      clientName: updates.clientName !== undefined ? updates.clientName : existing.client_name,
      deviceModel: updates.deviceModel !== undefined ? updates.deviceModel : existing.device_model,
      deviceModelCode: updates.deviceModelCode !== undefined ? updates.deviceModelCode : existing.device_model_code,
      imei: updates.imei !== undefined ? updates.imei : existing.imei,
      partName: updates.partName !== undefined ? updates.partName : existing.part_name,
      technician: updates.technician !== undefined ? updates.technician : existing.technician,
      scheduledDate: updates.scheduledDate !== undefined ? updates.scheduledDate : existing.scheduled_date,
      startTime: updates.startTime !== undefined ? updates.startTime : existing.start_time,
      durationMinutes: updates.durationMinutes !== undefined ? Number(updates.durationMinutes) : existing.duration_minutes,
      status: updates.status !== undefined ? updates.status : existing.status,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      createdAt: existing.created_at,
      updatedAt: new Date().toISOString()
    };

    const appointment = normalizeAppointment(merged);

    if (appointment.status !== "Cancelado") {
      const conflicts = await this.sql`
        SELECT client_name, device_model, start_time, end_time
        FROM appointments
        WHERE scheduled_date = ${appointment.scheduledDate}
          AND technician = ${appointment.technician}
          AND status != 'Cancelado'
          AND id != ${appointment.id}
          AND start_time < ${appointment.endTime}
          AND end_time > ${appointment.startTime}
      `;

      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        throw conflictError(
          `Conflito: ${appointment.technician} já possui o agendamento de "${conflict.client_name}" das ${conflict.start_time} às ${conflict.end_time}.`
        );
      }
    }

    await this.sql`
      UPDATE appointments SET
        request_id = ${appointment.requestId || null},
        order_id = ${appointment.orderId},
        client_name = ${appointment.clientName},
        device_model = ${appointment.deviceModel},
        device_model_code = ${appointment.deviceModelCode},
        imei = ${appointment.imei},
        part_name = ${appointment.partName},
        technician = ${appointment.technician},
        scheduled_date = ${appointment.scheduledDate},
        start_time = ${appointment.startTime},
        end_time = ${appointment.endTime},
        duration_minutes = ${appointment.durationMinutes},
        status = ${appointment.status},
        notes = ${appointment.notes},
        updated_at = ${appointment.updatedAt}
      WHERE id = ${appointment.id}
    `;

    if (appointment.requestId) {
      const dateStr = formatDatePtBr(appointment.scheduledDate);
      if (existing.status !== appointment.status) {
        if (appointment.status === "Em Reparo") {
          await this.addRequestLog(appointment.requestId, `Reparo iniciado pelo técnico ${appointment.technician}`);
        } else if (appointment.status === "Concluído") {
          await this.addRequestLog(appointment.requestId, `Reparo concluído com sucesso pelo técnico ${appointment.technician}`);
        } else if (appointment.status === "Cancelado") {
          await this.addRequestLog(appointment.requestId, `Agendamento de reparo cancelado`);
        } else {
          await this.addRequestLog(appointment.requestId, `Status do reparo alterado para ${appointment.status}`);
        }
      } else if (
        existing.scheduled_date !== appointment.scheduledDate ||
        existing.start_time !== appointment.startTime ||
        existing.technician !== appointment.technician
      ) {
        await this.addRequestLog(
          appointment.requestId,
          `Reparo reagendado com ${appointment.technician} para ${dateStr} às ${appointment.startTime}`
        );
      }
    }

    return appointment;
  }

  async deleteAppointment(id) {
    const rows = await this.sql`SELECT * FROM appointments WHERE id = ${id}`;
    if (!rows || rows.length === 0) return;
    const existing = rows[0];

    await this.sql`DELETE FROM appointments WHERE id = ${id}`;
    if (existing.request_id) {
      await this.addRequestLog(existing.request_id, "Agendamento de reparo removido do calendário");
    }
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
      this.sql`DELETE FROM appointments`,
      this.sql`DELETE FROM settings`
    ]);

    return {
      requests: await this.getRequests(),
      appointments: await this.getAppointments(),
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

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function conflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function calculateEndTime(startTime, durationMinutes) {
  const parts = String(startTime || "08:00").split(":");
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  const totalMinutes = hours * 60 + minutes + (Number(durationMinutes) || 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

function formatDatePtBr(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function normalizeAppointment(appointment) {
  if (!appointment || typeof appointment !== "object") {
    throw badRequest("Dados do agendamento inválidos.");
  }

  const id = appointment.id ? String(appointment.id).trim() : crypto.randomUUID();
  const clientName = requiredString(appointment.clientName, "clientName");
  const deviceModel = requiredString(appointment.deviceModel, "deviceModel");
  const partName = requiredString(appointment.partName, "partName");
  const technician = requiredString(appointment.technician, "technician");
  const scheduledDate = requiredString(appointment.scheduledDate, "scheduledDate");
  const startTime = requiredString(appointment.startTime, "startTime");
  const durationMinutes = Number(appointment.durationMinutes) || 60;
  const endTime = appointment.endTime ? String(appointment.endTime).trim() : calculateEndTime(startTime, durationMinutes);
  const now = new Date().toISOString();

  return {
    id,
    requestId: optionalString(appointment.requestId) || null,
    orderId: optionalString(appointment.orderId),
    clientName,
    deviceModel,
    deviceModelCode: optionalString(appointment.deviceModelCode),
    imei: optionalString(appointment.imei),
    partName,
    technician,
    scheduledDate,
    startTime,
    endTime,
    durationMinutes,
    status: optionalString(appointment.status) || "Agendado",
    notes: optionalString(appointment.notes),
    createdAt: optionalString(appointment.createdAt) || now,
    updatedAt: optionalString(appointment.updatedAt) || now
  };
}
