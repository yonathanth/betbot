const { bot, setState, getState } = require("../services/botService");
const db = require("../services/dbService");
const channelService = require("../services/channelService");

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
  const propertyEmoji = post.property_type === "residential" ? "🏠" : "🏢";
  const typeLabel =
    post.property_type === "residential" ? "Residential" : "Commercial";

  let message = `${propertyEmoji} <b>${typeLabel} Property</b> - ID: ${post.id}\n\n`;

  if (post.title) {
    message += `📋 <b>Title:</b> ${post.title}\n\n`;
  }

  if (post.description) {
    message += `📝 <b>Description:</b>\n${post.description}\n\n`;
  }

  if (post.location) {
    message += `📍 <b>Location:</b> ${post.location}\n`;
  }

  if (post.price) {
    message += `💰 <b>Price:</b> ${post.price}\n`;
  }

  if (post.contact_info) {
    message += `📞 <b>Contact:</b> ${post.contact_info}\n`;
  }

  message += `\n👤 <b>Submitted by:</b> ${post.user_name || "Anonymous"}`;
  message += `\n📱 <b>Phone:</b> ${post.phone || "Not provided"}`;
  message += `\n🆔 <b>User ID:</b> ${post.telegram_id}`;
  message += `\n⏰ <b>Submitted:</b> ${new Date(
    post.created_at
  ).toLocaleString()}`;

  return message;
}

module.exports = {
  async handleAdminCommand(msg) {
    try {
      const chatId = msg.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot.sendMessage(chatId, "❌ You don't have admin access.");
      }

      const stats = await db.getStats();
      const message =
        `🛠 <b>Admin Panel</b>\n\n` +
        `📊 <b>Statistics:</b>\n` +
        `👥 Total Users: ${stats.totalUsers}\n` +
        `📋 Total Posts: ${stats.totalPosts}\n` +
        `⏳ Pending Posts: ${stats.pendingPosts}\n` +
        `✅ Published Posts: ${stats.publishedPosts}`;

      bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Pending Posts", callback_data: "admin_pending" }],
            [{ text: "📊 Statistics", callback_data: "admin_stats" }],
          ],
        },
      });
    } catch (error) {
      console.error("Error in handleAdminCommand:", error);
      bot.sendMessage(msg.chat.id, "❌ Something went wrong.");
    }
  },

  async showPendingPosts(callback) {
    try {
      const chatId = callback.message.chat.id;

      if (!(await isAdmin(chatId))) {
        return bot.answerCallbackQuery(callback.id, { text: "Access denied!" });
      }

      const posts = await db.getPendingPosts();

      if (posts.length === 0) {
        return bot.editMessageText("📭 No pending posts at the moment.", {
          chat_id: chatId,
          message_id: callback.message.message_id,
        });
      }

      bot.answerCallbackQuery(callback.id);

      for (const post of posts) {
        const message = formatPostForAdmin(post);
        await bot.sendMessage(chatId, message, {
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
    } catch (error) {
      console.error("Error in showPendingPosts:", error);
      bot.answerCallbackQuery(callback.id, { text: "Error loading posts!" });
    }
  },

  async handlePostApproval(callback) {
    try {
      const chatId = callback.message.chat.id;
      const action = callback.data.split("_")[0];
      const postId = callback.data.split("_")[1];

      if (!(await isAdmin(chatId))) {
        return bot.answerCallbackQuery(callback.id, { text: "Access denied!" });
      }

      if (action === "approve") {
        await db.updatePostStatus(postId, "approved");
        await channelService.publishToChannel(postId);

        // Notify user
        const post = await db.getPost(postId);
        await bot.sendMessage(
          post.telegram_id,
          "🎉 Congratulations! Your property listing has been approved and published!\n\n" +
            "📢 It's now live on our property channel."
        );

        await bot.editMessageText(
          callback.message.text + "\n\n✅ <b>APPROVED & PUBLISHED</b>",
          {
            chat_id: chatId,
            message_id: callback.message.message_id,
            parse_mode: "HTML",
          }
        );

        bot.answerCallbackQuery(callback.id, {
          text: "Post approved and published!",
        });
      } else if (action === "reject") {
        await db.updatePostStatus(postId, "rejected");

        // Notify user
        const post = await db.getPost(postId);
        await bot.sendMessage(
          post.telegram_id,
          "❌ Your property listing was not approved.\n\n" +
            "Please ensure your listing follows our guidelines and try again with /start"
        );

        await bot.editMessageText(
          callback.message.text + "\n\n❌ <b>REJECTED</b>",
          {
            chat_id: chatId,
            message_id: callback.message.message_id,
            parse_mode: "HTML",
          }
        );

        bot.answerCallbackQuery(callback.id, { text: "Post rejected." });
      }
    } catch (error) {
      console.error("Error in handlePostApproval:", error);
      bot.answerCallbackQuery(callback.id, {
        text: "Error processing request!",
      });
    }
  },

  async handleEditPost(callback) {
    try {
      const chatId = callback.message.chat.id;
      const postId = callback.data.split("_")[1];

      if (!(await isAdmin(chatId))) {
        return bot.answerCallbackQuery(callback.id, { text: "Access denied!" });
      }

      setState(chatId, { step: "admin_edit", postId: parseInt(postId) });

      await bot.sendMessage(
        chatId,
        "✏️ <b>Edit Post Mode</b>\n\n" + "What would you like to edit?",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📋 Title",
                  callback_data: `edit_field_title_${postId}`,
                },
              ],
              [
                {
                  text: "📍 Location",
                  callback_data: `edit_field_location_${postId}`,
                },
              ],
              [
                {
                  text: "💰 Price",
                  callback_data: `edit_field_price_${postId}`,
                },
              ],
              [
                {
                  text: "📞 Contact",
                  callback_data: `edit_field_contact_${postId}`,
                },
              ],
              [
                {
                  text: "📝 Description",
                  callback_data: `edit_field_description_${postId}`,
                },
              ],
              [
                {
                  text: "✅ Done Editing",
                  callback_data: `edit_done_${postId}`,
                },
              ],
            ],
          },
        }
      );

      bot.answerCallbackQuery(callback.id);
    } catch (error) {
      console.error("Error in handleEditPost:", error);
      bot.answerCallbackQuery(callback.id, { text: "Error starting edit!" });
    }
  },

  async handleEditField(callback) {
    try {
      const chatId = callback.message.chat.id;
      const parts = callback.data.split("_");
      const field = parts[2];
      const postId = parts[3];

      if (!(await isAdmin(chatId))) {
        return bot.answerCallbackQuery(callback.id, { text: "Access denied!" });
      }

      setState(chatId, {
        step: `admin_edit_${field}`,
        postId: parseInt(postId),
        editingField: field,
      });

      const fieldNames = {
        title: "Title",
        location: "Location",
        price: "Price",
        contact: "Contact Info",
        description: "Description",
      };

      await bot.sendMessage(
        chatId,
        `✏️ Enter new ${fieldNames[field]}:\n\n` +
          `<i>Type your new ${fieldNames[
            field
          ].toLowerCase()} and send it.</i>`,
        { parse_mode: "HTML" }
      );

      bot.answerCallbackQuery(callback.id);
    } catch (error) {
      console.error("Error in handleEditField:", error);
      bot.answerCallbackQuery(callback.id, {
        text: "Error starting field edit!",
      });
    }
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

      // Update the post field
      const updateData = {};
      updateData[field] = msg.text.trim();

      await db.updatePostByAdmin(postId, updateData);

      await bot.sendMessage(
        chatId,
        `✅ ${
          field.charAt(0).toUpperCase() + field.slice(1)
        } updated successfully!\n\n` + "What else would you like to edit?",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📋 Title",
                  callback_data: `edit_field_title_${postId}`,
                },
              ],
              [
                {
                  text: "📍 Location",
                  callback_data: `edit_field_location_${postId}`,
                },
              ],
              [
                {
                  text: "💰 Price",
                  callback_data: `edit_field_price_${postId}`,
                },
              ],
              [
                {
                  text: "📞 Contact",
                  callback_data: `edit_field_contact_${postId}`,
                },
              ],
              [
                {
                  text: "📝 Description",
                  callback_data: `edit_field_description_${postId}`,
                },
              ],
              [
                {
                  text: "✅ Done Editing",
                  callback_data: `edit_done_${postId}`,
                },
              ],
            ],
          },
        }
      );

      setState(chatId, { step: "admin_edit", postId });
    } catch (error) {
      console.error("Error in handleEditInput:", error);
      bot.sendMessage(
        msg.chat.id,
        "❌ Failed to update field. Please try again."
      );
    }
  },

  async handleEditDone(callback) {
    try {
      const chatId = callback.message.chat.id;
      const postId = callback.data.split("_")[2];

      setState(chatId, { step: null });

      await bot.editMessageText(
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

      bot.answerCallbackQuery(callback.id, { text: "Editing completed!" });
    } catch (error) {
      console.error("Error in handleEditDone:", error);
      bot.answerCallbackQuery(callback.id, { text: "Error completing edit!" });
    }
  },
};
