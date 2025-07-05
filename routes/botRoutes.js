const { getBot, getState } = require("../services/botService");
const userController = require("../controllers/userController");
const postController = require("../controllers/postController");
const adminController = require("../controllers/adminController");

async function handleCallbackQuery(bot, query, handler) {
  try {
    // Execute the handler first
    await handler(query);

    // Then try to answer the callback query
    try {
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      if (
        error.code === "ETELEGRAM" &&
        error.response?.body?.description?.includes("query is too old")
      ) {
        console.log("Ignoring expired callback query:", query.id);
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error("Error handling callback query:", error);

    // Try to notify the user about the error
    try {
      await bot.answerCallbackQuery(query.id, {
        text: "⚠️ An error occurred. Please try again.",
        show_alert: true,
      });
    } catch (cbError) {
      // If this fails too, just log it
      if (!cbError.response?.body?.description?.includes("query is too old")) {
        console.error("Failed to send error callback:", cbError);
      }
    }
  }
}

function setupRoutes() {
  console.log("🛣️ Setting up bot routes...");

  const bot = getBot();

  if (!bot) {
    throw new Error("Bot not initialized! Call initializeBot() first.");
  }

  // Text commands
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const parameter = match[1];

    // Handle deep link for contact requests
    if (parameter && parameter.startsWith("contact_")) {
      const postId = parameter.split("_")[1];

      try {
        // Get post details
        const post = await require("../services/dbService").getPost(postId);
        if (post) {
          // Record the click
          await require("../services/dbService").recordClick(
            postId,
            msg.from.id,
            "contact"
          );

          // Send contact info privately
          await require("../services/channelService").sendContactInfoPrivately(
            msg.from.id,
            post
          );

          // Send welcome message too
          await bot.sendMessage(
            chatId,
            "🎉 እንኳን ወደ ቤት ቦት በደህና መጡ!\n\n" + "ከላይ የተላከው የደላላ/አከራዩ መረጃ ነው።",
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "🛖  ወደ ቻናሉ መመለስ",
                      url: `https://t.me/c/${process.env.CHANNEL_ID.replace(
                        "-100",
                        ""
                      )}`,
                    },
                  ],
                  [
                    {
                      text: "➕ የራሶን ቤት ለማስታወቅ",
                      callback_data: "start_my_listing",
                    },
                  ],
                ],
              },
            }
          );
        } else {
          await bot.sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
        }
      } catch (error) {
        console.error("Error handling contact deep link:", error);
        await bot.sendMessage(chatId, "❌ ስህተት ተከስቷል!");
      }

      return;
    }

    // Regular start command handling
    await require("../controllers/userController").startHandler(msg);
  });

  bot.onText(/\/start$/, async (msg) => {
    await require("../controllers/userController").startHandler(msg);
  });

  bot.onText(/\/admin/, (msg) => {
    try {
      adminController.handleAdminCommand(msg);
    } catch (error) {
      console.error("Error in /admin command:", error);
      bot.sendMessage(msg.chat.id, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  });

  bot.onText(/\/stop/, (msg) => {
    try {
      userController.stopHandler(msg);
    } catch (error) {
      console.error("Error in /stop command:", error);
      bot.sendMessage(msg.chat.id, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  });

  // Message handling based on user state
  bot.on("message", (msg) => {
    try {
      // Skip if it's a command
      if (msg.text && msg.text.startsWith("/")) {
        return;
      }

      const chatId = msg.chat.id;
      const state = getState(chatId);

      // Handle photo uploads - including media groups
      if (
        (msg.photo ||
          (msg.document &&
            msg.document.mime_type &&
            msg.document.mime_type.startsWith("image/"))) &&
        state?.step === "get_photos"
      ) {
        // If this is part of a media group, handle it specially
        if (msg.media_group_id) {
          return postController.handleMediaGroupPhoto(msg);
        } else {
          return postController.handlePhotoUpload(msg);
        }
      }

      switch (state?.step) {
        // User registration flow
        case "get_name":
          return userController.handleNameInput(msg);
        case "get_phone":
          return userController.handlePhoneInput(msg);

        // Post creation flow - Enhanced
        case "get_rooms_count":
          return postController.handleRoomsCount(msg);
        case "get_villa_type_other":
          return postController.handleVillaTypeOther(msg);
        case "get_floor":
          return postController.handleFloorInput(msg);
        case "get_bedrooms":
          return postController.handleBedroomsInput(msg);
        case "get_bathrooms":
          return postController.handleBathroomsInput(msg);
        case "get_property_size":
          return postController.handlePropertySizeInput(msg);
        case "get_main_location_other":
          return postController.handleMainLocationOther(msg);
        case "get_area_location":
          return postController.handleAreaLocationInput(msg);
        case "get_price":
          return postController.handlePriceInput(msg);
        case "get_custom_contact":
          return userController.handleCustomContactInput(msg);
        case "get_nickname":
          return postController.handleNicknameInput(msg);
        case "get_description":
          return postController.handleDescriptionInput(msg);
        case "get_platform_link":
          return postController.handlePlatformLinkInput(msg);
        case "get_main_location":
          return postController.handleMainLocationInput(msg);

        // Admin editing flow - legacy cases (removed - now handled by comprehensive system)
        case "admin_get_post_id":
          return adminController.handlePostStatsInput(msg);

        // Admin posting flow
        case "admin_post_name":
        case "admin_post_phone":
          return adminController.handleAdminPostInput(msg);

        // Admin rejection reason
        case "admin_rejection_reason":
          return adminController.handleRejectionReasonInput(msg);

        // Admin edit field inputs
        case "admin_edit_title":
        case "admin_edit_location":
        case "admin_edit_price":
        case "admin_edit_contact_info":
        case "admin_edit_display_name":
        case "admin_edit_description":
        case "admin_edit_rooms_count":
        case "admin_edit_villa_type_other":
        case "admin_edit_floor":
        case "admin_edit_bedrooms":
        case "admin_edit_bathrooms":
        case "admin_edit_property_size":
        case "admin_edit_platform_link":
          return adminController.handleEditInput(msg);

        default:
          // No active state - might be a new user
          if (msg.text && !msg.text.startsWith("/")) {
            // Show greeting for any text message
            return userController.showGreeting(msg.chat.id);
          }
      }
    } catch (error) {
      console.error("Error handling message:", error);
      try {
        bot.sendMessage(
          msg.chat.id,
          "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ ወይም /start ተጠቅመው እንደገና ይጀምሩ።"
        );
      } catch (sendError) {
        console.error("Failed to send error message:", sendError);
      }
    }
  });

  // Callback query handling (button clicks)
  bot.on("callback_query", async (query) => {
    const data = query.data;
    const msg = query.message;

    // Greeting flow
    if (data === "start_listing") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.askListingType(msg.chat.id);
      });
    }

    // Listing type selection (broker/owner)
    else if (data.startsWith("listing_type_")) {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleListingTypeSelection(msg, data);
      });
    }

    // Property type selection
    else if (data.startsWith("property_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handlePropertySelection(msg, data);
      });
    }

    // Property title selection
    else if (data.startsWith("title_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handlePropertyTitleSelection(msg, data);
      });
    }

    // Admin edit button selections (MUST come before generic patterns)
    else if (data.startsWith("villa_edit_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleVillaTypeEdit(query);
      });
    } else if (data.startsWith("bathroom_edit_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleBathroomTypeEdit(query);
      });
    }

    // Villa type selection
    else if (data.startsWith("villa_type_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleVillaTypeSelection(msg, data);
      });
    }

    // Bathroom type selection
    else if (data.startsWith("bathroom_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleBathroomType(msg, data);
      });
    }

    // Start new listing
    else if (data === "start_new_listing") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleStartNewListing(msg);
      });
    }

    // Add new ad from approved notification
    else if (data === "add_new_ad") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.askListingType(msg.chat.id);
      });
    }

    // Try again after rejection
    else if (data === "try_again_after_rejection") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.askListingType(msg.chat.id);
      });
    }

    // Start my listing from welcome message
    else if (data === "start_my_listing") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.askListingType(msg.chat.id);
      });
    }

    // Photo submission options
    else if (data === "add_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.askForPhotos(msg.chat.id);
      });
    } else if (data === "skip_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.skipPhotos(msg.chat.id);
      });
    } else if (data === "finish_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.finishPhotos(msg.chat.id);
      });
    }

    // Platform link
    else if (data === "skip_platform_link") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.skipPlatformLink(msg.chat.id);
      });
    }

    // Description skip
    else if (data === "skip_description") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.skipDescription(msg.chat.id);
      });
    }

    // Preview and edit
    else if (data === "confirm_listing") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.confirmListing(msg.chat.id);
      });
    }

    // Admin callbacks
    else if (data === "admin_pending") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.showPendingPosts(query);
      });
    } else if (data === "admin_stats") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminStats(query);
      });
    } else if (data === "admin_create_post") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminCreatePost(query);
      });
    } else if (data.startsWith("approve_") || data.startsWith("reject_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handlePostApproval(query);
      });
    } else if (data.startsWith("edit_field_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleEditField(query);
      });
    } else if (data.startsWith("edit_done_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleEditDone(query);
      });
    } else if (data.startsWith("edit_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleEditPost(query);
      });
    }

    // Unknown callback
    else {
      console.log("Unknown callback data:", data);
    }
  });

  console.log("✅ Bot routes configured successfully!");
}

module.exports = { setupRoutes };
