const { bot, setState, getState } = require("../services/botService");
const db = require("../services/dbService");
const channelService = require("../services/channelService");

// Helper function for notifying admins
async function notifyAdminsNewPost(chatId) {
  try {
    const user = await db.getUser(chatId);
    const message =
      `🔔 <b>New Property Listing Submitted</b>\n\n` +
      `👤 <b>User:</b> ${user.name}\n` +
      `📱 <b>Phone:</b> ${user.phone}\n` +
      `🆔 <b>Telegram ID:</b> ${chatId}\n\n` +
      `Use /admin to review pending listings.`;

    await channelService.notifyAdmins(null, message);
  } catch (error) {
    console.error("Error notifying admins:", error);
  }
}

module.exports = {
  async askPropertyType(chatId) {
    try {
      await bot.sendMessage(
        chatId,
        "🏡 What type of property are you listing?",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🏠 Residential",
                  callback_data: "property_residential",
                },
              ],
              [{ text: "🏢 Commercial", callback_data: "property_commercial" }],
            ],
          },
        }
      );
      setState(chatId, { step: "awaiting_property_type" });
    } catch (error) {
      console.error("Error in askPropertyType:", error);
      bot.sendMessage(
        chatId,
        "❌ Something went wrong. Please try /start again."
      );
    }
  },

  async handlePropertySelection(msg, propertyType) {
    const chatId = msg.chat.id;
    try {
      const type = propertyType.split("_")[1]; // residential/commercial

      // Create initial post
      const postId = await db.createPost(chatId, { property_type: type });

      await bot.editMessageText(
        `✅ Selected: ${type.charAt(0).toUpperCase() + type.slice(1)} property`,
        {
          chat_id: chatId,
          message_id: msg.message_id,
        }
      );

      setState(chatId, { step: "get_title", postId });
      await bot.sendMessage(
        chatId,
        "📋 Please provide a title for your property listing:"
      );
    } catch (error) {
      console.error("Post creation failed:", error);
      await bot.sendMessage(
        chatId,
        "❌ Failed to save selection. Please try again."
      );
    }
  },

  async handleTitleInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!msg.text || msg.text.length < 5) {
        return bot.sendMessage(
          chatId,
          "❌ Please enter a more descriptive title (at least 5 characters):"
        );
      }

      await db.updatePost(chatId, { title: msg.text.trim() });
      setState(chatId, { step: "get_location" });
      await bot.sendMessage(
        chatId,
        "📍 Where is the property located? (City, area, or full address):"
      );
    } catch (error) {
      console.error("Error in handleTitleInput:", error);
      bot.sendMessage(chatId, "❌ Failed to save title. Please try again:");
    }
  },

  async handleLocationInput(msg) {
    try {
      const chatId = msg.chat.id;

      if (!msg.text || msg.text.length < 3) {
        return bot.sendMessage(chatId, "❌ Please enter a valid location:");
      }

      await db.updatePost(chatId, { location: msg.text.trim() });
      setState(chatId, { step: "get_price" });
      await bot.sendMessage(
        chatId,
        "💰 What's the price? (e.g., $500,000, $2000/month, Negotiable):"
      );
    } catch (error) {
      console.error("Error in handleLocationInput:", error);
      bot.sendMessage(chatId, "❌ Failed to save location. Please try again:");
    }
  },

  async handlePriceInput(msg) {
    try {
      const chatId = msg.chat.id;

      if (!msg.text || msg.text.length < 2) {
        return bot.sendMessage(chatId, "❌ Please enter a valid price:");
      }

      await db.updatePost(chatId, { price: msg.text.trim() });
      setState(chatId, { step: "get_contact" });
      await bot.sendMessage(
        chatId,
        "📞 Any additional contact information? (Optional - your registered phone will be shown)\n" +
          "You can add email, WhatsApp, or other contact methods, or type 'skip' to continue:"
      );
    } catch (error) {
      console.error("Error in handlePriceInput:", error);
      bot.sendMessage(chatId, "❌ Failed to save price. Please try again:");
    }
  },

  async handleContactInput(msg) {
    try {
      const chatId = msg.chat.id;

      if (msg.text && msg.text.toLowerCase() !== "skip") {
        await db.updatePost(chatId, { contact_info: msg.text.trim() });
      }

      setState(chatId, { step: "get_description" });
      await bot.sendMessage(
        chatId,
        "✍️ Finally, please provide a detailed description of your property:\n" +
          "(Include features, condition, amenities, etc.)"
      );
    } catch (error) {
      console.error("Error in handleContactInput:", error);
      bot.sendMessage(
        chatId,
        "❌ Failed to save contact info. Please try again:"
      );
    }
  },

  async handleDescriptionInput(msg) {
    try {
      const chatId = msg.chat.id;

      if (!msg.text || msg.text.length < 20) {
        return bot.sendMessage(
          chatId,
          "❌ Please provide a more detailed description (at least 20 characters):"
        );
      }

      const maxLength = parseInt(process.env.MAX_DESCRIPTION_LENGTH) || 4000;
      if (msg.text.length > maxLength) {
        return bot.sendMessage(
          chatId,
          `❌ Description is too long. Please keep it under ${maxLength} characters.`
        );
      }

      await db.updatePost(chatId, { description: msg.text.trim() });
      setState(chatId, { step: null });

      await bot.sendMessage(
        chatId,
        "✅ Your property listing has been submitted for review!\n\n" +
          "📋 Our admins will review and approve your listing shortly.\n" +
          "📢 Once approved, it will be posted to our property channel.\n\n" +
          "Thank you for using PropertyBot! 🏡"
      );

      // Notify admins
      notifyAdminsNewPost(chatId);
    } catch (error) {
      console.error("Error in handleDescriptionInput:", error);
      bot.sendMessage(
        chatId,
        "❌ Failed to save description. Please try again:"
      );
    }
  },
};
