const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'sportbot.db');
let dbInstance = null;
let dbReady = null;

function save() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbReady) return dbReady;
  dbReady = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      dbInstance = new SQL.Database(buf);
    } else {
      dbInstance = new SQL.Database();
    }
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('time_sec', 'reps', 'weight_kg', 'distance_m')),
        value REAL NOT NULL,
        exercise_name TEXT,
        recorded_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
      );
    `);
    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_results_user_recorded ON results(user_id, recorded_at);`);
    return dbInstance;
  })();
  return dbReady;
}

async function ensureUser(telegramId, username, firstName) {
  const db = await getDb();
  const stmt = db.prepare(
    `INSERT INTO users (telegram_id, username, first_name)
     VALUES (?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name`
  );
  stmt.run([telegramId, username || null, firstName || null]);
  stmt.free();
  save();
}

async function addResult(userId, type, value, exerciseName = null) {
  const db = await getDb();
  const stmt = db.prepare(
    `INSERT INTO results (user_id, type, value, exercise_name) VALUES (?, ?, ?, ?)`
  );
  stmt.run([userId, type, value, exerciseName]);
  stmt.free();
  save();
}

async function getChildrenWithResults() {
  const db = await getDb();
  const stmt = db.prepare(`
    SELECT u.telegram_id, u.username, u.first_name
    FROM users u
    INNER JOIN results r ON r.user_id = u.telegram_id
    GROUP BY u.telegram_id
    ORDER BY u.first_name, u.username
  `);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function getResultsByChild(childTelegramId, fromDate, toDate) {
  const db = await getDb();
  let sql = `SELECT id, type, value, exercise_name, recorded_at FROM results WHERE user_id = ?`;
  const params = [childTelegramId];
  if (fromDate) {
    sql += ` AND recorded_at >= ?`;
    params.push(fromDate);
  }
  if (toDate) {
    sql += ` AND recorded_at <= ?`;
    params.push(toDate);
  }
  sql += ` ORDER BY recorded_at DESC`;
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function getRecentResultsByChild(childTelegramId, limit = 10) {
  const db = await getDb();
  const stmt = db.prepare(`
    SELECT id, type, value, exercise_name, recorded_at
    FROM results WHERE user_id = ?
    ORDER BY recorded_at DESC LIMIT ?
  `);
  stmt.bind([childTelegramId, limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = {
  getDb,
  ensureUser,
  addResult,
  getChildrenWithResults,
  getResultsByChild,
  getRecentResultsByChild,
};
