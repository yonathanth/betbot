const {
  getBot,
  getState,
  setState,
  clearState,
} = require("../services/botService");
const { createUser, getUser } = require("../services/dbService");
const db = require("../services/dbService");

// Function to get bot instance
const bot = () => getBot();

module.exports = {
  async stopHandler(msg) {
    try {
      const chatId = msg.chat.id;
      // Clear user state
      setState(chatId, { step: null });

      await bot().sendMessage(
        chatId,
        "🛑 <b>ውይይቱ ተቋርጧል</b>\n\n" +
          "• /start - ቤቶን ለማስተዋወቅ \n" +
          "• /stop - ውይይቱን ለማቆም\n\n" +
          "ቤቶን ለማስተዋወቅ ዝግጁ ሲሆኑ /start ይንኩ! 🛖 ",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Error in stopHandler:", error);
      bot().sendMessage(msg.chat.id, "❌ይቅርታ! እባክዎ /start ተጠቅመው እንደገና ይሞክሩ።");
    }
  },

  async startHandler(msg) {
    try {
      const chatId = msg.chat.id;
      const user = await db.getUser(chatId);

      // Show greeting for new users or users without complete registration
      if (!user || !user.name || !user.phone) {
        await this.showGreeting(chatId);

        if (!user) {
          await db.createUser(chatId);
        }

        if (!user || !user.name) {
          setState(chatId, { step: "get_name" });
          return bot().sendMessage(chatId, "እባክዎ ስምዎን ያስገቡ:");
        }

        if (!user.phone) {
          setState(chatId, { step: "get_phone" });
          return bot().sendMessage(chatId, "📱 እባክዎ የስልክ ቁጥርዎን ያስገቡ:");
        }
      }

      // User is registered, ask for listing type
      return this.askListingType(chatId);
    } catch (error) {
      console.error("Error in startHandler:", error);
      bot().sendMessage(msg.chat.id, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async showGreeting(chatId) {
    try {
      const welcomeMessage = `
<b> 🛖 ሰላም! ወደ ቤት ቦት እንኳን በደህና መጡ! </b>


🔹 <b>ቤት ወይም የስራ ቦታ ለማከራየት</b> - ይፈልጋሉ?
🚀 <b>በቀላሉ ለሺዎች ይድረሱ:</b>


 <b>ለመጀመር የሚቀጥለውን ቁልፍ ይምረጡ!</b>
      `;

      await bot().sendMessage(chatId, welcomeMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛖 ለመጀመር ይህን ይጫኑ",
                callback_data: "start_listing",
              },
            ],
          ],
        },
      });
    } catch (error) {
      console.error("Error showing greeting:", error);
      await bot().sendMessage(chatId, "ሰላም! ለመጀመር /start ይጫኑ።");
    }
  },

  async askListingType(chatId) {
    try {
      const user = await db.getUser(chatId);

      // Check if user already has a user_type (already asked before)
      if (user && user.user_type) {
        // Skip asking and go straight to property type
        setState(chatId, { listing_type: "rent" });
        return require("./postController").askPropertyType(chatId);
      }

      await bot().sendMessage(chatId, "👤 የእርስዎ ድርሻ ምንድ ነው?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛖  ደላላ",
                callback_data: "listing_type_broker",
              },
            ],
            [
              {
                text: "🛖  ባለቤት / አከራይ",
                callback_data: "listing_type_owner",
              },
            ],
          ],
        },
      });
      setState(chatId, { step: "awaiting_listing_type" });
    } catch (error) {
      console.error("Error in askListingType:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ /start ተጠቅመው እንደገና ይሞክሩ።");
    }
  },

  async handleListingTypeSelection(msg, listingType) {
    const chatId = msg.chat.id;
    try {
      const userType = listingType.split("_")[2]; // broker/owner
      const typeText = userType === "broker" ? "ደላላ" : "አከራይ";

      await bot().editMessageText(`👤 ${typeText}`, {
        chat_id: chatId,
        message_id: msg.message_id,
      });

      // Save user type and set listing type to rent (bot is only for rent)
      await db.updateUser(chatId, { user_type: userType });
      setState(chatId, { listing_type: "rent" });

      // Now ask for property type
      return require("./postController").askPropertyType(chatId);
    } catch (error) {
      console.error("Error in handleListingTypeSelection:", error);
      await bot().sendMessage(
        chatId,
        "❌ ምርጫዎን ማስቀመጥ አልተቻለም፣ እባክዎ እንደገና ይሞክሩ።"
      );
    }
  },

  async handleNameInput(msg) {
    try {
      const chatId = msg.chat.id;

      if (!msg.text || msg.text.length < 2) {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ ትክክለኛ ስም ያስገቡ (ቢያንስ 2 ፊደሎች):"
        );
      }

      await db.updateUser(chatId, { name: msg.text.trim() });
      setState(chatId, { step: "get_phone" });
      bot().sendMessage(chatId, "📱 አሁን እባክዎ የስልክ ቁጥርዎን ያስገቡ:");
    } catch (error) {
      console.error("Error in handleNameInput:", error);
      bot().sendMessage(msg.chat.id, "❌ ስምዎን ማስቀመጥ ተሳንቶአል። እባክዎ እንደገና ይሞክሩ:");
    }
  },

  async handlePhoneInput(msg) {
    try {
      const chatId = msg.chat.id;

      // Validate phone format - accepting Ethiopian format
      if (
        !/^(\+251|251|0)?[79]\d{8}$/.test(msg.text.replace(/[\s\-()]/g, ""))
      ) {
        return bot().sendMessage(
          chatId,
          "❌ ትክክለኛ የስልክ ቁጥር አይደለም። እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ:\n" +
            "ምሳሌ: 0911234567"
        );
      }

      await db.updateUser(chatId, { phone: msg.text.trim() });
      setState(chatId, { step: null });

      // Don't show registration complete, just continue
      return this.askListingType(chatId);
    } catch (error) {
      console.error("Error in handlePhoneInput:", error);
      bot().sendMessage(
        msg.chat.id,
        "❌ የስልክ ቁጥርዎን ማስቀመጥ አልተቻለም እባክዎ እንደገና ይሞክሩ:"
      );
    }
  },
};
