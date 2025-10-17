const { getBot, getState, clearState } = require("../services/botService");
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

          // Check if REG is enabled and handle tenant registration
          if (process.env.REG === "TRUE") {
            const user = await require("../services/dbService").getUser(
              msg.from.id
            );

            // If user doesn't exist or isn't registered, start tenant registration
            if (!user || !user.name || !user.phone) {
              console.log(
                `Starting tenant registration for user ${msg.from.id}`
              );

              // Create user if doesn't exist
              if (!user) {
                await require("../services/dbService").createUser(msg.from.id);
              }

              // Set state for tenant registration and store the post info
              const { setState } = require("../services/botService");
              setState(msg.from.id, {
                step: "tenant_get_name",
                postId: postId,
                isContactRequest: true,
              });

              await bot.sendMessage(
                msg.from.id,
                "🛖 <b>እንኳን ደህና መጡ!</b>\n\n" +
                  "የደላላ/አከራይ መረጃ ለማየት እባክዎ ስምዎን ያስገቡ:",
                { parse_mode: "HTML" }
              );
              return;
            }

            // User exists but check if they have tenant type
            if (user.user_type !== "tenant") {
              await require("../services/dbService").updateUser(msg.from.id, {
                user_type: "tenant",
              });
            }
          }

          // Send combined contact info and welcome message (existing behavior)
          await require("../services/channelService").sendCombinedContactMessage(
            msg.from.id,
            post
          );
        } else {
          await bot.sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
        }
      } catch (error) {
        console.error("Error handling contact deep link:", error);
        // Show broker info even if there's an error, don't fall back to start flow
        try {
          await bot.sendMessage(
            chatId,
            "❌ የደላላ መረጃ ማምጣት ተሳንቷል። እባክዎ እንደገና ይሞክሩ።"
          );
        } catch (fallbackError) {
          console.error("Fallback error:", fallbackError);
        }
      }

      // ALWAYS return for contact requests - never proceed to regular start flow
      return;
    }

    // Handle deep link for media viewing requests
    if (parameter && parameter.startsWith("media_")) {
      const postId = parameter.split("_")[1];

      try {
        // Get post details
        const post = await require("../services/dbService").getPost(postId);
        if (post) {
          // Record the click
          await require("../services/dbService").recordClick(
            postId,
            msg.from.id,
            "media"
          );

          // Send additional media to user
          await require("../services/channelService").handleMediaViewingRequest(
            msg.from.id,
            postId
          );
        } else {
          await bot.sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
        }
      } catch (error) {
        console.error("Error handling media deep link:", error);
        try {
          await bot.sendMessage(
            chatId,
            "❌ ተጨማሪ ምስሎች ማምጣት ተሳንቷል። እባክዎ እንደገና ይሞክሩ።"
          );
        } catch (fallbackError) {
          console.error("Fallback error:", fallbackError);
        }
      }

      // ALWAYS return for media requests - never proceed to regular start flow
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

  // Handle unknown commands - catch-all pattern for any command not handled above
  bot.onText(/^\/(.+)/, (msg, match) => {
    try {
      const command = match[1];
      const chatId = msg.chat.id;

      // Only respond if this command wasn't handled by any of the specific patterns above
      // Check if the command is not one of the known commands
      if (
        !["start", "admin", "stop"].some((knownCmd) =>
          command.startsWith(knownCmd)
        )
      ) {
        bot.sendMessage(
          chatId,
          `❌ ያልታወቀ ትዕዛዝ: /${command}\n\n` +
            `📋 የተዘጋጁ ትዕዛዞች:\n` +
            `• /start - ማስታወቂያ ለመጀመር\n` +
            `• /stop - ውይይቱን ለማቆም`
        );
      }
    } catch (error) {
      console.error("Error handling unknown command:", error);
    }
  });

  // Message handling based on user state
  bot.on("message", async (msg) => {
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
            msg.document.mime_type.startsWith("image/")) ||
          (msg.video && msg.video.file_size <= 50 * 1024 * 1024)) && // 50MB limit for videos
        (state?.step === "get_photos" ||
          state?.step === "get_cover_photo" ||
          state?.step === "get_additional_photos" ||
          state?.step === "admin_photo_upload" ||
          state?.step === "user_photo_upload" ||
          state?.step === "broadcast_media_upload")
      ) {
        // Admin photo upload handling
        if (state?.step === "admin_photo_upload") {
          if (msg.media_group_id) {
            return adminController.handleAdminMediaGroupPhoto(msg);
          } else {
            return adminController.handleAdminPhotoUpload(msg);
          }
        }
        // User photo editing upload handling
        else if (state?.step === "user_photo_upload") {
          if (msg.media_group_id) {
            return postController.handleUserMediaGroupPhoto(msg);
          } else {
            return postController.handleUserPhotoUpload(msg);
          }
        }
        // Cover photo upload handling
        else if (state?.step === "get_cover_photo") {
          return postController.handleCoverPhotoUpload(msg);
        }
        // Additional photos upload handling
        else if (state?.step === "get_additional_photos") {
          if (msg.media_group_id) {
            return postController.handleAdditionalPhotoUpload(msg);
          } else {
            return postController.handleAdditionalPhotoUpload(msg);
          }
        }
        // Regular user photo upload handling (legacy)
        else if (state?.step === "get_photos") {
          if (msg.media_group_id) {
            return postController.handleMediaGroupPhoto(msg);
          } else {
            return postController.handlePhotoUpload(msg);
          }
        }
        // Broadcast media upload handling
        else if (state?.step === "broadcast_media_upload") {
          return adminController.handleBroadcastMediaUpload(msg);
        }
      }

      // Handle reply keyboard messages (take priority over state)
      if (msg.text) {
        const text = msg.text.trim();

        if (text === "🛖 ቤት ለማስተዋወቅ") {
          // Clear state and start posting (keyboard will be removed by next message)
          clearState(chatId);
          return userController.handleStartPostingWithRegistrationCheck(chatId);
        }

        if (text === "📋 ማስታወቂያዎቼ") {
          // Show ads (keyboard will be removed by next message)
          return userController.showMyAds(chatId);
        }

        if (text === "👤 አካውንት") {
          // Show account (keyboard will be removed by next message)
          return userController.showAccount(chatId);
        }
      }

      // Handle user editing flow
      if (state?.step?.startsWith("user_edit_")) {
        return postController.handleUserEditInput(msg);
      }

      switch (state?.step) {
        // User registration flow
        case "get_name":
          return userController.handleNameInput(msg);
        case "get_phone":
          return userController.handlePhoneInput(msg);

        // Tenant registration flow (for contact requests when REG=TRUE)
        case "tenant_get_name":
          return userController.handleTenantNameInput(msg);
        case "tenant_get_phone":
          return userController.handleTenantPhoneInput(msg);

        // User account editing flow
        case "edit_account_name":
        case "edit_account_phone":
          return userController.handleAccountEditInput(msg);

        // User rent marking flow
        case "waiting_rent_post_id":
          return userController.handleRentPostIdInput(msg);

        // Broadcast flow
        case "broadcast_title":
          return adminController.handleBroadcastTitleInput(msg);
        case "broadcast_message":
          return adminController.handleBroadcastMessageInput(msg);

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
        case "admin_post_platform_link":
          return adminController.handleAdminPostInput(msg);

        // Admin rejection reason
        case "admin_rejection_reason":
          return adminController.handleRejectionReasonInput(msg);

        // Admin token generation flow
        case "admin_token_recovery_minutes":
        case "admin_token_days":
        case "admin_token_device_id":
        case "admin_token_note":
          return adminController.handleAdminTokenInput(msg);

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
        case "admin_edit_photos":
          return adminController.handleEditInput(msg);

        default:
          // No active state - might be a new user or wrong input
          if (msg.text && !msg.text.startsWith("/")) {
            // Simple message instead of full greeting when expecting buttons
            return bot.sendMessage(
              msg.chat.id,
              "❌ እባክዎ ከላይ ካሉት ቁልፎች ብቻ ይምረጡ። አዲስ ማስታወቂያ ለመጀመር /start ይጫኑ።"
            );
          }
      }
    } catch (error) {
      console.error("Error handling message:", error);
      try {
        // Clear any problematic state
        clearState(msg.chat.id);

        await bot.sendMessage(
          msg.chat.id,
          "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ። ዋና ማውጫላይ እየተመለሱ ነው..."
        );

        // Try to return user to main menu if they're registered
        setTimeout(async () => {
          try {
            const user = await require("../services/dbService").getUser(
              msg.chat.id
            );
            if (user && user.name && user.phone) {
              await userController.showMainMenu(msg.chat.id);
            }
          } catch (recoveryError) {
            console.error("Error during recovery:", recoveryError);
          }
        }, 1000);
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
        await userController.handleStartListing(query);
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

    // Account management callbacks
    else if (data === "edit_account_name") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleEditAccountName(query);
      });
    } else if (data === "edit_account_phone") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleEditAccountPhone(query);
      });
    } else if (data === "refresh_my_ads") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleRefreshMyAds(query);
      });
    } else if (data.startsWith("my_ads_page_")) {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleMyAdsPagination(query);
      });
    } else if (data === "ask_rent_post_id") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.askForRentPostId(query.message.chat.id);
      });
    } else if (data.startsWith("admin_pending_page_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handlePendingPageNav(query);
      });
    } else if (data.startsWith("mark_rented_")) {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleMarkAsRented(query);
      });
    } else if (data === "back_to_main_menu") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.showMainMenu(query.message.chat.id);
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
        await postController.handleStartNewListing(query.message);
      });
    }

    // Add new ad from approved notification
    else if (data === "add_new_ad") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleStartPostingWithRegistrationCheck(
          query.message.chat.id
        );
      });
    }

    // Try again after rejection
    else if (data === "try_again_after_rejection") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleStartPostingWithRegistrationCheck(
          query.message.chat.id
        );
      });
    }

    // Start my listing from welcome message
    else if (data === "start_my_listing") {
      await handleCallbackQuery(bot, query, async () => {
        await userController.handleStartPostingWithRegistrationCheck(
          query.message.chat.id
        );
      });
    }

    // Photo submission options
    else if (data === "add_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.askForCoverPhoto(msg.chat.id);
      });
    } else if (data === "skip_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.skipPhotos(msg.chat.id);
      });
    } else if (data === "finish_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.finishPhotos(msg.chat.id);
      });
    } else if (data === "cover_photo_done") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.askForAdditionalPhotos(msg.chat.id);
      });
    } else if (data === "finish_additional_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.finishAdditionalPhotos(msg.chat.id);
      });
    } else if (data === "skip_additional_photos") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.finishAdditionalPhotos(msg.chat.id);
      });
    }

    // Platform link
    else if (data === "skip_platform_link") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.skipPlatformLink(msg.chat.id);
      });
    } else if (data === "admin_skip_platform_link") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminSkipPlatformLink(query);
      });
    } else if (data === "skip_property_size") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.skipPropertySize(msg.chat.id);
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
    } else if (data === "admin_generate_token") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminGenerateToken(query);
      });
    } else if (data === "admin_broadcast") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminBroadcast(query);
      });
    } else if (data.startsWith("broadcast_target_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleBroadcastTargetSelection(query);
      });
    } else if (data === "broadcast_attach_media") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleBroadcastAttachMedia(query);
      });
    } else if (data === "broadcast_continue") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleBroadcastContinue(query);
      });
    } else if (data === "broadcast_confirm_send") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleBroadcastConfirmSend(query);
      });
    } else if (data.startsWith("admin_token_type_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminTokenTypeSelection(query);
      });
    } else if (data.startsWith("admin_token_mode_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminTokenModeSelection(query);
      });
    } else if (data === "admin_token_skip_note") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminTokenSkipNote(query);
      });
    } else if (data === "admin_back_to_dashboard") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminBackToDashboard(query);
      });
    } else if (data === "admin_photo_add") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminPhotoAdd(query);
      });
    } else if (data === "admin_photo_replace") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminPhotoReplace(query);
      });
    } else if (data === "admin_photo_delete") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminPhotoDelete(query);
      });
    } else if (data === "admin_photos_done") {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleAdminPhotosDone(query);
      });
    } else if (data.startsWith("admin_view_clickers_")) {
      await handleCallbackQuery(bot, query, async () => {
        await adminController.handleViewClickers(query);
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

    // User editing callbacks
    else if (data.startsWith("user_edit_field_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserEditField(query);
      });
    } else if (data.startsWith("user_edit_done_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserEditDone(query);
      });
    } else if (data.startsWith("user_edit_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserEditPost(query);
      });
    }

    // User photo editing callbacks
    else if (data === "user_photo_add") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserPhotoAdd(query);
      });
    } else if (data === "user_photo_replace") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserPhotoReplace(query);
      });
    } else if (data === "user_photo_delete") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserPhotoDelete(query);
      });
    } else if (data === "user_photos_done") {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserPhotosDone(query);
      });
    }

    // User villa type editing
    else if (data.startsWith("user_villa_edit_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserVillaTypeEdit(query);
      });
    }

    // User bathroom type editing
    else if (data.startsWith("user_bathroom_edit_")) {
      await handleCallbackQuery(bot, query, async () => {
        await postController.handleUserBathroomTypeEdit(query);
      });
    }

    // Additional media viewing callbacks
    else if (data.startsWith("view_additional_media_")) {
      await handleCallbackQuery(bot, query, async () => {
        const postId = data.split("_")[3]; // view_additional_media_123 -> 123
        await require("../services/channelService").handleViewAdditionalMedia(
          query,
          postId
        );
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
