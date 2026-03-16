require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN,
  coachTelegramId: process.env.COACH_TELEGRAM_ID ? Number(process.env.COACH_TELEGRAM_ID) : null,
};
