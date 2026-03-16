require('dotenv').config();
const { Telegraf } = require('telegraf');
const config = require('./config');
const db = require('./db');
const { registerChildHandlers } = require('./handlers/child');
const { registerCoachHandlers } = require('./handlers/coach');

async function main() {
  if (!config.botToken) {
    console.error('Встановіть BOT_TOKEN у .env');
    process.exit(1);
  }
  if (!config.coachTelegramId) {
    console.error('Встановіть COACH_TELEGRAM_ID у .env');
    process.exit(1);
  }
  if (!config.mongodbUri) {
    console.error('Встановіть MONGODB_URI у .env');
    process.exit(1);
  }

  await db.getDb();
  const bot = new Telegraf(config.botToken);

  registerChildHandlers(bot, config.coachTelegramId);
  registerCoachHandlers(bot, config.coachTelegramId);

  bot.launch();
  console.log('Бот запущено');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
