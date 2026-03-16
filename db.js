const { MongoClient } = require('mongodb');
const config = require('./config');

const COLLECTIONS = { users: 'users', results: 'results' };
let client = null;
let db = null;

async function getDb() {
  if (db) return db;
  if (!config.mongodbUri) throw new Error('Встановіть MONGODB_URI у .env');
  client = new MongoClient(config.mongodbUri);
  await client.connect();
  db = client.db();
  await db.collection(COLLECTIONS.results).createIndex(
    { user_id: 1, recorded_at: -1 },
    { background: true }
  );
  await db.collection(COLLECTIONS.users).createIndex(
    { telegram_id: 1 },
    { unique: true, background: true }
  );
  return db;
}

async function ensureUser(telegramId, username, firstName) {
  const coll = (await getDb()).collection(COLLECTIONS.users);
  await coll.updateOne(
    { telegram_id: telegramId },
    {
      $set: {
        username: username || null,
        first_name: firstName || null,
        updated_at: new Date(),
      },
    },
    { upsert: true }
  );
}

async function addResult(userId, type, value, exerciseName = null) {
  const coll = (await getDb()).collection(COLLECTIONS.results);
  await coll.insertOne({
    user_id: userId,
    type,
    value: Number(value),
    exercise_name: exerciseName || null,
    recorded_at: new Date(),
  });
}

async function getChildrenWithResults() {
  const d = await getDb();
  const resultsColl = d.collection(COLLECTIONS.results);
  const usersColl = d.collection(COLLECTIONS.users);
  const userIds = await resultsColl.distinct('user_id');
  if (userIds.length === 0) return [];
  const users = await usersColl
    .find({ telegram_id: { $in: userIds } })
    .sort({ first_name: 1, username: 1 })
    .toArray();
  return users.map((u) => ({
    telegram_id: u.telegram_id,
    username: u.username,
    first_name: u.first_name,
  }));
}

async function getResultsByChild(childTelegramId, fromDate, toDate) {
  const coll = (await getDb()).collection(COLLECTIONS.results);
  const filter = { user_id: childTelegramId };
  if (fromDate || toDate) {
    filter.recorded_at = {};
    if (fromDate) filter.recorded_at.$gte = new Date(fromDate);
    if (toDate) filter.recorded_at.$lte = new Date(toDate);
  }
  const rows = await coll
    .find(filter)
    .sort({ recorded_at: -1 })
    .toArray();
  return rows.map((r) => ({
    id: r._id,
    type: r.type,
    value: r.value,
    exercise_name: r.exercise_name,
    recorded_at: r.recorded_at.toISOString().slice(0, 19).replace('T', ' '),
  }));
}

async function getRecentResultsByChild(childTelegramId, limit = 10) {
  const coll = (await getDb()).collection(COLLECTIONS.results);
  const rows = await coll
    .find({ user_id: childTelegramId })
    .sort({ recorded_at: -1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => ({
    id: r._id,
    type: r.type,
    value: r.value,
    exercise_name: r.exercise_name,
    recorded_at: r.recorded_at.toISOString().slice(0, 19).replace('T', ' '),
  }));
}

module.exports = {
  getDb,
  ensureUser,
  addResult,
  getChildrenWithResults,
  getResultsByChild,
  getRecentResultsByChild,
};