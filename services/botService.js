const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// State management
const userStates = new Map();

const getState = (chatId) => userStates.get(chatId) || {};
const setState = (chatId, state) =>
  userStates.set(chatId, { ...getState(chatId), ...state });

module.exports = {
  bot,
  getState,
  setState,
};
