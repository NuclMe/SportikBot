const { Markup } = require('telegraf');
const db = require('../db');

const RESULT_TYPES = [
  { id: 'time_sec', label: 'Час (сек)' },
  { id: 'reps', label: 'Повторення' },
  { id: 'weight_kg', label: 'Вага (кг)' },
  { id: 'distance_m', label: 'Дистанція (м)' },
];

const addResultState = new Map();

function getChildKeyboard() {
  return Markup.keyboard([['Додати результат', 'Мої результати']])
    .resize()
    .persistent();
}

function formatResultRow(r) {
  const typeLabels = { time_sec: 'Час', reps: 'Повторення', weight_kg: 'Вага', distance_m: 'Дистанція' };
  let val = String(r.value);
  if (r.type === 'time_sec') {
    const sec = Number(r.value);
    const min = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    val = `${min} хв ${s} сек`;
  } else if (r.type === 'distance_m') val = `${r.value} м`;
  else if (r.type === 'weight_kg') val = `${r.value} кг`;
  const name = r.exercise_name ? ` (${r.exercise_name})` : '';
  const date = r.recorded_at.replace('T', ' ').slice(0, 16);
  return `${date} — ${typeLabels[r.type]}: ${val}${name}`;
}

function registerChildHandlers(bot, coachTelegramId) {
  bot.start(async (ctx, next) => {
    if (ctx.from.id === coachTelegramId) return next();
    await ctx.reply(
      'Привіт! Я бот для запису спортивних результатів. Обери дію:',
      getChildKeyboard()
    );
  });

  bot.hears('Додати результат', async (ctx, next) => {
    if (ctx.from.id === coachTelegramId) return next();
    const chatId = ctx.chat.id;
    addResultState.set(chatId, { step: 'type' });
    await ctx.reply(
      'Оберіть тип результату:',
      Markup.inlineKeyboard(
        RESULT_TYPES.map((t) => [Markup.button.callback(t.label, `type_${t.id}`)])
      )
    );
  });

  bot.action(/^type_(time_sec|reps|weight_kg|distance_m)$/, async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addResultState.get(chatId);
    if (!state || state.step !== 'type') return ctx.answerCbQuery();
    const type = ctx.match[1];
    state.step = 'value';
    state.type = type;
    addResultState.set(chatId, state);
    await ctx.answerCbQuery();
    const label = RESULT_TYPES.find((t) => t.id === type).label;
    await ctx.reply(`Введіть значення для "${label}" (одне число):`);
  });

  bot.hears('Мої результати', async (ctx, next) => {
    if (ctx.from.id === coachTelegramId) return next();
    const results = await db.getRecentResultsByChild(ctx.from.id, 10);
    if (results.length === 0) {
      await ctx.reply('У вас ще немає записів.');
      return;
    }
    const lines = results.map(formatResultRow);
    await ctx.reply('Останні результати:\n\n' + lines.join('\n'));
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.from.id === coachTelegramId) return next();
    const chatId = ctx.chat.id;
    const state = addResultState.get(chatId);
    if (!state) return next();

    if (state.step === 'value') {
      const num = parseFloat(ctx.message.text.replace(',', '.'));
      if (Number.isNaN(num) || num < 0) {
        await ctx.reply('Введіть коректне додатнє число.');
        return;
      }
      state.step = 'exercise';
      state.value = num;
      addResultState.set(chatId, state);
      await ctx.reply(
        'Введіть назву вправи (наприклад: віджимання) або натисніть Пропустити:',
        Markup.inlineKeyboard([Markup.button.callback('Пропустити', 'skip_exercise')])
      );
      return;
    }

    if (state.step === 'exercise') {
      await db.ensureUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      await db.addResult(ctx.from.id, state.type, state.value, ctx.message.text.trim());
      addResultState.delete(chatId);
      await ctx.reply('Результат збережено.', getChildKeyboard());
      return;
    }

    return next();
  });

  bot.action('skip_exercise', async (ctx) => {
    const chatId = ctx.chat.id;
    const state = addResultState.get(chatId);
    if (!state || state.step !== 'exercise') return ctx.answerCbQuery();
    await db.ensureUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
    await db.addResult(ctx.from.id, state.type, state.value, null);
    addResultState.delete(chatId);
    await ctx.answerCbQuery();
    await ctx.reply('Результат збережено.', getChildKeyboard());
  });
}

module.exports = { registerChildHandlers };
