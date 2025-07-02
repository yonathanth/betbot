const { bot, getState, setState } = require("../services/botService");
const db = require("../services/dbService");

module.exports = {
  async stopHandler(msg) {
    try {
      const chatId = msg.chat.id;
      // Clear user state
      setState(chatId, { step: null });

      await bot.sendMessage(
        chatId,
        "🛑 <b>Conversation Stopped</b>\n\n" +
          "Your current conversation has been reset.\n\n" +
          "📋 Available commands:\n" +
          "• /start - Begin property listing\n" +
          "• /admin - Access admin panel (admin only)\n" +
          "• /stop - Stop current conversation\n\n" +
          "Use /start when you're ready to list a property! 🏡",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Error in stopHandler:", error);
      bot.sendMessage(
        msg.chat.id,
        "❌ Something went wrong. Please try /start to begin again."
      );
    }
  },
  async startHandler(msg) {
    try {
      const chatId = msg.chat.id;
      const user = await db.getUser(chatId);

      if (!user) {
        await db.createUser(chatId);
        setState(chatId, { step: "get_name" });
        return bot.sendMessage(
          chatId,
          "👋 Welcome to PropertyBot!\n\n" +
            "I'll help you list your property for sale or rent.\n" +
            "Let's start by getting some basic information.\n\n" +
            "Please share your name:"
        );
      }

      if (!user.name) {
        setState(chatId, { step: "get_name" });
        return bot.sendMessage(chatId, "Please share your name:");
      }

      if (!user.phone) {
        setState(chatId, { step: "get_phone" });
        return bot.sendMessage(chatId, "📱 Please share your phone number:");
      }

      // User is fully registered, proceed to listing
      setState(chatId, { step: null });
      return require("./postController").askPropertyType(chatId);
    } catch (error) {
      console.error("Error in startHandler:", error);
      bot.sendMessage(
        msg.chat.id,
        "❌ Something went wrong. Please try again."
      );
    }
  },

  async handleNameInput(msg) {
    try {
      const chatId = msg.chat.id;

      if (!msg.text || msg.text.length < 2) {
        return bot.sendMessage(
          chatId,
          "❌ Please enter a valid name (at least 2 characters):"
        );
      }

      await db.updateUser(chatId, { name: msg.text.trim() });
      setState(chatId, { step: "get_phone" });
      bot.sendMessage(chatId, "📱 Now please share your phone number:");
    } catch (error) {
      console.error("Error in handleNameInput:", error);
      bot.sendMessage(
        msg.chat.id,
        "❌ Failed to save your name. Please try again:"
      );
    }
  },

  async handlePhoneInput(msg) {
    try {
      const chatId = msg.chat.id;

      // Validate phone format
      if (!/^\+?[\d\s\-()]{10,15}$/.test(msg.text)) {
        return bot.sendMessage(
          chatId,
          "❌ Invalid phone format. Please enter a valid phone number:\n" +
            "Examples: +1234567890, 123-456-7890, (123) 456-7890"
        );
      }

      await db.updateUser(chatId, { phone: msg.text.trim() });
      setState(chatId, { step: null });

      await bot.sendMessage(chatId, "✅ Registration complete!");

      // Proceed to property type selection
      require("./postController").askPropertyType(chatId);
    } catch (error) {
      console.error("Error in handlePhoneInput:", error);
      bot.sendMessage(
        msg.chat.id,
        "❌ Failed to save your phone. Please try again:"
      );
    }
  },
};
