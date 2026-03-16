const { Markup } = require('telegraf');
const db = require('../db');

const TYPE_LABELS = {
  time_sec: 'Час',
  reps: 'Повторення',
  weight_kg: 'Вага',
  distance_m: 'Дистанція',
};

function formatResultForCoach(r) {
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
  return `${date} — ${TYPE_LABELS[r.type]}: ${val}${name}`;
}

function getPeriodDates(period) {
  const now = new Date();
  let from = null;
  if (period === 'week') {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  } else if (period === 'month') {
    from = new Date(now);
    from.setMonth(from.getMonth() - 1);
  }
  const toDate = now.toISOString().slice(0, 19).replace('T', ' ');
  const fromStr = from ? from.toISOString().slice(0, 19).replace('T', ' ') : null;
  return { fromDate: fromStr, toDate };
}

function registerCoachHandlers(bot, coachTelegramId) {
  bot.start(async (ctx, next) => {
    if (ctx.from.id !== coachTelegramId) return next();
    await ctx.reply(
      'Привіт, тренере! Тут ти можеш переглянути результати дітей.',
      Markup.inlineKeyboard([Markup.button.callback('Мої діти', 'coach_children')])
    );
  });

  bot.action('coach_children', async (ctx) => {
    if (ctx.from.id !== coachTelegramId) return ctx.answerCbQuery();
    const children = await db.getChildrenWithResults();
    await ctx.answerCbQuery();
    if (children.length === 0) {
      await ctx.reply('Поки немає дітей з записами результатів.');
      return;
    }
    const buttons = children.map((c) => {
      const label = [c.first_name, c.username ? `@${c.username}` : ''].filter(Boolean).join(' ') || `ID ${c.telegram_id}`;
      return [Markup.button.callback(label.slice(0, 64), `child_${c.telegram_id}`)];
    });
    await ctx.reply('Оберіть дитину:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^child_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== coachTelegramId) return ctx.answerCbQuery();
    const childId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.reply(
      'Оберіть період:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Тиждень', `period_${childId}_week`),
          Markup.button.callback('Місяць', `period_${childId}_month`),
        ],
        [Markup.button.callback('Увесь час', `period_${childId}_all`)],
      ])
    );
  });

  bot.action(/^period_(\d+)_(week|month|all)$/, async (ctx) => {
    if (ctx.from.id !== coachTelegramId) return ctx.answerCbQuery();
    const childId = ctx.match[1];
    const period = ctx.match[2];
    const { fromDate, toDate } = getPeriodDates(period);
    const results = await db.getResultsByChild(Number(childId), fromDate, toDate);
    await ctx.answerCbQuery();

    const children = await db.getChildrenWithResults();
    const child = children.find((c) => c.telegram_id === Number(childId));
    const childName = child ? [child.first_name, child.username ? `@${child.username}` : ''].filter(Boolean).join(' ') || `ID ${childId}` : `ID ${childId}`;

    if (results.length === 0) {
      await ctx.reply(`У ${childName} немає записів за обраний період.`);
      return;
    }
    const lines = results.map(formatResultForCoach);
    const periodLabel = period === 'week' ? 'тиждень' : period === 'month' ? 'місяць' : 'увесь час';
    await ctx.reply(`Результати: ${childName} (${periodLabel})\n\n` + lines.join('\n'));
  });
}

module.exports = { registerCoachHandlers };
