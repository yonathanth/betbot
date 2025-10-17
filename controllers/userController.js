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

  async askForRentPostId(chatId) {
    try {
      await bot().sendMessage(chatId, "የተከራየውን ቤት Post ID ያስገቡ", {
        parse_mode: "HTML",
      });
      setState(chatId, { step: "waiting_rent_post_id" });
    } catch (error) {
      console.error("Error in askForRentPostId:", error);
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

        // Don't start registration flow automatically - wait for button click
        return;
      }

      // User is registered, just show main menu (don't start listing flow)
      await this.showMainMenu(chatId);
    } catch (error) {
      console.error("Error in startHandler:", error);
      bot().sendMessage(msg.chat.id, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async showGreeting(chatId) {
    try {
      const welcomeMessage = `
<b>🛖 ሰላም! ወደ ቤት ቦት እንኳን በደህና መጡ!</b>

ይህን ቦት በመጠቀም የመኖረያ ቤት፣ ቢሮ፣ መጋዘን እና ሌሎች ንብረቶችን ለሺዎች ያስተዋውቁ።

ለመጀመር ከታች ያለውን ቁልፍ ይጫኑ
      `;

      await bot().sendMessage(chatId, welcomeMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛖 ማስታወቂያ መልቀቅ ይጀምሩ",
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

  async handleStartListing(callback) {
    try {
      const chatId = callback.message.chat.id;
      const user = await db.getUser(chatId);

      bot().answerCallbackQuery(callback.id);

      // Check if user needs to complete registration
      if (!user || !user.name) {
        setState(chatId, { step: "get_name" });
        return bot().sendMessage(chatId, "እባክዎ ስምዎን ያስገቡ:");
      }

      if (!user.phone) {
        setState(chatId, { step: "get_phone" });
        return bot().sendMessage(chatId, "📱 እባክዎ የስልክ ቁጥርዎን ያስገቡ:");
      }

      // User is fully registered, start listing flow directly
      return this.askListingType(chatId);
    } catch (error) {
      console.error("Error in handleStartListing:", error);
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    }
  },

  async showMainMenu(chatId) {
    try {
      await bot().sendMessage(chatId, "🛖 ለመቀጠል እባክዎ ከታች ያለውን አንዱን ይምረጡ:", {
        reply_markup: {
          keyboard: [["🛖 ቤት ለማስተዋወቅ"], ["📋 ማስታወቂያዎቼ", "👤 አካውንት"]],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      });
    } catch (error) {
      console.error("Error showing main menu:", error);
    }
  },

  async handleStartPostingWithRegistrationCheck(chatId) {
    try {
      const user = await db.getUser(chatId);

      // Check if user is fully registered
      if (!user) {
        // Create user entry and start registration
        await db.createUser(chatId);
        await this.showGreeting(chatId);
        return;
      }

      if (!user.name) {
        setState(chatId, { step: "get_name" });
        return bot().sendMessage(chatId, "እባክዎ ስምዎን ያስገቡ:");
      }

      if (!user.phone) {
        setState(chatId, { step: "get_phone" });
        return bot().sendMessage(chatId, "📱 እባክዎ የስልክ ቁጥርዎን ያስገቡ:");
      }

      // User is fully registered, start listing flow
      return this.askListingType(chatId);
    } catch (error) {
      console.error("Error in handleStartPostingWithRegistrationCheck:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
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

      if (!msg.text || msg.text.length < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ስም ያስገቡ:");
      }

      await db.updateUser(chatId, { name: msg.text.trim() });
      setState(chatId, { step: "get_phone" });
      bot().sendMessage(chatId, "📱 አሁን እባክዎ የስልክ ቁጥርዎን ያስገቡ:");
    } catch (error) {
      console.error("Error in handleNameInput:", error);
      bot().sendMessage(msg.chat.id, "❌ ስምዎን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ:");
    }
  },

  async showMyAds(chatId) {
    try {
      const user = await db.getUser(chatId);
      if (!user) {
        return bot().sendMessage(chatId, "❌ እባክዎ በመጀመሪያ ይመዝገቡ። /start ይጫኑ");
      }

      const posts = await db.getUserPosts(chatId);

      if (!posts.length) {
        await bot().sendMessage(chatId, "📋 ምንም ማስታወቂያ አልተገኘም\n\n");

        // Return to main menu
        return this.showMainMenu(chatId);
      }
      const pageSize = 10;
      return this.renderMyAdsPage(chatId, posts, 1, pageSize);
    } catch (error) {
      console.error("Error in showMyAds:", error);
      bot().sendMessage(chatId, "❌ ማስታወቂያዎች ማምጣት አልተቻለም");
    }
  },

  async renderMyAdsPage(chatId, posts, page, pageSize) {
    const total = posts.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const slice = posts.slice(start, end);

    let message = `📋 <b>የእርስዎ ማስታወቂያዎች (${total})</b>\n`;
    message += `Page ${currentPage}/${totalPages}\n\n`;

    const preposts = parseInt(process.env.PREPOSTS) || 0;

    slice.forEach((post, idx) => {
      const statusEmoji = this.getStatusEmoji(post.status);
      const createdDate = new Date(post.created_at).toLocaleDateString("am-ET");
      const displayId = post.id + preposts;
      const num = start + idx + 1;

      message += `${num}. ${statusEmoji} <b>ID ${displayId}</b> - ${
        post.title || "አልታወቀም"
      }\n`;
      message += `   <b>አድራሻ - </b> ${post.location || "አልታወቀም"}\n`;
      message += `   <b>ዋጋ - </b> ${post.price || "አልታወቀም"}\n`;
      message += `   <b>እይታ - </b> ${post.total_clicks} ሰው ስልኮን አይቶታል\n`;
      message += `   ${createdDate}\n\n`;
    });

    const keyboard = [];
    const navRow = [];
    if (currentPage > 1) {
      navRow.push({
        text: "⬅️ Prev",
        callback_data: `my_ads_page_${currentPage - 1}`,
      });
    }
    if (currentPage < totalPages) {
      navRow.push({
        text: "Next ➡️",
        callback_data: `my_ads_page_${currentPage + 1}`,
      });
    }
    if (navRow.length) keyboard.push(navRow);

    keyboard.push([
      { text: "🛖 ቤቶ መከራየቱን ለማሳወቅ", callback_data: "ask_rent_post_id" },
    ]);

    keyboard.push([
      { text: "⤴️ ወደ ዋና ማውጫ ይመለሱ", callback_data: "back_to_main_menu" },
    ]);

    await bot().sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  },

  async handleMyAdsPagination(callback) {
    try {
      const chatId = callback.message.chat.id;
      const parts = callback.data.split("_"); // my_ads_page_2
      const page = parseInt(parts[3]) || 1;

      bot().answerCallbackQuery(callback.id);

      const posts = await db.getUserPosts(chatId);
      if (!posts.length) {
        return bot().editMessageText("📋 ምንም ማስታወቂያ አልተገኘም", {
          chat_id: chatId,
          message_id: callback.message.message_id,
        });
      }

      const pageSize = 10;
      const total = posts.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.min(Math.max(1, page), totalPages);
      const start = (currentPage - 1) * pageSize;
      const end = Math.min(start + pageSize, total);
      const slice = posts.slice(start, end);

      let message = `📋 <b>የእርስዎ ማስታወቂያዎች (${total})</b>\n`;
      message += `📄 Page ${currentPage}/${totalPages}\n\n`;

      const preposts = parseInt(process.env.PREPOSTS) || 0;
      slice.forEach((post, idx) => {
        const statusEmoji = this.getStatusEmoji(post.status);
        const createdDate = new Date(post.created_at).toLocaleDateString(
          "am-ET"
        );
        const displayId = post.id + preposts;
        const num = start + idx + 1;

        message += `${num}. ${statusEmoji} <b>ID ${displayId}</b> - ${
          post.title || "አልታወቀም"
        }\n`;
        message += `   <b>አድራሻ -</b> ${post.location || "አልታወቀም"}\n`;
        message += `   <b>ዋጋ - </b> ${post.price || "አልታወቀም"}\n`;
        message += `   <b>እይታ - </b> ${post.total_clicks} ሰው ስልኮን አይቶታል\n`;
        message += `   ${createdDate}\n\n`;
      });

      const keyboard = [];
      const navRow = [];
      if (currentPage > 1) {
        navRow.push({
          text: "⬅️ Prev",
          callback_data: `my_ads_page_${currentPage - 1}`,
        });
      }
      if (currentPage < totalPages) {
        navRow.push({
          text: "Next ➡️",
          callback_data: `my_ads_page_${currentPage + 1}`,
        });
      }
      if (navRow.length) keyboard.push(navRow);
      keyboard.push([
        { text: "🛖 ቤቶ መከራየቱን ለማሳወቅ", callback_data: "ask_rent_post_id" },
      ]);

      keyboard.push([
        { text: "⤴️ ወደ ዋና ማውጫ ይመለሱ", callback_data: "back_to_main_menu" },
      ]);

      await bot().editMessageText(message, {
        chat_id: chatId,
        message_id: callback.message.message_id,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      });
    } catch (error) {
      console.error("Error in handleMyAdsPagination:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (e) {}
    }
  },

  getStatusEmoji(status) {
    switch (status) {
      case "pending":
        return "⏳";
      case "approved":
        return "🟢";
      case "published":
        return "✅";
      case "rejected":
        return "❌";
      case "rented":
        return "🛖";
      default:
        return "❓";
    }
  },

  async showAccount(chatId) {
    try {
      const user = await db.getUser(chatId);
      if (!user) {
        return bot().sendMessage(chatId, "❌ እባክዎ በመጀመሪያ ይመዝገቡ። /start ይጫኑ");
      }

      const accountMessage =
        ` <b>የእርስዎ አካውንት</b>\n\n` +
        ` <b>ስም:</b> ${user.name || "Not set"}\n` +
        ` <b>ስልክ ቁጥር:</b> ${user.phone || "Not set"}\n` +
        ` <b>አይነት:</b> ${user.user_type || "Not set"}\n` +
        ` <b>የተመዘገቡበት ቀን:</b> ${new Date(user.created_at).toLocaleDateString(
          "am-ET"
        )}`;

      await bot().sendMessage(chatId, accountMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📝 ስምዎን ይቀይሩ",
                callback_data: "edit_account_name",
              },
              {
                text: "📱 ስልክዎን ይቀይሩ",
                callback_data: "edit_account_phone",
              },
            ],
            [
              {
                text: "⤴️ ወደ ዋና ማውጫይመለሱ",
                callback_data: "back_to_main_menu",
              },
            ],
          ],
        },
      });
    } catch (error) {
      console.error("Error in showAccount:", error);
      bot().sendMessage(chatId, "❌ አካውንት መረጃ ማምጣት አልተቻለም");
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

      // Registration complete - show main menu only
      await this.showMainMenu(chatId);
    } catch (error) {
      console.error("Error in handlePhoneInput:", error);
      bot().sendMessage(
        msg.chat.id,
        "❌ የስልክ ቁጥርዎን ማስቀመጥ አልተቻለም እባክዎ እንደገና ይሞክሩ:"
      );
    }
  },

  async handleEditAccountName(callback) {
    try {
      const chatId = callback.message.chat.id;

      bot().answerCallbackQuery(callback.id);
      setState(chatId, { step: "edit_account_name" });

      await bot().sendMessage(chatId, "📝 አዲስ ስምዎን ያስገቡ:", {
        reply_markup: {
          keyboard: [["🚫 ይቅር"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } catch (error) {
      console.error("Error in handleEditAccountName:", error);
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    }
  },

  async handleEditAccountPhone(callback) {
    try {
      const chatId = callback.message.chat.id;

      bot().answerCallbackQuery(callback.id);
      setState(chatId, { step: "edit_account_phone" });

      await bot().sendMessage(chatId, "📱 አዲስ ስልክ ቁጥርዎን ያስገቡ:", {
        reply_markup: {
          keyboard: [["🚫 ይቅር"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    } catch (error) {
      console.error("Error in handleEditAccountPhone:", error);
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    }
  },

  async handleAccountEditInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (msg.text === "🚫 ይቅር") {
        clearState(chatId);
        await this.showMainMenu(chatId);
        return this.showAccount(chatId);
      }

      if (state.step === "edit_account_name") {
        if (!msg.text || msg.text.trim().length < 2) {
          return bot().sendMessage(
            chatId,
            "❌ እባክዎ ትክክለኛ ስም ያስገቡ (ቢያንስ 2 ፊደሎች):"
          );
        }

        await db.updateUser(chatId, { name: msg.text.trim() });
        clearState(chatId);

        await bot().sendMessage(chatId, "✅ ስምዎ በተሳካ ሁኔታ ተቀይሯል!");

        // Show updated account info briefly, then return to main menu
        await this.showAccount(chatId);
        setTimeout(() => {
          this.showMainMenu(chatId);
        }, 3000);
      } else if (state.step === "edit_account_phone") {
        // Validate phone format
        if (
          !/^(\+251|251|0)?[79]\d{8}$/.test(msg.text.replace(/[\s\-()]/g, ""))
        ) {
          return bot().sendMessage(
            chatId,
            "❌ ትክክለኛ የስልክ ቁጥር አይደለም። እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ:\n" +
              "ለምሳሌ: 0911.. / 0711..0711.."
          );
        }

        await db.updateUser(chatId, { phone: msg.text.trim() });
        clearState(chatId);

        await bot().sendMessage(chatId, "✅ ስልክ ቁጥርዎ በተሳካ ሁኔታ ተቀይሯል!");

        // Show updated account info briefly, then return to main menu
        await this.showAccount(chatId);
        setTimeout(() => {
          this.showMainMenu(chatId);
        }, 3000);
      }
    } catch (error) {
      console.error("Error in handleAccountEditInput:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleRefreshMyAds(callback) {
    try {
      const chatId = callback.message.chat.id;
      bot().answerCallbackQuery(callback.id);
      return this.showMyAds(chatId);
    } catch (error) {
      console.error("Error in handleRefreshMyAds:", error);
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    }
  },

  async handleMarkAsRented(callback) {
    try {
      const chatId = callback.message.chat.id;
      const postId = callback.data.split("_")[2]; // mark_rented_123

      bot().answerCallbackQuery(callback.id);

      // Get the post and verify ownership
      const post = await db.getPost(postId);
      if (!post) {
        return bot().sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
      }

      if (post.telegram_id !== chatId) {
        return bot().sendMessage(chatId, "❌ ይህ የርስዎ ማስታወቂያ አይደለም!");
      }

      // Update post status to rented
      await db.updatePostStatus(postId, "rented");

      // Mark the post as rented on the channel
      const channelService = require("../services/channelService");
      const channelUpdated = await channelService.markPostAsRentedOnChannel(
        postId
      );

      let successMessage =
        `✅ <b>ተከራይቷል!</b>\n\n` + `Post #${postId} ተከራይቷል በመባል ተመዝግቧል።\n\n`;

      if (channelUpdated) {
        successMessage += `🎯 <b>ማስታወቂያዎ በቻናላችንም ላይ "ተከራይቷል" በመባል ታርሟል</b>\n\n`;
      } else {
        successMessage += `ℹ️ ማስታወቂያዎንን በቻናላችንላችን ላይ ማረም አልተቻለም።\n\n`;
      }

      await bot().sendMessage(chatId, successMessage, {
        parse_mode: "HTML",
      });

      // Return to main menu
      setTimeout(() => {
        this.showMainMenu(chatId);
      }, 1000);
    } catch (error) {
      console.error("Error in handleMarkAsRented:", error);
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
      bot().sendMessage(chatId, "❌ ማስታወቂያ ማረም አልተቻለም");
    }
  },

  async handleRentPostIdInput(msg) {
    try {
      const chatId = msg.chat.id;
      const displayPostId = parseInt(msg.text);

      if (!displayPostId || displayPostId < 1) {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ ትክክለኛ Post ID ያስገቡ (ቁጥር ብቻ):\nለለምሳሌ: 123"
        );
      }

      // Convert display ID to database ID
      const preposts = parseInt(process.env.PREPOSTS) || 0;
      const databasePostId = displayPostId - preposts;

      if (databasePostId < 1) {
        return bot().sendMessage(
          chatId,
          "❌ ትክክለኛ Post ID አይደለም። እባክዎ ትክክለኛ ቁጥር ያስገቡ።"
        );
      }

      // Get the post and verify ownership
      const post = await db.getPost(databasePostId);
      if (!post) {
        return bot().sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
      }

      if (post.telegram_id !== chatId) {
        return bot().sendMessage(chatId, "❌ የራስዎን  ማስታወቂያ ብቻ ማረም ይችላሉ!");
      }

      // Check if post is published (can only mark published posts as rented)
      if (post.status !== "published") {
        let statusMessage = "";
        switch (post.status) {
          case "pending":
            statusMessage = "ይህ ማስታወቂያ ገና አልፀደቀም። ከፀደቀ በኋላ ብቻ ተከራይቷል ማለት ይችላሉ።";
            break;
          case "approved":
            statusMessage =
              "ይህ ማስታወቂያ ገና ወደ ቻናላችን አልተለቀቀም። ከተለቀቀ በኋላ ብቻ ተከራይቷል ማለት ይችላሉ።";
            break;
          case "rejected":
            statusMessage = "ይህ ማስታወቂያ ተቀባይነት አላገኘም።";
            break;
          default:
            statusMessage = "ይህ ማስታወቂያ አሁን ማረም አይቻልም።";
        }

        return bot().sendMessage(chatId, `❌ ${statusMessage}`);
      }

      // Show post preview and rent marking option
      await this.showRentMarkingPreview(chatId, post);
    } catch (error) {
      console.error("Error in handleRentPostIdInput:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async showRentMarkingPreview(chatId, post) {
    try {
      const channelService = require("../services/channelService");

      // Format post as it appears on channel (without photos)
      const postText = channelService.formatPostForChannel(post);

      const previewMessage =
        `📋 <b>ይህ ማስታወቂያ ተከራይቷል ለማለት ይፈልጋሉ?</b>\n\n` +
        `<b>Post #${post.id}</b>\n\n` +
        `──────────────────\n\n` +
        postText +
        `\n\n──────────────────\n\n` +
        `⚠️ <b>ማሳሰቢያ:</b> ይህ ማስታወቂያ በቻናል ላይ "ተከራይቷል" በመባል ይታረማል።`;

      await bot().sendMessage(chatId, previewMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ አዎ፣ ተከራይቷል",
                callback_data: `mark_rented_${post.id}`,
              },
            ],
            [
              {
                text: "❌ ይቅር",
                callback_data: "refresh_my_ads",
              },
            ],
          ],
        },
      });

      // Clear state
      clearState(chatId);
    } catch (error) {
      console.error("Error in showRentMarkingPreview:", error);
      bot().sendMessage(chatId, "❌ ማስታወቂያ ማሳየት አልተቻለም");
    }
  },

  // Tenant registration handlers (for REG=TRUE contact flow)
  async handleTenantNameInput(msg) {
    const chatId = msg.chat.id;
    try {
      const name = msg.text?.trim();

      if (!name || name.length < 2) {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ ትክክለኛ ስም ያስገቡ (ቢያንስ 2 ፊደሎች):"
        );
      }

      // Update user name and set state for phone input
      await db.updateUser(chatId, { name: name, user_type: "tenant" });
      setState(chatId, {
        step: "tenant_get_phone",
        postId: getState(chatId).postId,
        isContactRequest: true,
      });

      await bot().sendMessage(
        chatId,
        "✅ጥሩ!\n\n📱 በመጨረሻም እባክዎ የስልክ ቁጥርዎን ያስገቡ:\n" + "ለምሳሌ: 0911.. / 0711.."
      );
    } catch (error) {
      console.error("Error in handleTenantNameInput:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleTenantPhoneInput(msg) {
    const chatId = msg.chat.id;
    try {
      const phone = msg.text?.trim();
      const state = getState(chatId);

      // Validate phone format
      if (!/^(\+251|251|0)?[79]\d{8}$/.test(phone.replace(/[\s\-()]/g, ""))) {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ በትክክል የስልክ ቁጥሮን ያስገቡ:\n" + "ለምሳሌ: 0911.. / 0711.."
        );
      }

      // Update user phone
      await db.updateUser(chatId, { phone: phone });

      // Clear state
      clearState(chatId);

      await bot().sendMessage(
        chatId,
        "✅ <b>እናመሰግናለን!</b>\n\n" + "አሁን መረጃውን እየላክንሎት ነው...",
        { parse_mode: "HTML" }
      );

      // Now show the broker info for the stored post
      if (state && state.postId) {
        const post = await db.getPost(state.postId);
        if (post) {
          await require("../services/channelService").sendCombinedContactMessage(
            chatId,
            post
          );
        }
      }
    } catch (error) {
      console.error("Error in handleTenantPhoneInput:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  stopHandler(msg) {
    try {
      const chatId = msg.chat.id;
      clearState(chatId);
      bot().sendMessage(chatId, "🛑 ውይይቱ ተቋርጧል። እንደገና ለመጀመር /start ይጫኑ።", {
        reply_markup: {
          remove_keyboard: true,
        },
      });
    } catch (error) {
      console.error("Error in stopHandler:", error);
      bot().sendMessage(msg.chat.id, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },
};
