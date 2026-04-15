// helpers/telegram.js
require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.warn(
    "⚠️ TELEGRAM_BOT_TOKEN no configurado. Notificaciones deshabilitadas.",
  );
}

const bot = botToken ? new TelegramBot(botToken, { polling: false }) : null;

function canSend(to) {
  return bot && to && String(to).trim().length > 0;
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleString("es-CO");
  } catch {
    return String(d);
  }
}

async function sendMessage(chatId, text, opts = {}) {
  if (!canSend(chatId)) return;
  try {
    await bot.sendMessage(chatId, text, { parse_mode: "HTML", ...opts });
  } catch (e) {
    console.error("❌ Error enviando Telegram:", e.message);
  }
}

function msgNuevaAsignacion(t, creador, analista) {
  return [
    "🔔 <b>Nueva actividad asignada</b>",
    `• <b>Título:</b> ${t.titulo}`,
    `• <b>Creada por:</b> ${creador}`,
    `• <b>Asignada a:</b> ${analista}`,
    `• <b>Ticket:</b> ${t.ticket || "-"}`,
    `• <b>Placa/Serial:</b> ${t.placa || "-"}`,
    `• <b>Creada:</b> ${fmtDate(t.fechaHora)}`,
    `• <b>Fecha límite:</b> ${fmtDate(t.fechaLimite)}`,
    "",
    "Por favor, revisa el detalle en el sistema.",
  ].join("\n");
}

function msgReasignacion(t, anterior, nuevo, creador) {
  return [
    "➡️ <b>Actividad reasignada</b>",
    `• <b>Título:</b> ${t.titulo}`,
    `• <b>Ticket:</b> ${t.ticket || "-"}`,
    `• <b>Creada por:</b> ${creador}`,
    `• <b>De:</b> ${anterior}`,
    `• <b>Para:</b> ${nuevo}`,
    `• <b>Nueva fecha límite:</b> ${fmtDate(t.fechaLimite)}`,
  ].join("\n");
}

function msgAmpliacion(t, nuevaFecha) {
  return [
    "⏰ <b>Ampliación de plazo</b>",
    `• <b>Título:</b> ${t.titulo}`,
    `• <b>Ticket:</b> ${t.ticket || "-"}`,
    `• <b>Nueva fecha límite:</b> ${fmtDate(nuevaFecha)}`,
  ].join("\n");
}

function diffMins(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

function msgProxima(t, now = new Date()) {
  const mins = diffMins(new Date(t.fechaLimite), now);
  return [
    '⏳ <b>Actividad próxima a vencer</b>',
    `• <b>Título:</b> ${t.titulo}`,
    `• <b>Analista:</b> ${t.analistaNombre}`,
    `• <b>Ticket:</b> ${t.ticket || '-'}`,
    `• <b>Fecha límite:</b> ${new Date(t.fechaLimite).toLocaleString('es-CO')}`,
    `• <b>Quedan:</b> ${mins} min`
  ].join('\n');
}

function msgVencida(t, now = new Date()) {
  const mins = diffMins(now, new Date(t.fechaLimite));
  return [
    '⛔ <b>Actividad vencida</b>',
    `• <b>Título:</b> ${t.titulo}`,
    `• <b>Analista:</b> ${t.analistaNombre}`,
    `• <b>Ticket:</b> ${t.ticket || '-'}`,
    `• <b>Fecha límite:</b> ${new Date(t.fechaLimite).toLocaleString('es-CO')}`,
    `• <b>Retraso:</b> ${mins} min`
  ].join('\n');
}

function msgFinalizada(t, cerradoPor, analista, creador) {
  return [
    "✅ <b>Actividad finalizada</b>",
    `• <b>Título:</b> ${t.titulo}`,
    `• <b>Creada por:</b> ${creador}`,
    `• <b>Asignada a:</b> ${analista}`,
    `• <b>Cerrada por:</b> ${cerradoPor}`,
    `• <b>Ticket:</b> ${t.ticket || "-"}`,
    `• <b>Fecha límite:</b> ${
      t.fechaLimite ? new Date(t.fechaLimite).toLocaleString("es-CO") : "-"
    }`,
    `• <b>Cerrada:</b> ${new Date().toLocaleString("es-CO")}`,
  ].join("\n");
}

module.exports = {
  sendMessage,
  msgNuevaAsignacion,
  msgReasignacion,
  msgAmpliacion,
  msgProxima,
  msgVencida,
  msgFinalizada,
};
