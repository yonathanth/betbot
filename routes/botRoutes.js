const { bot, getState } = require("../services/botService");
const userController = require("../controllers/userController");
const postController = require("../controllers/postController");
const adminController = require("../controllers/adminController");

function setupRoutes() {
  // Text commands
  bot.onText(/\/start/, userController.startHandler);
  bot.onText(/\/admin/, adminController.handleAdminCommand);
  bot.onText(/\/stop/, userController.stopHandler);

  // Message handling based on user state
  bot.on("message", (msg) => {
    // Skip if it's a command
    if (msg.text && msg.text.startsWith("/")) {
      return;
    }

    const chatId = msg.chat.id;
    const state = getState(chatId);

    try {
      switch (state?.step) {
        // User registration flow
        case "get_name":
          return userController.handleNameInput(msg);
        case "get_phone":
          return userController.handlePhoneInput(msg);

        // Post creation flow
        case "get_title":
          return postController.handleTitleInput(msg);
        case "get_location":
          return postController.handleLocationInput(msg);
        case "get_price":
          return postController.handlePriceInput(msg);
        case "get_contact":
          return postController.handleContactInput(msg);
        case "get_description":
          return postController.handleDescriptionInput(msg);

        // Admin editing flow
        case "admin_edit_title":
        case "admin_edit_location":
        case "admin_edit_price":
        case "admin_edit_contact":
        case "admin_edit_description":
          return adminController.handleEditInput(msg);

        default:
          // No active state - might be a new user
          if (msg.text && !msg.text.startsWith("/")) {
            bot.sendMessage(
              chatId,
              "👋 Hello! Use /start to begin listing your property, or /admin for admin access."
            );
          }
      }
    } catch (error) {
      console.error("Error handling message:", error);
      bot.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again or use /start to restart."
      );
    }
  });

  // Callback query handling (button clicks)
  bot.on("callback_query", async (callback) => {
    const msg = callback.message;
    const data = callback.data;

    try {
      // Property type selection
      if (data.startsWith("property_")) {
        return postController.handlePropertySelection(msg, data);
      }

      // Admin panel actions
      else if (data === "admin_pending") {
        return adminController.showPendingPosts(callback);
      } else if (data === "admin_stats") {
        // Show updated stats
        const stats = await require("../services/dbService").getStats();
        const message =
          `📊 <b>Current Statistics:</b>\n\n` +
          `👥 Total Users: ${stats.totalUsers}\n` +
          `📋 Total Posts: ${stats.totalPosts}\n` +
          `⏳ Pending Posts: ${stats.pendingPosts}\n` +
          `✅ Published Posts: ${stats.publishedPosts}`;

        try {
          await bot.editMessageText(message, {
            chat_id: callback.message.chat.id,
            message_id: callback.message.message_id,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "📋 Pending Posts", callback_data: "admin_pending" }],
                [{ text: "🔄 Refresh Stats", callback_data: "admin_stats" }],
              ],
            },
          });
          return bot.answerCallbackQuery(callback.id, {
            text: "Stats updated!",
          });
        } catch (editError) {
          // If editing fails (likely because content is the same), just acknowledge the callback
          console.log("Stats unchanged, no edit needed");
          return bot.answerCallbackQuery(callback.id, {
            text: "Stats are up to date!",
          });
        }
      }

      // Post approval/rejection
      else if (data.startsWith("approve_") || data.startsWith("reject_")) {
        return adminController.handlePostApproval(callback);
      }

      // Post editing
      else if (
        data.startsWith("edit_") &&
        !data.includes("field") &&
        !data.includes("done")
      ) {
        return adminController.handleEditPost(callback);
      } else if (data.startsWith("edit_field_")) {
        return adminController.handleEditField(callback);
      } else if (data.startsWith("edit_done_")) {
        return adminController.handleEditDone(callback);
      }

      // Unknown callback
      else {
        bot.answerCallbackQuery(callback.id, { text: "Unknown action!" });
      }
    } catch (error) {
      console.error("Error handling callback query:", error);
      bot.answerCallbackQuery(callback.id, {
        text: "Error processing request!",
      });
    }
  });

  // Error handling for the bot
  bot.on("polling_error", (error) => {
    console.error("Polling error:", error);
  });

  bot.on("error", (error) => {
    console.error("Bot error:", error);
  });
}

module.exports = { setupRoutes };
