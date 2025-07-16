const { getBot } = require("./botService");
const db = require("./dbService");

// Function to get bot instance
const bot = () => getBot();

// Helper function for formatting posts in Amharic
function formatPostForChannel(post) {
  const typeLabel =
    post.property_type === "residential" ? "የሚከራይ ቤት" : "የሚከራይ ስራ ቦታ";

  // Use display ID with PREPOSTS offset
  const preposts = parseInt(process.env.PREPOSTS) || 0;
  const displayId = post.id + preposts;

  let message = `<b>${typeLabel}</b>\n`;
  message += `<b>ID</b> ${String(displayId).padStart(5, "0")}\n\n`;

  if (post.title) {
    message += `<b>ዓይነት:</b> ${post.title}`;

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

  if (specs.length > 0) {
    message += `<b>ዝርዝሮች:</b>\n${specs.join(" ")}`;

    // Property size on new line
    if (post.property_size) {
      message += `\n📐 ${post.property_size}`;
    }

    message += `\n\n`;
  } else if (post.property_size) {
    // If only property size exists
    message += `<b>ዝርዝሮች:</b>\n📐 ${post.property_size}\n\n`;
  }

  if (post.location) {
    message += `<b>አድራሻ:</b> ${post.location}\n`;
  }

  if (post.price) {
    message += `<b>ዋጋ:</b> ${post.price}\n\n`;
  }

  if (post.description) {
    message += `<b>ዝርዝር መግለጫ:</b>\n${post.description}\n\n`;
  }

  // Add platform link if available
  if (
    post.platform_link &&
    post.platform_name &&
    post.platform_link.trim() !== ""
  ) {
    message += `<b>ተጨማሪ:</b> ቤቱን በ <a href="${post.platform_link}"><b>${post.platform_name}</b></a>🤏\n\n`;
  }

  // Hashtags section
  message += `<b>ተመሣሣይ ቤቶች</b>\n`;

  // Price range hashtag
  const priceHashtag = generatePriceHashtag(post.price);
  if (priceHashtag) {
    message += `#${priceHashtag}\n`;
  }

  // Property type hashtag (remove spaces)
  if (post.title) {
    const titleHashtag = post.title.replace(/\s+/g, "");
    message += `#${titleHashtag}\n`;
  }

  // Main address hashtag (extract first part of location, remove spaces)
  if (post.location) {
    const mainLocation = post.location.split(",")[0].trim().replace(/\s+/g, "");
    message += `#${mainLocation}`;
  }

  return message;
}

// Helper function to generate price range hashtag
function generatePriceHashtag(priceStr) {
  if (!priceStr) return null;

  // Extract numbers from price string
  const numbers = priceStr.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;

  const price = parseInt(numbers.join(""));

  if (price < 10000) return "ከ_10ሺ_በታች";
  if (price < 20000) return "ከ_20ሺ_በታች";
  if (price < 30000) return "ከ_30ሺ_በታች";
  if (price < 40000) return "ከ_40ሺ_በታች";
  if (price < 50000) return "ከ_50ሺ_በታች";
  if (price < 100000) return "ከ_100ሺ_በታች";
  if (price < 200000) return "ከ_200ሺ_በታች";
  if (price < 500000) return "ከ_500ሺ_በታች";
  if (price < 1000000) return "ከ_1_ሚሊዮን_በታች";
  if (price < 2000000) return "ከ_2_ሚሊዮን_በታች";
  if (price < 5000000) return "ከ_5_ሚሊዮን_በታች";
  if (price < 10000000) return "ከ_10_ሚሊዮን_በታች";

  return "ከ_10_ሚሊዮን_በላይ";
}

// Helper function to generate caption for photos
function generatePhotoCaption(post) {
  const preposts = parseInt(process.env.PREPOSTS) || 0;
  const displayId = post.id + preposts;
  return `<b>ID</b> ${String(displayId).padStart(5, "0")}`;
}

// Format post for preview (same as channel but without contact info)
function formatPostForPreview(post) {
  const typeLabel =
    post.property_type === "residential" ? "የሚከራይ ቤት" : "የሚከራይ ስራ ቦታ";

  // Use display ID with PREPOSTS offset
  const preposts = parseInt(process.env.PREPOSTS) || 0;
  const displayId = post.id + preposts;

  let message = `<b>${typeLabel}</b>\n`;
  message += `<b>ID</b> ${String(displayId).padStart(5, "0")}\n\n`;

  // Property type and details
  if (post.title) {
    message += `<b>ዓይነት</b> - ${post.title}`;

    // Add villa type if exists
    if (post.villa_type) {
      message += ` - ${post.villa_type}`;
    }
    if (post.villa_type_other) {
      message += ` - ${post.villa_type_other}`;
    }

    // Add floor info
    if (post.floor) {
      message += ` - ${post.floor}`;
    }

    message += `\n\n`;
  }

  // Property specifications
  let specs = [];
  if (post.bedrooms) {
    specs.push(`🛏 ${post.bedrooms} መኝታ ክፍል`);
  }
  if (post.bathrooms) {
    specs.push(`🚿 ${post.bathrooms} መታጠቢያ ቤት`);
  } else if (post.bathroom_type) {
    specs.push(`🚿 ${post.bathroom_type} መታጠቢያ ቤት`);
  }

  if (specs.length > 0) {
    message += `<b>ዝርዝሮች:</b>\n${specs.join("  ")}`;

    // Property size on new line
    if (post.property_size) {
      message += `\n📐 ${post.property_size}`;
    }

    message += `\n\n`;
  } else if (post.property_size) {
    // If only property size exists
    message += `<b>ዝርዝሮች:</b>\n📐 ${post.property_size}\n\n`;
  }

  // Address
  if (post.location) {
    message += `<b>አድራሻ</b> - ${post.location}\n`;
  }

  // Price
  if (post.price) {
    message += `<b>ዋጋ</b> - ${post.price}\n\n`;
  }

  // Additional description
  if (post.description) {
    message += `<b>ተጨማሪ:</b>\n${post.description}\n\n`;
  }

  // Platform link if exists
  if (
    post.platform_link &&
    post.platform_name &&
    post.platform_link.trim() !== ""
  ) {
    message += `<b>ተጨማሪ:</b> ቤቱን በ <a href="${post.platform_link}"><b>${post.platform_name}</b></a>🤏\n\n`;
  }

  // Contact information
  const contactName = post.display_name || post.user_name || "የማይታወቅ";
  message += `${contactName}\n`;

  if (post.contact_info) {
    message += `${post.contact_info}\n\n`;
  } else if (post.phone) {
    message += `${post.phone}\n\n`;
  }

  // Hashtags section
  message += `<b>ተመሣሣይ ቤቶች</b>\n`;

  // Price range hashtag
  const priceHashtag = generatePriceHashtag(post.price);
  if (priceHashtag) {
    message += `#${priceHashtag}\n`;
  }

  // Property type hashtag (remove spaces)
  if (post.title) {
    const titleHashtag = post.title.replace(/\s+/g, "");
    message += `#${titleHashtag}\n`;
  }

  // Main address hashtag (extract first part of location, remove spaces)
  if (post.location) {
    const mainLocation = post.location.split(",")[0].trim().replace(/\s+/g, "");
    message += `#${mainLocation}`;
  }

  return message;
}

module.exports = {
  formatPostForChannel,

  async markPostAsRentedOnChannel(postId) {
    try {
      const post = await db.getPost(postId);
      if (!post || !post.channel_message_id) {
        console.log(`No channel message ID found for post ${postId}`);
        return false;
      }

      // Get current formatted post
      const currentPost = formatPostForChannel(post);

      // Add "RENTED" status to the message with centered alignment
      const rentedPost = `<b>--- ይህ ቤት ተከራይቷል ---</b>\n\n${currentPost}`;

      // Keep the original contact buttons
      const botUsername = process.env.BOT_USERNAME || "YourBotUsername";
      const deepLink = `https://t.me/${botUsername}?start=contact_${postId}`;
      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: "አከራይ/ደላላውን ያግኙ",
              url: deepLink,
            },
          ],
        ],
      };

      try {
        // Try to edit the message caption (for photo posts)
        await bot().editMessageCaption(rentedPost, {
          chat_id: process.env.CHANNEL_ID,
          message_id: post.channel_message_id,
          parse_mode: "HTML",
          reply_markup: inlineKeyboard,
        });

        console.log(`✅ Post #${postId} marked as rented on channel`);
        return true;
      } catch (editError) {
        // If it's a text message or no caption to edit, use editMessageText instead
        if (
          editError.message.includes("message to edit not found") ||
          editError.message.includes("message is not modified") ||
          editError.message.includes("message can't be edited") ||
          editError.message.includes(
            "there is no caption in the message to edit"
          )
        ) {
          try {
            await bot().editMessageText(rentedPost, {
              chat_id: process.env.CHANNEL_ID,
              message_id: post.channel_message_id,
              parse_mode: "HTML",
              reply_markup: inlineKeyboard,
            });

            console.log(
              `✅ Post #${postId} marked as rented on channel (text edit)`
            );
            return true;
          } catch (textEditError) {
            console.error(
              `Error editing channel message text for post ${postId}:`,
              textEditError
            );
            return false;
          }
        }

        console.error(
          `Error editing channel message for post ${postId}:`,
          editError
        );
        return false;
      }
    } catch (error) {
      console.error(
        `Error marking post ${postId} as rented on channel:`,
        error
      );
      return false;
    }
  },

  async publishToChannel(postId) {
    try {
      const post = await db.getPost(postId);
      if (!post) {
        throw new Error(`Post ${postId} not found`);
      }

      const formattedPost = formatPostForChannel(post);
      const photos = await db.getPostPhotos(postId);

      const contactButtonText = "አከራይ/ደላላውን ያግኙ";

      // Use deep linking to redirect users to private chat with bot
      const botUsername = process.env.BOT_USERNAME || "YourBotUsername"; // Make sure to set this in .env
      const deepLink = `https://t.me/${botUsername}?start=contact_${postId}`;

      const inlineKeyboard = {
        inline_keyboard: [
          [
            {
              text: contactButtonText,
              url: deepLink,
            },
          ],
        ],
      };

      let channelMessage = null;

      if (photos && photos.length > 0) {
        if (photos.length === 1) {
          // Single media: Send using appropriate method based on file type
          const media = photos[0];
          if (media.file_type === "video") {
            channelMessage = await bot().sendVideo(
              process.env.CHANNEL_ID,
              media.telegram_file_id,
              {
                caption: formattedPost,
                parse_mode: "HTML",
                reply_markup: inlineKeyboard,
              }
            );
          } else if (media.file_type === "document") {
            channelMessage = await bot().sendDocument(
              process.env.CHANNEL_ID,
              media.telegram_file_id,
              {
                caption: formattedPost,
                parse_mode: "HTML",
                reply_markup: inlineKeyboard,
              }
            );
          } else {
            channelMessage = await bot().sendPhoto(
              process.env.CHANNEL_ID,
              media.telegram_file_id,
              {
                caption: formattedPost,
                parse_mode: "HTML",
                reply_markup: inlineKeyboard,
              }
            );
          }

          console.log(`✅ Post #${postId} published to channel with 1 media`);
        } else {
          // Multiple photos: Media group first, then first photo with full post + button

          // If there are additional photos, send them as media group first
          if (photos.length > 1) {
            const idCaption = generatePhotoCaption(post); // Returns "ID 00034" format
            const remainingPhotos = photos.slice(1); // Get photos from index 1 onwards

            const mediaGroup = remainingPhotos.map((photo, index) => ({
              type:
                photo.file_type === "video"
                  ? "video"
                  : photo.file_type === "document"
                  ? "document"
                  : "photo",
              media: photo.telegram_file_id,
              caption: index === 0 ? idCaption : undefined,
              parse_mode: index === 0 ? "HTML" : undefined,
            }));

            await bot().sendMediaGroup(process.env.CHANNEL_ID, mediaGroup);
          }

          // Then send first media with full post text and button
          const firstMedia = photos[0];
          if (firstMedia.file_type === "video") {
            channelMessage = await bot().sendVideo(
              process.env.CHANNEL_ID,
              firstMedia.telegram_file_id,
              {
                caption: formattedPost,
                parse_mode: "HTML",
                reply_markup: inlineKeyboard,
              }
            );
          } else if (firstMedia.file_type === "document") {
            channelMessage = await bot().sendDocument(
              process.env.CHANNEL_ID,
              firstMedia.telegram_file_id,
              {
                caption: formattedPost,
                parse_mode: "HTML",
                reply_markup: inlineKeyboard,
              }
            );
          } else {
            channelMessage = await bot().sendPhoto(
              process.env.CHANNEL_ID,
              firstMedia.telegram_file_id,
              {
                caption: formattedPost,
                parse_mode: "HTML",
                reply_markup: inlineKeyboard,
              }
            );
          }

          console.log(
            `✅ Post #${postId} published to channel with ${photos.length} media`
          );
        }
      } else {
        // Send text-only post with inline button
        channelMessage = await bot().sendMessage(
          process.env.CHANNEL_ID,
          formattedPost,
          {
            parse_mode: "HTML",
            reply_markup: inlineKeyboard,
          }
        );

        console.log(`✅ Post #${postId} published to channel (text only)`);
      }

      // Store channel message ID if we have one
      if (channelMessage && channelMessage.message_id) {
        await db.updatePostChannelMessageId(postId, channelMessage.message_id);
      }

      // Update post status to published
      await db.updatePostStatus(postId, "published");
    } catch (error) {
      console.error(`❌ Error publishing post ${postId}:`, error);
      throw error;
    }
  },

  async sendContactInfoPrivately(userId, post) {
    try {
      // Prepare contact information
      const contactName = post.display_name || post.user_name || "የማይታወቅ";
      let contactInfo = `<b>አከራይ/ደላላ:</b>\n\n`;
      contactInfo += `<b>👨🏽‍💼 ${contactName}</b>\n`;

      if (post.contact_info) {
        contactInfo += `<b>📞 </b>${post.contact_info}\n\n`;
      } else if (post.phone) {
        contactInfo += `<b>📞 </b>${post.phone}\n\n`;
      }

      // Send contact info as private message
      await bot().sendMessage(userId, contactInfo, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "በቀጥታ ያነጋግሩ",
                url: `tg://user?id=${post.telegram_id}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      console.error("Error sending contact info privately:", error);

      // If private message fails, user may need to start the bot first
      try {
        await bot().sendMessage(
          userId,
          "❌ የግል መልእክት መላክ አልተቻለም። እባክዎ በመጀመሪያ /start ይጫኑ፣ ከዚያ እንደገና ይሞክሩ።"
        );
      } catch (fallbackError) {
        console.error("Could not send fallback message:", fallbackError);
      }
    }
  },

  // Helper function to format Ethiopian phone numbers to international format
  formatPhoneToInternational(phone) {
    if (!phone) return null;

    // Remove any spaces, dashes, or other formatting
    const cleanPhone = phone.replace(/[\s-+()]/g, "");

    // Check if it's already in international format
    if (cleanPhone.startsWith("251")) {
      return `+${cleanPhone}`;
    }

    // Convert Ethiopian local numbers to international
    if (cleanPhone.startsWith("09")) {
      return `+251${cleanPhone.substring(1)}`;
    } else if (cleanPhone.startsWith("07")) {
      return `+251${cleanPhone.substring(1)}`;
    } else if (cleanPhone.startsWith("01")) {
      return `+251${cleanPhone.substring(1)}`;
    }

    // If format doesn't match expected patterns, check if it's numeric before applying 251 format
    // If it's not numeric (like a name), return as-is without modification
    if (!/^\d+$/.test(cleanPhone)) {
      return phone; // Return original input if not numeric
    }

    // If numeric but doesn't match expected patterns, apply 251 format
    return `+251${cleanPhone}`;
  },

  async sendCombinedContactMessage(userId, post) {
    try {
      // Prepare contact information
      const contactName = post.display_name || post.user_name || "የማይታወቅ";

      // Removed welcome message - show broker info directly
      let combinedMessage = `<b>አከራይ/ደላላ:</b>\n\n`;
      combinedMessage += `<b>${contactName}</b>\n`;

      // Format phone number to international and make it clickable
      const contactPhone = post.contact_info || post.phone;
      let internationalPhone = null;

      if (contactPhone) {
        internationalPhone = this.formatPhoneToInternational(contactPhone);
        if (internationalPhone) {
          // Make phone number clickable as a link
          combinedMessage += `<b>📞 </b><a href="tel:${internationalPhone}">${internationalPhone}</a>\n\n`;
        } else {
          combinedMessage += `<b>📞 </b>${contactPhone}\n\n`;
        }
      }

      combinedMessage += `<i>ለመቀጠል ከታች ከቀረቡት አንዱን ይምረጡ</i>`;

      // Check if post creator is an admin
      const isPostCreatorAdmin =
        await require("../controllers/adminController").isAdmin(
          post.telegram_id
        );

      // Prepare inline keyboard (no call button - Telegram doesn't support tel: URLs in buttons)
      const inlineKeyboard = [];

      // Only add direct contact button if post creator is NOT an admin
      if (!isPostCreatorAdmin) {
        inlineKeyboard.push([
          {
            text: "አከራይ/ደላላውን በቴሌግራም ለማነጋገር",
            url: `tg://user?id=${post.telegram_id}`,
          },
        ]);
      }

      inlineKeyboard.push([
        {
          text: "🛖  ወደ ቻናሉ መመለስ",
          url: `https://t.me/c/${process.env.CHANNEL_ID.replace("-100", "")}`,
        },
      ]);

      inlineKeyboard.push([
        {
          text: "➕ የራሶን ቤት ለማስታወቅ",
          callback_data: "start_my_listing",
        },
      ]);

      // Send combined message with all buttons
      await bot().sendMessage(userId, combinedMessage, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });

      console.log(
        `✅ Combined contact message sent to user ${userId} for post ${post.id}`
      );
    } catch (error) {
      console.error("Error sending combined contact message:", error);

      // If private message fails, user may need to start the bot first
      try {
        await bot().sendMessage(
          userId,
          "❌ የግል መልእክት መላክ አልተቻለም። እባክዎ በመጀመሪያ /start ይጫኑ፣ ከዚያ እንደገና ይሞክሩ።"
        );
      } catch (fallbackError) {
        console.error("Could not send fallback message:", fallbackError);
      }
    }
  },

  formatPostForChannel,
  formatPostForPreview,
  notifyAdmins: async function (postId, message) {
    try {
      const admins = await db.getAdmins();
      const failedAdmins = [];

      for (const admin of admins) {
        try {
          await bot().sendMessage(admin.telegram_id, message, {
            parse_mode: "HTML",
          });
          console.log(`✅ Admin ${admin.telegram_id} notified successfully`);
        } catch (error) {
          console.error(
            `Failed to notify admin ${admin.telegram_id}:`,
            error.message
          );

          // Check if it's a "chat not found" error
          if (
            error.response &&
            error.response.body &&
            (error.response.body.description?.includes("chat not found") ||
              error.response.body.description?.includes("user not found") ||
              error.response.body.description?.includes("bot was blocked"))
          ) {
            console.warn(
              `⚠️ Admin ${admin.telegram_id} chat not accessible - marking as invalid`
            );
            failedAdmins.push(admin.telegram_id);
          }
        }
      }

      // Handle failed admin notifications
      if (failedAdmins.length > 0) {
        await this.handleInvalidAdmins(failedAdmins);
      }
    } catch (error) {
      console.error("Error notifying admins:", error);
    }
  },

  async handleInvalidAdmins(invalidAdminIds) {
    try {
      console.log(
        `🧹 Handling ${
          invalidAdminIds.length
        } invalid admin(s): ${invalidAdminIds.join(", ")}`
      );

      // For now, we'll just add a flag to mark them as inactive instead of deleting
      // This preserves data while preventing future notification attempts
      for (const adminId of invalidAdminIds) {
        await db.markAdminAsInactive(adminId);
        console.log(`✅ Admin ${adminId} marked as inactive`);
      }

      console.log(
        "💡 Tip: Use the setup-admin.js script to reactivate admins if needed"
      );
    } catch (error) {
      console.error("Error handling invalid admins:", error);
    }
  },
};
