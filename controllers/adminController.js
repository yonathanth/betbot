const { getBot, setState, getState } = require("../services/botService");
const db = require("../services/dbService");
const channelService = require("../services/channelService");
const tokenService = require("../services/tokenService");

// Function to get bot instance
const bot = () => getBot();

async function isAdmin(chatId) {
  try {
    // Check environment variable first
    const adminIds = process.env.ADMIN_IDS?.split(",") || [];
    if (adminIds.includes(String(chatId))) {
      return true;
    }

    // Check database
    return await db.isAdmin(chatId);
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

function formatPostForAdmin(post) {
  const typeLabel =
    post.property_type === "residential" ? "የሚከራይ ቤት" : "የሚከራይ ስራ ቦታ";

  // Use display ID with PREPOSTS offset
  const preposts = parseInt(process.env.PREPOSTS) || 0;
  const displayId = post.id + preposts;

  let message = `<b>${typeLabel}</b> - ID: ${displayId}\n\n`;

  if (post.title) {
    message += `🏷️ <b>ዓይነት:</b> ${post.title}`;

    // Add additional property details
    if (post.villa_type) {
      message += ` - ${post.villa_type}`;
    }
    if (post.villa_type_other) {
      message += ` - ${post.villa_type_other}`;
    }
    if (post.rooms_count) {
      message += ` (${post.rooms_count} ክፍል)`;
    }
    if (post.floor) {
      message += ` - ${post.floor}`;
    }
    message += `\n\n`;
  }

  // Property specifications
  let specs = [];
  if (post.bedrooms) {
    specs.push(`🛏️ ${post.bedrooms} መኝታ ክፍል`);
  }
  if (post.bathrooms) {
    specs.push(`🚿 ${post.bathrooms} መታጠቢያ ቤት`);
  }
  if (post.bathroom_type) {
    specs.push(`🚿 ${post.bathroom_type} መታጠቢያ ቤት`);
  }
  if (post.property_size) {
    specs.push(`📐 ${post.property_size}`);
  }

  if (specs.length > 0) {
    message += `<b>ዝርዝሮች:</b>\n${specs.join(" • ")}\n\n`;
  }

  if (post.location) {
    message += `<b>አድራሻ:</b> ${post.location}\n`;
  }

  if (post.price) {
    message += `<b>ዋጋ:</b> ${post.price}\n`;
  }

  if (post.contact_info) {
    message += `<b>ስልክ:</b> ${post.contact_info}\n`;
  }

  if (post.description) {
    message += `\n📝 <b>ተጨማሪ መግለጫ:</b>\n${post.description}\n`;
  }

  message += `\n👤 <b>ስም በ:</b> ${
    post.display_name || post.user_name || "የማይታወቅ"
  }`;
  message += `\n📱 <b>ስልክ:</b> ${post.phone || "አልቀረበም"}`;
  message += `\n🆔 <b>የተጠቃሚ መለያ:</b> ${post.telegram_id}`;
  message += `\n⏰ <b>የቀረበበት ቀን:</b> ${new Date(post.created_at).toLocaleString(
    "am-ET"
  )}`;

  return message;
}

// Token Generation Handlers
async function handleAdminGenerateToken(callback) {
  try {
    const chatId = callback.message.chat.id;

    if (!(await isAdmin(chatId))) {
      return bot().answerCallbackQuery(callback.id, {
        text: "Access denied!",
      });
    }

    // Answer callback query first to prevent timeout
    bot().answerCallbackQuery(callback.id);

    setState(chatId, { step: "admin_token_select_type" });

    await bot().sendMessage(
      chatId,
      "🔑 <b>Token Generation</b>\n\n" +
        "Choose the type of token you want to generate:",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📜 License Token",
                callback_data: "admin_token_type_license",
              },
            ],
            [
              {
                text: "🔄 Recovery Token",
                callback_data: "admin_token_type_recovery",
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error in handleAdminGenerateToken:", error);
    try {
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    } catch (answerError) {
      console.error("Error answering callback query:", answerError);
    }
  }
}

async function handleAdminTokenTypeSelection(callback) {
  try {
    const chatId = callback.message.chat.id;
    const tokenType = callback.data.split("_")[3]; // admin_token_type_license or admin_token_type_recovery

    if (!(await isAdmin(chatId))) {
      return bot().answerCallbackQuery(callback.id, {
        text: "Access denied!",
      });
    }

    // Answer callback query first to prevent timeout
    bot().answerCallbackQuery(callback.id);

    if (tokenType === "license") {
      setState(chatId, { step: "admin_token_license_mode", tokenType });

      await bot().sendMessage(
        chatId,
        "📜 <b>License Token</b>\n\n" + "Choose the license mode:",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "♾️ Permanent",
                  callback_data: "admin_token_mode_permanent",
                },
              ],
              [
                {
                  text: "⏰ Periodic",
                  callback_data: "admin_token_mode_periodic",
                },
              ],
            ],
          },
        }
      );
    } else if (tokenType === "recovery") {
      setState(chatId, { step: "admin_token_recovery_minutes", tokenType });

      await bot().sendMessage(
        chatId,
        "🔄 <b>Recovery Token</b>\n\n" +
          "Enter the validity period in minutes (e.g., 15 for 15 minutes):",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⏪ Back to Token Types",
                  callback_data: "admin_generate_token",
                },
              ],
            ],
          },
        }
      );
    }
  } catch (error) {
    console.error("Error in handleAdminTokenTypeSelection:", error);
    try {
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    } catch (answerError) {
      console.error("Error answering callback query:", answerError);
    }
  }
}

async function handleAdminTokenModeSelection(callback) {
  try {
    const chatId = callback.message.chat.id;
    const mode = callback.data.split("_")[3]; // admin_token_mode_permanent or admin_token_mode_periodic

    if (!(await isAdmin(chatId))) {
      return bot().answerCallbackQuery(callback.id, {
        text: "Access denied!",
      });
    }

    // Answer callback query first to prevent timeout
    bot().answerCallbackQuery(callback.id);

    setState(chatId, {
      step: mode === "permanent" ? "admin_token_device_id" : "admin_token_days",
      tokenType: "license",
      mode,
    });

    if (mode === "permanent") {
      await bot().sendMessage(
        chatId,
        "♾️ <b>Permanent License Token</b>\n\n" +
          "Enter the Device Code (DID):",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⏪ Back to Modes",
                  callback_data: "admin_token_type_license",
                },
              ],
            ],
          },
        }
      );
    } else {
      await bot().sendMessage(
        chatId,
        "⏰ <b>Periodic License Token</b>\n\n" +
          "Enter the validity period in days (e.g., 7 for 7 days):",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⏪ Back to Modes",
                  callback_data: "admin_token_type_license",
                },
              ],
            ],
          },
        }
      );
    }
  } catch (error) {
    console.error("Error in handleAdminTokenModeSelection:", error);
    try {
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    } catch (answerError) {
      console.error("Error answering callback query:", answerError);
    }
  }
}

async function handleAdminTokenInput(msg) {
  try {
    const chatId = msg.chat.id;
    const state = getState(chatId);

    if (!state || !state.step.startsWith("admin_token_")) {
      return;
    }

    const currentStep = state.step;

    switch (currentStep) {
      case "admin_token_recovery_minutes":
        await processRecoveryMinutesInput(msg, state);
        break;
      case "admin_token_days":
        await processDaysInput(msg, state);
        break;
      case "admin_token_device_id":
        await processDeviceIdInput(msg, state);
        break;
      case "admin_token_note":
        await processNoteInput(msg, state);
        break;
    }
  } catch (error) {
    console.error("Error in handleAdminTokenInput:", error);
    bot().sendMessage(msg.chat.id, "❌ Error processing token input.");
  }
}

async function processRecoveryMinutesInput(msg, state) {
  const minutes = parseInt(msg.text.trim());

  if (isNaN(minutes) || minutes < 1) {
    return bot().sendMessage(
      msg.chat.id,
      "❌ Please enter a valid number of minutes (minimum 1):"
    );
  }

  setState(msg.chat.id, {
    ...state,
    step: "admin_token_device_id",
    minutes,
  });

  await bot().sendMessage(
    msg.chat.id,
    "🔄 <b>Recovery Token</b>\n\n" +
      `✅ Duration: ${minutes} minutes\n\n` +
      "Enter the Device Code (DID):",
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⏪ Back to Minutes",
              callback_data: "admin_token_type_recovery",
            },
          ],
        ],
      },
    }
  );
}

async function processDaysInput(msg, state) {
  const days = parseInt(msg.text.trim());

  if (isNaN(days) || days < 1) {
    return bot().sendMessage(
      msg.chat.id,
      "❌ Please enter a valid number of days (minimum 1):"
    );
  }

  setState(msg.chat.id, {
    ...state,
    step: "admin_token_device_id",
    days,
  });

  await bot().sendMessage(
    msg.chat.id,
    "⏰ <b>Periodic License Token</b>\n\n" +
      `✅ Duration: ${days} days\n\n` +
      "Enter the Device Code (DID):",
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⏪ Back to Days",
              callback_data: "admin_token_mode_periodic",
            },
          ],
        ],
      },
    }
  );
}

async function processDeviceIdInput(msg, state) {
  const did = msg.text.trim();

  if (!did || did.length < 1) {
    return bot().sendMessage(
      msg.chat.id,
      "❌ Please enter a valid Device Code:"
    );
  }

  setState(msg.chat.id, {
    ...state,
    step: "admin_token_note",
    did,
  });

  await bot().sendMessage(
    msg.chat.id,
    "📝 <b>Note (Optional)</b>\n\n" +
      "Enter a note for this token (or send 'skip' to continue without note):",
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⏭️ Skip Note",
              callback_data: "admin_token_skip_note",
            },
          ],
          [
            {
              text: "⏪ Back to Device ID",
              callback_data:
                state.tokenType === "license"
                  ? state.mode === "permanent"
                    ? "admin_token_mode_permanent"
                    : "admin_token_mode_periodic"
                  : "admin_token_type_recovery",
            },
          ],
        ],
      },
    }
  );
}

async function processNoteInput(msg, state) {
  const noteText = msg.text.trim().toLowerCase();

  let note = null;
  if (noteText !== "skip" && noteText !== "") {
    note = msg.text.trim();
  }

  // Generate the token (private key will be read from environment)
  try {
    let token;
    if (state.tokenType === "license") {
      token = tokenService.generateLicenseToken(
        null, // Private key will be read from TOKEN_PRIVATE_KEY env var
        state.did,
        state.mode,
        state.days,
        note
      );
    } else {
      token = tokenService.generateRecoveryToken(
        null, // Private key will be read from TOKEN_PRIVATE_KEY env var
        state.did,
        state.minutes,
        note
      );
    }

    // Clear state
    setState(msg.chat.id, { step: null });

    // Send the generated token
    const tokenTypeDisplay =
      state.tokenType === "license"
        ? state.mode === "permanent"
          ? "Permanent License"
          : `Periodic License (${state.days} days)`
        : `Recovery (${state.minutes} minutes)`;

    await bot().sendMessage(
      msg.chat.id,
      `✅ <b>Token Generated Successfully!</b>\n\n` +
        `🔑 <b>Type:</b> ${tokenTypeDisplay}\n` +
        `📱 <b>Device:</b> ${state.did}\n` +
        `${note ? `📝 <b>Note:</b> ${note}\n` : ""}\n` +
        `🎫 <b>Token:</b>\n<code>${token}</code>\n\n` +
        `⚠️ <b>Important:</b> Save this token securely. It cannot be recovered once this message is closed.`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔄 Generate Another Token",
                callback_data: "admin_generate_token",
              },
            ],
            [
              {
                text: "🏠 Back to Admin Dashboard",
                callback_data: "admin_back_to_dashboard",
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error generating token:", error);
    await bot().sendMessage(
      msg.chat.id,
      "❌ Error generating token. Please check your inputs and try again."
    );

    // Reset to start of flow
    setState(msg.chat.id, { step: "admin_token_select_type" });
  }
}

async function handleAdminTokenSkipNote(callback) {
  try {
    const chatId = callback.message.chat.id;
    const state = getState(chatId);

    if (!(await isAdmin(chatId))) {
      return bot().answerCallbackQuery(callback.id, {
        text: "Access denied!",
      });
    }

    // Answer callback query first to prevent timeout
    bot().answerCallbackQuery(callback.id);

    // Process with no note
    await processNoteInput({ text: "skip", chat: { id: chatId } }, state);
  } catch (error) {
    console.error("Error in handleAdminTokenSkipNote:", error);
    try {
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    } catch (answerError) {
      console.error("Error answering callback query:", answerError);
    }
  }
}

async function handleAdminBackToDashboard(callback) {
  try {
    const chatId = callback.message.chat.id;

    if (!(await isAdmin(chatId))) {
      return bot().answerCallbackQuery(callback.id, {
        text: "Access denied!",
      });
    }

    // Answer callback query first to prevent timeout
    bot().answerCallbackQuery(callback.id);

    // Clear any token generation state
    setState(chatId, { step: null });

    // Get stats and show dashboard
    const stats = await db.getStats();

    await bot().sendMessage(
      chatId,
      `📊 <b>Admin Dashboard</b>\n\n` +
        `👥 Total Users: ${stats.totalUsers}\n` +
        `📋 Total Posts: ${stats.totalPosts}\n` +
        `⏳ Pending Posts: ${stats.pendingPosts}\n` +
        `✅ Published Posts: ${stats.publishedPosts}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📋 Review Pending Posts",
                callback_data: "admin_pending",
              },
            ],
            [
              {
                text: "📊 Post Statistics",
                callback_data: "admin_stats",
              },
            ],
            [
              {
                text: "➕ Create Admin Post",
                callback_data: "admin_create_post",
              },
            ],
            [
              {
                text: "🔑 Generate Token",
                callback_data: "admin_generate_token",
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error("Error in handleAdminBackToDashboard:", error);
    try {
      bot().answerCallbackQuery(callback.id, { text: "Error!" });
    } catch (answerError) {
      console.error("Error answering callback query:", answerError);
    }
  }
}

module.exports = {
  formatPostForAdmin,
  isAdmin,

  // Token generation handlers
  handleAdminGenerateToken,
  handleAdminTokenTypeSelection,
  handleAdminTokenModeSelection,
  handleAdminTokenInput,
  handleAdminTokenSkipNote,
  handleAdminBackToDashboard,

  async handleAdminCommand(msg) {
    try {
      const chatId = msg.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot().sendMessage(
          chatId,
          "❌ Access denied! You are not an admin."
        );
      }

      const stats = await db.getStats();

      await bot().sendMessage(
        chatId,
        `📊 <b>Admin Dashboard</b>\n\n` +
          `👥 Total Users: ${stats.totalUsers}\n` +
          `📋 Total Posts: ${stats.totalPosts}\n` +
          `⏳ Pending Posts: ${stats.pendingPosts}\n` +
          `✅ Published Posts: ${stats.publishedPosts}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📋 Review Pending Posts",
                  callback_data: "admin_pending",
                },
              ],
              [
                {
                  text: "📊 Post Statistics",
                  callback_data: "admin_stats",
                },
              ],
              [
                {
                  text: "➕ Create Admin Post",
                  callback_data: "admin_create_post",
                },
              ],
              [
                {
                  text: "🔑 Generate Token",
                  callback_data: "admin_generate_token",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleAdminCommand:", error);
      bot().sendMessage(msg.chat.id, "❌ Error loading admin dashboard.");
    }
  },

  async handleAdminStats(callback) {
    try {
      const chatId = callback.message.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      setState(chatId, { step: "admin_get_post_id" });

      await bot().sendMessage(
        chatId,
        "📊 <b>Post Statistics</b>\n\n" + "የማስታወቂያ መታወቂያ ቁጥር (Post ID) ያስገቡ:",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Error in handleAdminStats:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handlePostStatsInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!state || state.step !== "admin_get_post_id") {
        return;
      }

      const displayPostId = parseInt(msg.text);
      if (!displayPostId || displayPostId < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ Post ID ያስገቡ:");
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

      const stats = await db.getPostStats(databasePostId);
      if (!stats) {
        return bot().sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
      }

      const post = stats.post;
      const statsMessage =
        `📊<b>Post #${displayPostId} Statistics</b>\n\n` +
        `<b>Title:</b> ${post.title || "N/A"}\n` +
        `<b>Location:</b> ${post.location || "N/A"}\n` +
        `<b>Price:</b> ${post.price || "N/A"}\n` +
        `<b>Created:</b> ${new Date(post.created_at).toLocaleDateString(
          "am-ET"
        )}\n\n` +
        `📈 <b>Statistics:</b>\n` +
        `💬 Contact Clicks: ${stats.contactClicks}\n` +
        `👥 Unique Clickers: ${stats.uniqueClickers}`;

      const keyboard = [];

      // Add clickers list button only if there are clickers
      if (stats.uniqueClickers > 0) {
        keyboard.push([
          {
            text: "👥 View Who Clicked",
            callback_data: `admin_view_clickers_${databasePostId}`,
          },
        ]);
      }

      await bot().sendMessage(chatId, statsMessage, {
        parse_mode: "HTML",
        reply_markup:
          keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
      });

      // Clear state
      setState(chatId, { step: null });
    } catch (error) {
      console.error("Error in handlePostStatsInput:", error);
      bot().sendMessage(msg.chat.id, "❌ Error retrieving statistics.");
    }
  },

  async handleViewClickers(callback) {
    try {
      const chatId = callback.message.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first
      bot().answerCallbackQuery(callback.id);

      const postId = callback.data.split("_")[3]; // admin_view_clickers_123
      const clickers = await db.getPostClickers(postId);

      if (!clickers.length) {
        return bot().sendMessage(chatId, "❌ No clickers found for this post.");
      }

      let clickersMessage = `👥 <b>Post #${postId} Clickers (${clickers.length})</b>\n\n`;

      clickers.forEach((clicker, index) => {
        const userName = clicker.name || "Unknown";
        const userPhone = clicker.phone || "No phone";
        const clickCount = clicker.click_count;
        const lastClick = new Date(clicker.last_click).toLocaleDateString(
          "am-ET"
        );

        clickersMessage += `${index + 1}. <b>${userName}</b>\n`;
        clickersMessage += `   📱 ${userPhone}\n`;
        clickersMessage += `   🆔 ${clicker.user_telegram_id}\n`;
        clickersMessage += `   👆 ${clickCount} click${
          clickCount > 1 ? "s" : ""
        }\n`;
        clickersMessage += `   📅 Last: ${lastClick}\n\n`;
      });

      // Split message if too long (Telegram has 4096 char limit)
      if (clickersMessage.length > 4000) {
        const chunks = this.splitMessage(clickersMessage, 4000);
        for (const chunk of chunks) {
          await bot().sendMessage(chatId, chunk, { parse_mode: "HTML" });
        }
      } else {
        await bot().sendMessage(chatId, clickersMessage, {
          parse_mode: "HTML",
        });
      }
    } catch (error) {
      console.error("Error in handleViewClickers:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
      bot().sendMessage(chatId, "❌ Error retrieving clickers list.");
    }
  },

  splitMessage(message, maxLength) {
    const chunks = [];
    let currentChunk = "";
    const lines = message.split("\n");

    for (const line of lines) {
      if ((currentChunk + line + "\n").length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
      }
      currentChunk += line + "\n";
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  },

  async showPendingPosts(callback) {
    try {
      const chatId = callback.message.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const posts = await db.getPendingPosts();

      if (posts.length === 0) {
        return bot().editMessageText("📭 No pending posts at the moment.", {
          chat_id: chatId,
          message_id: callback.message.message_id,
        });
      }

      for (const post of posts) {
        const message = formatPostForAdmin(post);

        // Get photos for this post
        const photos = await db.getPostPhotos(post.id);

        if (photos && photos.length > 0) {
          // Send media as media group with the post details as caption on first item
          const mediaGroup = photos.map((photo, index) => ({
            type:
              photo.file_type === "video"
                ? "video"
                : photo.file_type === "document"
                ? "document"
                : "photo",
            media: photo.telegram_file_id,
            caption: index === 0 ? message : undefined,
            parse_mode: index === 0 ? "HTML" : undefined,
          }));

          await bot().sendMediaGroup(chatId, mediaGroup);

          // Send approval buttons as separate message
          const preposts = parseInt(process.env.PREPOSTS) || 0;
          const displayId = post.id + preposts;

          await bot().sendMessage(
            chatId,
            `📋 Post ID: ${displayId} - Actions:`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Approve", callback_data: `approve_${post.id}` },
                    { text: "✏️ Edit", callback_data: `edit_${post.id}` },
                  ],
                  [{ text: "❌ Reject", callback_data: `reject_${post.id}` }],
                ],
              },
            }
          );
        } else {
          // Send text-only message with inline buttons
          await bot().sendMessage(chatId, message, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Approve", callback_data: `approve_${post.id}` },
                  { text: "✏️ Edit", callback_data: `edit_${post.id}` },
                ],
                [{ text: "❌ Reject", callback_data: `reject_${post.id}` }],
              ],
            },
          });
        }
      }
    } catch (error) {
      console.error("Error in showPendingPosts:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "Error loading posts!",
        });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handlePostApproval(callback) {
    try {
      const chatId = callback.message.chat.id;
      const action = callback.data.split("_")[0];
      const postId = callback.data.split("_")[1];

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      if (action === "approve") {
        await db.updatePostStatus(postId, "approved");
        await channelService.publishToChannel(postId);

        // Notify user with option to add new ad
        const post = await db.getPost(postId);
        await bot().sendMessage(
          post.telegram_id,
          "🎉 ማስታወቂያዎ ጸድቆ ቻናላችን ላይ ተለቋል! ተጨማሪ ማስታወቂያዎችን ይልቀቁ።"
        );

        await bot().editMessageText(
          callback.message.text + "\n\n✅ <b>APPROVED & PUBLISHED</b>",
          {
            chat_id: chatId,
            message_id: callback.message.message_id,
            parse_mode: "HTML",
          }
        );

        bot().answerCallbackQuery(callback.id, {
          text: "Post approved and published!",
        });
      } else if (action === "reject") {
        // Ask for rejection reason
        setState(chatId, {
          step: "admin_rejection_reason",
          postId: parseInt(postId),
          rejectionMessageId: callback.message.message_id,
        });

        await bot().sendMessage(
          chatId,
          "❌ <b>ምክንያትዎን  ይጻፉ</b>\n\n" +
            "እባክዎ ማስታወቂያው ለምን ውድቅ እንደተደረገ ምክንያቱን ይግለጹ:",
          { parse_mode: "HTML" }
        );

        bot().answerCallbackQuery(callback.id, { text: "ምክንያቱን ይጻፉ..." });
      }
    } catch (error) {
      console.error("Error in handlePostApproval:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "Error processing request!",
        });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleEditPost(callback) {
    try {
      const chatId = callback.message.chat.id;

      const postId = callback.data.split("_")[1];

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      // Get post details to determine property type and available fields
      const post = await db.getPost(parseInt(postId));

      if (!post) {
        return bot().sendMessage(chatId, "❌ Post not found!");
      }

      setState(chatId, {
        step: "admin_edit",
        postId: parseInt(postId),
        post: post,
      });

      // Create property-type-aware edit options
      const editOptions = this.getEditOptionsForPost(post, postId);

      await bot().sendMessage(
        chatId,
        `✏️ <b>Edit Post Mode</b>\n\n` +
          `📋 <b>Post:</b> ${post.title || "N/A"}\n` +
          `🛖 <b>Type:</b> ${
            post.property_type === "residential" ? "የመኖሪያ ቤት" : "የንግድ ቤት"
          }\n\n` +
          `What would you like to edit?`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );
    } catch (error) {
      console.error("Error in handleEditPost:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  // Helper function to get edit options based on post type
  getEditOptionsForPost(post, postId) {
    const commonFields = [
      [{ text: "📋 Title", callback_data: `edit_field_title_${postId}` }],
      [{ text: "📍 Location", callback_data: `edit_field_location_${postId}` }],
      [{ text: "💰 Price", callback_data: `edit_field_price_${postId}` }],
      [
        {
          text: "📞 Contact Info",
          callback_data: `edit_field_contact_info_${postId}`,
        },
      ],
      [
        {
          text: "👤 Display Name",
          callback_data: `edit_field_display_name_${postId}`,
        },
      ],
    ];

    const propertySpecificFields = [];

    // Add property-specific fields based on property type and title
    if (post.property_type === "residential") {
      if (post.title === "ግቢ ውስጥ ያለ" && post.rooms_count) {
        propertySpecificFields.push([
          {
            text: "🛖 Rooms Count",
            callback_data: `edit_field_rooms_count_${postId}`,
          },
        ]);
      }

      if (post.title === "ሙሉ ግቢ") {
        if (post.villa_type) {
          propertySpecificFields.push([
            {
              text: "🏡 Villa Type",
              callback_data: `edit_field_villa_type_${postId}`,
            },
          ]);
        }
        if (post.villa_type_other) {
          propertySpecificFields.push([
            {
              text: "🏡 Villa Type (Other)",
              callback_data: `edit_field_villa_type_other_${postId}`,
            },
          ]);
        }
      }

      if (["ኮንዶሚንየም", "አፓርታማ"].includes(post.title) && post.floor) {
        propertySpecificFields.push([
          { text: "🏢 Floor", callback_data: `edit_field_floor_${postId}` },
        ]);
      }

      if (post.bedrooms) {
        propertySpecificFields.push([
          {
            text: "🛏️ Bedrooms",
            callback_data: `edit_field_bedrooms_${postId}`,
          },
        ]);
      }

      if (post.bathrooms) {
        propertySpecificFields.push([
          {
            text: "🚿 Bathrooms",
            callback_data: `edit_field_bathrooms_${postId}`,
          },
        ]);
      }

      if (post.bathroom_type) {
        propertySpecificFields.push([
          {
            text: "🚿 Bathroom Type",
            callback_data: `edit_field_bathroom_type_${postId}`,
          },
        ]);
      }
    } else if (post.property_type === "commercial") {
      if (
        ["ቢሮ", "ሱቅ", "መጋዘን", "ለየትኛውም ንግድ"].includes(post.title) &&
        post.floor
      ) {
        propertySpecificFields.push([
          { text: "🏢 Floor", callback_data: `edit_field_floor_${postId}` },
        ]);
      }
    }

    // Add common fields that might be present
    if (post.property_size) {
      propertySpecificFields.push([
        {
          text: "📐 Property Size",
          callback_data: `edit_field_property_size_${postId}`,
        },
      ]);
    }

    if (post.description) {
      propertySpecificFields.push([
        {
          text: "📝 Description",
          callback_data: `edit_field_description_${postId}`,
        },
      ]);
    }

    if (post.platform_link) {
      propertySpecificFields.push([
        {
          text: "🔗 Platform Link",
          callback_data: `edit_field_platform_link_${postId}`,
        },
      ]);
    }

    // Add photos editing option
    propertySpecificFields.push([
      {
        text: "📷 Media",
        callback_data: `edit_field_photos_${postId}`,
      },
    ]);

    // Combine all fields
    const allFields = [
      ...commonFields,
      ...propertySpecificFields,
      [{ text: "✅ Done Editing", callback_data: `edit_done_${postId}` }],
    ];

    return allFields;
  },

  async handleEditField(callback) {
    try {
      const chatId = callback.message.chat.id;
      const parts = callback.data.split("_");

      // Handle compound field names (like contact_info, display_name, etc.)
      let field, postId;
      if (parts.length === 4) {
        field = parts[2];
        postId = parts[3];
      } else if (parts.length === 5) {
        field = `${parts[2]}_${parts[3]}`;
        postId = parts[4];
      } else {
        console.error("Invalid callback data format:", callback.data);
        return bot().answerCallbackQuery(callback.id, {
          text: "Invalid format!",
        });
      }

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      // Get post details for context
      const post = await db.getPost(postId);
      if (!post) {
        return bot().sendMessage(chatId, "❌ Post not found!");
      }

      setState(chatId, {
        step: `admin_edit_${field}`,
        postId: parseInt(postId),
        editingField: field,
        post: post,
      });

      // Get field-specific prompts and validation
      const fieldInfo = this.getFieldEditInfo(field, post);

      await bot().sendMessage(
        chatId,
        `✏️ <b>Edit ${fieldInfo.displayName}</b>\n\n` +
          `📋 <b>Current:</b> ${fieldInfo.currentValue}\n\n` +
          `${fieldInfo.prompt}`,
        {
          parse_mode: "HTML",
          reply_markup: fieldInfo.keyboard || undefined,
        }
      );
    } catch (error) {
      console.error("Error in handleEditField:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "Error starting field edit!",
        });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  // Helper function to get bathroom type options based on property title
  getBathroomTypeOptions(propertyTitle) {
    if (propertyTitle === "ስቱዲዮ" || propertyTitle === "ግቢ ውስጥ ያለ") {
      return [
        [{ text: "🚿 የግል", callback_data: "bathroom_edit_የግል" }],
        [{ text: "🚿 የጋራ", callback_data: "bathroom_edit_የጋራ" }],
      ];
    } else {
      return [
        [
          {
            text: "🚿 ሙሉ መታጠቢያ ቤት",
            callback_data: "bathroom_edit_ሙሉ መታጠቢያ ቤት",
          },
        ],
        [{ text: "🚽 ቶይለት ብቻ", callback_data: "bathroom_edit_ቶይለት ብቻ" }],
        [{ text: "🚿 ሻወር ብቻ", callback_data: "bathroom_edit_ሻወር ብቻ" }],
      ];
    }
  },

  // Helper function to get field-specific edit information
  getFieldEditInfo(field, post) {
    const fieldMappings = {
      title: {
        displayName: "Title",
        currentValue: post.title || "N/A",
        prompt: "📋 Enter the new title:",
        dbField: "title",
      },
      location: {
        displayName: "Location",
        currentValue: post.location || "N/A",
        prompt: "📍 Enter the new location:",
        dbField: "location",
      },
      price: {
        displayName: "Price",
        currentValue: post.price || "N/A",
        prompt: "💰 Enter the new price:",
        dbField: "price",
      },
      contact_info: {
        displayName: "Contact Info",
        currentValue: post.contact_info || "N/A",
        prompt: "📞 Enter the new contact information:",
        dbField: "contact_info",
      },
      display_name: {
        displayName: "Display Name",
        currentValue: post.display_name || "N/A",
        prompt: "👤 Enter the new display name:",
        dbField: "display_name",
      },
      description: {
        displayName: "Description",
        currentValue: post.description || "N/A",
        prompt: "📝 Enter the new description:",
        dbField: "description",
      },
      rooms_count: {
        displayName: "Rooms Count",
        currentValue: post.rooms_count || "N/A",
        prompt: "🛖 Enter the number of rooms (numbers only):",
        dbField: "rooms_count",
      },
      villa_type: {
        displayName: "Villa Type",
        currentValue: post.villa_type || "N/A",
        prompt: "🏡 Select the villa type:",
        dbField: "villa_type",
        keyboard: {
          inline_keyboard: [
            [{ text: "🏡 ቪላ", callback_data: "villa_edit_ቪላ" }],
            [{ text: "🛖 ጂ+1", callback_data: "villa_edit_ጂ+1" }],
            [{ text: "🏢 ጂ+2", callback_data: "villa_edit_ጂ+2" }],
            [{ text: "🏢 ጂ+3", callback_data: "villa_edit_ጂ+3" }],
            [{ text: "🏗️ ሌላ", callback_data: "villa_edit_ሌላ" }],
          ],
        },
      },
      villa_type_other: {
        displayName: "Villa Type (Other)",
        currentValue: post.villa_type_other || "N/A",
        prompt: "🏡 Enter the villa type:",
        dbField: "villa_type_other",
      },
      floor: {
        displayName: "Floor",
        currentValue: post.floor || "N/A",
        prompt: "🏢 Enter the floor number (1, 2..) or 0 for ground floor:",
        dbField: "floor",
      },
      bedrooms: {
        displayName: "Bedrooms",
        currentValue: post.bedrooms || "N/A",
        prompt: "🛏️ Enter the number of bedrooms:",
        dbField: "bedrooms",
      },
      bathrooms: {
        displayName: "Bathrooms",
        currentValue: post.bathrooms || "N/A",
        prompt: "🚿 Enter the number of bathrooms:",
        dbField: "bathrooms",
      },
      bathroom_type: {
        displayName: "Bathroom Type",
        currentValue: post.bathroom_type || "N/A",
        prompt: "🚿 Select the bathroom type:",
        dbField: "bathroom_type",
        keyboard: {
          inline_keyboard: this.getBathroomTypeOptions(post.title),
        },
      },
      property_size: {
        displayName: "Property Size",
        currentValue: post.property_size || "N/A",
        prompt: "📐 Enter the property size:",
        dbField: "property_size",
      },
      platform_link: {
        displayName: "Platform Link",
        currentValue: post.platform_link || "N/A",
        prompt: "🔗 Enter the platform link (URL):",
        dbField: "platform_link",
      },
      photos: {
        displayName: "Photos",
        currentValue: "Click to manage photos",
        prompt: "📷 Photo Management:\n\nChoose how you want to handle photos:",
        dbField: "photos",
        keyboard: {
          inline_keyboard: [
            [
              {
                text: "➕ Add photos to existing ones",
                callback_data: "admin_photo_add",
              },
            ],
            [
              {
                text: "🔄 Replace all photos",
                callback_data: "admin_photo_replace",
              },
            ],
            [
              {
                text: "🗑️ Delete all photos",
                callback_data: "admin_photo_delete",
              },
            ],
          ],
        },
      },
    };

    return (
      fieldMappings[field] || {
        displayName: field,
        currentValue: "N/A",
        prompt: `Enter the new ${field}:`,
        dbField: field,
      }
    );
  },

  async handleEditInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!state || !state.step.startsWith("admin_edit_") || !state.postId) {
        return;
      }

      const field = state.editingField;
      const postId = state.postId;
      const post = state.post;

      // Handle photos differently - photos now use buttons, not text input
      if (field === "photos") {
        return bot().sendMessage(
          chatId,
          "❌ Please use the photo management buttons above to edit photos."
        );
      }

      // Get field info for validation
      const fieldInfo = this.getFieldEditInfo(field, post);

      // Validate input based on field type
      const validationResult = this.validateFieldInput(field, msg.text.trim());
      if (!validationResult.isValid) {
        return bot().sendMessage(chatId, `❌ ${validationResult.error}`);
      }

      // Update the post field
      const updateData = {};
      updateData[fieldInfo.dbField] = validationResult.value;

      await db.updatePostByAdmin(postId, updateData);

      // Get updated post for displaying new edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getEditOptionsForPost(updatedPost, postId);

      await bot().sendMessage(
        chatId,
        `✅ ${fieldInfo.displayName} updated successfully!\n\n` +
          `📋 <b>New Value:</b> ${validationResult.value}\n\n` +
          "What else would you like to edit?",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "admin_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleEditInput:", error);
      bot().sendMessage(
        msg.chat.id,
        "❌ Failed to update field. Please try again."
      );
    }
  },

  // Helper function to validate field input
  validateFieldInput(field, value) {
    if (!value || value.length === 0) {
      return { isValid: false, error: "እባክዎ ዋጋ ያስገቡ:" };
    }

    switch (field) {
      case "rooms_count":
      case "bedrooms":
      case "bathrooms":
        if (
          !/^\d+$/.test(value) ||
          parseInt(value) < 1 ||
          parseInt(value) > 50
        ) {
          return { isValid: false, error: "እባክዎ ትክክለኛ ቁጥር ያስገቡ (1-50):" };
        }
        return { isValid: true, value: parseInt(value) };

      case "floor":
        if (
          value === "0" ||
          value.toLowerCase() === "ግራውንድ" ||
          value.toLowerCase() === "ground"
        ) {
          return { isValid: true, value: "ግራውንድ" };
        }
        if (
          !/^\d+$/.test(value) ||
          parseInt(value) < 1 ||
          parseInt(value) > 50
        ) {
          return {
            isValid: false,
            error: "እባክዎ ትክክለኛ ፎቅ ቁጥር ያስገቡ ወይም ለግራውንድ 0 ይጻፉ:",
          };
        }
        // Format floor number with "ኛ ፎቅ" for commercial properties
        const floorNumber = parseInt(value);
        const formattedFloor = `${floorNumber}ኛ ፎቅ`;
        return { isValid: true, value: formattedFloor };

      case "price":
        if (value.length < 1) {
          return { isValid: false, error: "እባክዎ ዋጋውን በዝርዝር ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "contact_info":
        if (value.length < 10) {
          return { isValid: false, error: "እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "title":
        if (value.length < 1) {
          return { isValid: false, error: "እባክዎ ትክክለኛ ርዕስ ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "location":
        if (value.length < 1) {
          return { isValid: false, error: "እባክዎ ትክክለኛ አድራሻ ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "platform_link":
        // Basic URL validation
        try {
          new URL(value);
          return { isValid: true, value: value };
        } catch (e) {
          // Try with http:// prefix if no protocol is provided
          try {
            new URL(`http://${value}`);
            return { isValid: true, value: `http://${value}` };
          } catch (e2) {
            return {
              isValid: false,
              error: "እባክዎ ትክክለኛ ሊንክ ያስገቡ (https://example.com):",
            };
          }
        }

      default:
        return { isValid: true, value: value };
    }
  },

  async handleAdminPhotoAdd(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ No post selected for editing!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;

      // Set state for adding photos
      setState(chatId, {
        step: "admin_photo_upload",
        postId: postId,
        photoMode: "add",
        photos: [],
      });

      // Get current photo count
      const currentPhotos = await db.getPostPhotos(postId);

      await bot().sendMessage(
        chatId,
        `📷 <b>Add Photos Mode</b>\n\n` +
          `Current photos: ${currentPhotos.length}/8\n` +
          `Available slots: ${8 - currentPhotos.length}\n\n` +
          `Send photos to add them to the existing ones.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Done Adding Photos",
                  callback_data: "admin_photos_done",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleAdminPhotoAdd:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminPhotoReplace(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ No post selected for editing!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;

      // Delete all existing photos first
      await db.deletePostPhotos(postId);

      // Set state for replacing photos
      setState(chatId, {
        step: "admin_photo_upload",
        postId: postId,
        photoMode: "replace",
        photos: [],
      });

      await bot().sendMessage(
        chatId,
        `🔄 <b>Replace Photos Mode</b>\n\n` +
          `All existing photos have been deleted.\n` +
          `Now send new photos (up to 8 photos).`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Done Adding Photos",
                  callback_data: "admin_photos_done",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleAdminPhotoReplace:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminPhotoDelete(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ No post selected for editing!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;

      // Delete all photos
      await db.deletePostPhotos(postId);

      // Go back to edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getEditOptionsForPost(updatedPost, postId);

      await bot().sendMessage(
        chatId,
        "✅ All photos have been deleted!\n\nWhat else would you like to edit?",
        {
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "admin_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleAdminPhotoDelete:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminPhotosDone(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ No post selected for editing!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;
      const photos = state.photos || [];

      if (photos.length > 0) {
        // Save all photos
        for (const photo of photos) {
          await db.saveAdminPostPhoto(postId, photo);
        }

        await bot().sendMessage(
          chatId,
          `✅ ${photos.length} photos have been saved successfully!`
        );
      }

      // Go back to edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getEditOptionsForPost(updatedPost, postId);

      await bot().sendMessage(
        chatId,
        "✅ Photo editing completed!\n\nWhat else would you like to edit?",
        {
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "admin_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleAdminPhotosDone:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminPhotoUpload(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!state || state.step !== "admin_photo_upload" || !state.postId) {
        return;
      }

      let photos = state.photos || [];
      let newPhoto = null;

      // Handle regular photo
      if (msg.photo) {
        newPhoto = {
          file_id: msg.photo[msg.photo.length - 1].file_id,
          file_size: msg.photo[msg.photo.length - 1].file_size,
          type: "photo",
        };
      }
      // Handle document/image
      else if (
        msg.document &&
        msg.document.mime_type &&
        msg.document.mime_type.startsWith("image/")
      ) {
        newPhoto = {
          file_id: msg.document.file_id,
          file_size: msg.document.file_size,
          type: "document",
        };
      }
      // Handle video
      else if (msg.video) {
        // Check file size limit (50MB)
        if (msg.video.file_size > 50 * 1024 * 1024) {
          return bot().sendMessage(
            chatId,
            "❌ Video is over 50MB. Please send a smaller video."
          );
        }
        newPhoto = {
          file_id: msg.video.file_id,
          file_size: msg.video.file_size,
          type: "video",
        };
      }

      if (!newPhoto) {
        return bot().sendMessage(
          chatId,
          "❌ Please send a valid photo or video."
        );
      }

      // Get current saved photos count (for add mode)
      let currentSavedCount = 0;
      if (state.photoMode === "add") {
        const currentSavedPhotos = await db.getPostPhotos(state.postId);
        currentSavedCount = currentSavedPhotos.length;
      }

      const totalWillHave = currentSavedCount + photos.length + 1;

      // Check if adding this photo would exceed the limit
      if (totalWillHave > 8) {
        return bot().sendMessage(
          chatId,
          `❌ Cannot add more photos. This would make ${totalWillHave} photos total, but maximum is 8.\n\n` +
            `Current saved: ${currentSavedCount}\n` +
            `In queue: ${photos.length}\n` +
            `Please click 'Done' to save current photos or start over.`
        );
      }

      // Add the photo to the queue
      photos.push(newPhoto);
      setState(chatId, { ...state, photos });

      // Send confirmation
      await bot().sendMessage(
        chatId,
        `✅ Photo ${photos.length} added to queue!\n\n` +
          `Total will be: ${currentSavedCount + photos.length}/8\n\n` +
          `${
            currentSavedCount + photos.length < 8
              ? "Send more photos or click 'Done' when finished."
              : "Maximum reached! Click 'Done' to save all photos."
          }`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Done Adding Photos",
                  callback_data: "admin_photos_done",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleAdminPhotoUpload:", error);
      bot().sendMessage(
        chatId,
        "❌ Error handling photo upload. Please try again."
      );
    }
  },

  async handleAdminMediaGroupPhoto(msg) {
    const chatId = msg.chat.id;
    try {
      const {
        addToMediaGroup,
        getMediaGroup,
        clearMediaGroup,
      } = require("../services/botService");
      const mediaGroupId = msg.media_group_id;

      // Add photo/video to media group collection
      let newPhoto = null;
      if (msg.photo) {
        newPhoto = {
          file_id: msg.photo[msg.photo.length - 1].file_id,
          file_size: msg.photo[msg.photo.length - 1].file_size,
          type: "photo",
        };
        addToMediaGroup(mediaGroupId, newPhoto);
      } else if (msg.video && msg.video.file_size <= 50 * 1024 * 1024) {
        newPhoto = {
          file_id: msg.video.file_id,
          file_size: msg.video.file_size,
          type: "video",
        };
        addToMediaGroup(mediaGroupId, newPhoto);
      }

      // Set a timeout to process the complete media group
      // This gives time for all photos in the group to arrive
      setTimeout(async () => {
        try {
          const state = getState(chatId);
          let photos = state.photos || [];

          // Check if this media group has already been processed
          const mediaGroupData =
            require("../services/botService").mediaGroups?.get(mediaGroupId);
          if (!mediaGroupData || mediaGroupData.processed) return;

          // Mark as processed to prevent duplicate confirmations
          mediaGroupData.processed = true;

          const mediaGroupPhotos = getMediaGroup(mediaGroupId);
          if (mediaGroupPhotos.length === 0) return;

          // Get current saved photos count (for add mode)
          let currentSavedCount = 0;
          if (state.photoMode === "add") {
            const currentSavedPhotos = await db.getPostPhotos(state.postId);
            currentSavedCount = currentSavedPhotos.length;
          }

          // Calculate how many photos we can add
          const maxCanAdd = 8 - currentSavedCount - photos.length;
          const totalPhotosToAdd = Math.min(mediaGroupPhotos.length, maxCanAdd);

          if (totalPhotosToAdd <= 0) {
            await bot().sendMessage(
              chatId,
              `❌ Cannot add more photos. Maximum is 8 total.\n\n` +
                `Current saved: ${currentSavedCount}\n` +
                `In queue: ${photos.length}\n` +
                `Please click 'Done' to save current photos.`
            );
            clearMediaGroup(mediaGroupId);
            return;
          }

          const newPhotos = mediaGroupPhotos.slice(0, totalPhotosToAdd);
          photos = [...photos, ...newPhotos];

          // Clear the media group from memory
          clearMediaGroup(mediaGroupId);

          // Update state
          setState(chatId, { ...state, photos });

          const totalWillHave = currentSavedCount + photos.length;

          // Send single confirmation message
          if (totalWillHave >= 8) {
            await bot().sendMessage(
              chatId,
              `✅ ${newPhotos.length} photos added!${
                mediaGroupPhotos.length > totalPhotosToAdd
                  ? ` (Maximum reached, took first ${totalPhotosToAdd} of ${mediaGroupPhotos.length})`
                  : ""
              }\n\n` +
                `Total will be: 8/8\n\n` +
                `Maximum reached! Click 'Done' to save all photos.`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "✅ Done Adding Photos",
                        callback_data: "admin_photos_done",
                      },
                    ],
                  ],
                },
              }
            );
          } else {
            await bot().sendMessage(
              chatId,
              `✅ ${newPhotos.length} photos added! Total will be: ${totalWillHave}/8\n\n` +
                `${
                  totalWillHave < 8
                    ? "Send more photos or click 'Done' when finished."
                    : "Maximum reached! Click 'Done' to save all photos."
                }`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "✅ Done Adding Photos",
                        callback_data: "admin_photos_done",
                      },
                    ],
                  ],
                },
              }
            );
          }
        } catch (error) {
          console.error("Error processing admin media group:", error);
        }
      }, 1000); // Wait 1 second for all photos in group to arrive
    } catch (error) {
      console.error("Error in handleAdminMediaGroupPhoto:", error);
      bot().sendMessage(
        chatId,
        "❌ Error handling photo group. Please try again."
      );
    }
  },

  async handleEditDone(callback) {
    try {
      const chatId = callback.message.chat.id;
      const postId = callback.data.split("_")[2];

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id, { text: "Editing completed!" });

      setState(chatId, { step: null });

      await bot().editMessageText(
        "✅ Editing completed!\n\nNow you can approve or reject the post:",
        {
          chat_id: chatId,
          message_id: callback.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Approve & Publish",
                  callback_data: `approve_${postId}`,
                },
                { text: "❌ Reject", callback_data: `reject_${postId}` },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleEditDone:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "Error completing edit!",
        });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminSkipPlatformLink(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      setState(chatId, {
        step: null,
        admin_display_name: state.admin_display_name,
        admin_contact_info: state.admin_contact_info,
        admin_platform_link: null,
        admin_platform_name: null,
      });

      await bot().sendMessage(
        chatId,
        "✅ መረጃዎች ተቀምጠዋል!\n\n" + "አሁን ለማስታወቂያ ፍሰት ይመራሉ..."
      );

      // Start the normal posting flow
      const postController = require("./postController");
      await postController.askPropertyType(chatId);
    } catch (error) {
      console.error("Error in handleAdminSkipPlatformLink:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminCreatePost(callback) {
    try {
      const chatId = callback.message.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot().answerCallbackQuery(callback.id, {
          text: "Access denied!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      setState(chatId, { step: "admin_post_name" });

      await bot().sendMessage(
        chatId,
        "➕ <b>Admin Post Creation</b>\n\n" +
          "እባክዎ በማስታወቂያው ላይ እንዲታይ የሚፈልጉትን ስም ያስገቡ:",
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Error in handleAdminCreatePost:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "Error!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleAdminPostInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (
        !state ||
        (!state.step.startsWith("admin_post_") &&
          state.step !== "admin_photo_upload")
      ) {
        return;
      }

      // Handle admin photo uploads
      if (state.step === "admin_photo_upload") {
        return this.handleAdminPhotoUpload(msg);
      }

      if (state.step === "admin_post_name") {
        if (!msg.text || msg.text.length < 1) {
          return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ስም ያስገቡ:");
        }

        setState(chatId, {
          step: "admin_post_phone",
          admin_display_name: msg.text.trim(),
        });

        await bot().sendMessage(
          chatId,
          "📱 እባክዎ በማስታወቂያው ላይ እንዲታይ የሚፈልጉትን የስልክ ቁጥር ያስገቡ:"
        );
      } else if (state.step === "admin_post_phone") {
        if (!msg.text || msg.text.length < 10) {
          return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ:");
        }

        setState(chatId, {
          step: "admin_post_platform_link",
          admin_display_name: state.admin_display_name,
          admin_contact_info: msg.text.trim(),
        });

        await bot().sendMessage(
          chatId,
          "🔗 ቤቱን በሌላ ቦታ አስተዋውቀዋል?\n\n" +
            "ቤቱ በ Facebook, TikTok, Jiji, YouTube ወይም ሌላ ቦታ ከተለጠፈ ሊንኩን እዚህ ያስገቡ።\n\n" +
            "ካልተለጠፈ 'ዝለል' ብለው ይጻፉ:",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⏭️ ሌላ ቦታ አለጠፍኩም",
                    callback_data: "admin_skip_platform_link",
                  },
                ],
              ],
            },
          }
        );
      } else if (state.step === "admin_post_platform_link") {
        let platformLink = null;
        let platformName = null;

        if (
          msg.text &&
          msg.text.trim() &&
          msg.text.trim().toLowerCase() !== "ዝለል"
        ) {
          const link = msg.text.trim();

          // Validate URL
          let validatedLink = link;
          try {
            new URL(link);
          } catch (e) {
            // Try with http:// prefix if no protocol is provided
            try {
              new URL(`http://${link}`);
              validatedLink = `http://${link}`;
            } catch (e2) {
              return bot().sendMessage(
                chatId,
                "❌ እባክዎ ትክክለኛ ሊንክ ያስገቡ (https://example.com):\n\nወይም መስገባት ካልፈለጉ 'ዝለል' ብለው ይጻፉ"
              );
            }
          }

          // Detect platform
          platformName = "ሌላ";
          if (
            validatedLink.includes("facebook.com") ||
            validatedLink.includes("fb.com")
          ) {
            platformName = "Facebook";
          } else if (validatedLink.includes("tiktok.com")) {
            platformName = "TikTok";
          } else if (validatedLink.includes("jiji.")) {
            platformName = "Jiji";
          } else if (
            validatedLink.includes("youtube.com") ||
            validatedLink.includes("youtu.be")
          ) {
            platformName = "YouTube";
          } else if (validatedLink.includes("instagram.com")) {
            platformName = "Instagram";
          } else if (
            validatedLink.includes("t.me") ||
            validatedLink.includes("telegram.me")
          ) {
            platformName = "Telegram";
          }

          platformLink = validatedLink;
          await bot().sendMessage(chatId, `✅ የ ${platformName} ሊንክ ተቀምጧል!`);
        }

        setState(chatId, {
          step: null,
          admin_display_name: state.admin_display_name,
          admin_contact_info: state.admin_contact_info,
          admin_platform_link: platformLink,
          admin_platform_name: platformName,
        });

        await bot().sendMessage(
          chatId,
          "✅ መረጃዎች ተቀምጠዋል!\n\n" + "አሁን ለማስታወቂያ ፍሰት ይመራሉ..."
        );

        // Start the normal posting flow
        const postController = require("./postController");
        await postController.askPropertyType(chatId);
      }
    } catch (error) {
      console.error("Error in handleAdminPostInput:", error);
      bot().sendMessage(msg.chat.id, "❌ Error processing input.");
    }
  },

  async handleRejectionReasonInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!state || state.step !== "admin_rejection_reason") {
        return;
      }

      const reason = msg.text.trim();
      if (!reason || reason.length < 3) {
        return bot().sendMessage(
          chatId,
          "❌እባክዎ ግላጽ ምክንያት ያስገቡ (ቢያንስ 10 ፊደሎች):"
        );
      }

      const postId = state.postId;
      const rejectionMessageId = state.rejectionMessageId;

      // Update post status with rejection reason
      await db.updatePostStatus(postId, "rejected", reason);

      // Get post details
      const post = await db.getPost(postId);

      // Notify user with rejection reason and try again option
      await bot().sendMessage(
        post.telegram_id,
        "❌ <b>ማስታወቂያዎ አልተለቀቀም!</b>\n\n" +
          `📝 <b>ምክንያት:</b> ${reason}\n\n` +
          "እባክዎ ከላይ ያለውን ችግር ያስተካክሉ እና እንደገና ይሞክሩ:",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔄 እንደገና ሞክር",
                  callback_data: "try_again_after_rejection",
                },
              ],
            ],
          },
        }
      );

      // Update the admin message
      await bot().editMessageText(
        `${post.title || "ማስታወቂያ"} - ID: ${
          post.id
        }\n\n❌ <b>REJECTED</b>\n\n📝 <b>ምክንያት:</b> ${reason}`,
        {
          chat_id: chatId,
          message_id: rejectionMessageId,
          parse_mode: "HTML",
        }
      );

      // Send confirmation to admin
      await bot().sendMessage(
        chatId,
        "✅ ማስታወቂያው አልተለቀቀም እና ተጠቃሚው ምክንያቱ ተነግሮታል።"
      );

      // Clear state
      setState(chatId, { step: null });
    } catch (error) {
      console.error("Error in handleRejectionReasonInput:", error);
      bot().sendMessage(msg.chat.id, "❌ Error processing rejection reason.");
    }
  },

  async handleVillaTypeEdit(callback) {
    try {
      const chatId = callback.message.chat.id;
      const villaType = callback.data.split("_")[2];
      const state = getState(chatId);

      if (!state || state.step !== "admin_edit_villa_type") {
        return bot().answerCallbackQuery(callback.id, {
          text: "Invalid state!",
        });
      }

      // Answer callback query
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;
      const post = state.post;

      // Update villa type
      await db.updatePostByAdmin(postId, { villa_type: villaType });

      // Get updated post for displaying new edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getEditOptionsForPost(updatedPost, postId);

      await bot().editMessageText(
        `✅ Villa Type updated successfully!\n\n` +
          `📋 <b>New Value:</b> ${villaType}\n\n` +
          "What else would you like to edit?",
        {
          chat_id: chatId,
          message_id: callback.message.message_id,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "admin_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleVillaTypeEdit:", error);
      bot().answerCallbackQuery(callback.id, {
        text: "Error updating villa type!",
      });
    }
  },

  async handleBathroomTypeEdit(callback) {
    try {
      const chatId = callback.message.chat.id;
      const bathroomType = callback.data.split("_")[2];
      const state = getState(chatId);

      if (!state || state.step !== "admin_edit_bathroom_type") {
        return bot().answerCallbackQuery(callback.id, {
          text: "Invalid state!",
        });
      }

      // Answer callback query
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;
      const post = state.post;

      // Update bathroom type
      await db.updatePostByAdmin(postId, { bathroom_type: bathroomType });

      // Get updated post for displaying new edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getEditOptionsForPost(updatedPost, postId);

      await bot().editMessageText(
        `✅ Bathroom Type updated successfully!\n\n` +
          `📋 <b>New Value:</b> ${bathroomType}\n\n` +
          "What else would you like to edit?",
        {
          chat_id: chatId,
          message_id: callback.message.message_id,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "admin_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleBathroomTypeEdit:", error);
      bot().answerCallbackQuery(callback.id, {
        text: "Error updating bathroom type!",
      });
    }
  },
};
