const { bot } = require("./botService");
const db = require("./dbService");

// Helper function for formatting posts
function formatPostForChannel(post) {
  const propertyEmoji = post.property_type === "residential" ? "🏠" : "🏢";
  const typeLabel =
    post.property_type === "residential" ? "Residential" : "Commercial";

  let message = `${propertyEmoji} <b>${typeLabel} Property</b>\n\n`;

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

  message += `\n👤 <b>Posted by:</b> ${post.user_name || "Anonymous"}`;

  if (post.phone) {
    message += `\n📱 <b>Phone:</b> ${post.phone}`;
  }

  message += `\n\n⏰ <i>Posted: ${new Date(
    post.created_at
  ).toLocaleDateString()}</i>`;

  return message;
}

module.exports = {
  async publishToChannel(postId) {
    try {
      const post = await db.getPost(postId);
      if (!post) {
        throw new Error("Post not found");
      }

      const channelId = process.env.CHANNEL_ID;
      if (!channelId) {
        throw new Error("Channel ID not configured");
      }

      const message = formatPostForChannel(post);

      const sentMessage = await bot.sendMessage(channelId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Contact Seller",
                url: `tg://user?id=${post.telegram_id}`,
              },
            ],
          ],
        },
      });

      // Update post status to published
      await db.updatePostStatus(postId, "published");

      console.log(`✅ Post #${postId} published to channel`);
      return sentMessage;
    } catch (error) {
      console.error("Error publishing to channel:", error);
      throw error;
    }
  },

  async notifyAdmins(postId, message) {
    try {
      const adminIds = process.env.ADMIN_IDS?.split(",") || [];

      for (const adminId of adminIds) {
        if (adminId.trim()) {
          try {
            await bot.sendMessage(adminId.trim(), message, {
              parse_mode: "HTML",
            });
          } catch (error) {
            console.error(`Failed to notify admin ${adminId}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.error("Error notifying admins:", error);
    }
  },
};
