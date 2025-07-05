const { getBot } = require("./botService");
const db = require("./dbService");

// Function to get bot instance
const bot = () => getBot();

// Helper function for formatting posts in Amharic
function formatPostForChannel(post) {
  const typeLabel =
    post.property_type === "residential" ? "የሚከራይ ቤት" : "የሚከራይ ስራ ቦታ";

  let message = `<b>${typeLabel}</b>\n`;
  message += `<b>ID</b> ${String(post.id).padStart(5, "0")}\n\n`;

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
  return `<b>ID</b> ${String(post.id).padStart(5, "0")}`;
}

// Format post for preview (same as channel but without contact info)
function formatPostForPreview(post) {
  const typeLabel =
    post.property_type === "residential" ? "የሚከራይ ቤት" : "የሚከራይ ስራ ቦታ";

  let message = `<b>${typeLabel}</b>\n`;
  message += `<b>ID</b> ${String(post.id).padStart(5, "0")}\n\n`;

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

      if (photos && photos.length > 0) {
        if (photos.length === 1) {
          // Single photo: Send photo with full post text as caption and inline button
          await bot().sendPhoto(
            process.env.CHANNEL_ID,
            photos[0].telegram_file_id,
            {
              caption: formattedPost,
              parse_mode: "HTML",
              reply_markup: inlineKeyboard,
            }
          );

          console.log(`✅ Post #${postId} published to channel with 1 photo`);
        } else {
          // Multiple photos: Media group first, then first photo with full post + button

          // If there are additional photos, send them as media group first
          if (photos.length > 1) {
            const idCaption = generatePhotoCaption(post); // Returns "ID 00034" format
            const remainingPhotos = photos.slice(1); // Get photos from index 1 onwards

            const mediaGroup = remainingPhotos.map((photo, index) => ({
              type: "photo",
              media: photo.telegram_file_id,
              caption: index === 0 ? idCaption : undefined,
              parse_mode: index === 0 ? "HTML" : undefined,
            }));

            await bot().sendMediaGroup(process.env.CHANNEL_ID, mediaGroup);
          }

          // Then send first photo with full post text and button
          await bot().sendPhoto(
            process.env.CHANNEL_ID,
            photos[0].telegram_file_id,
            {
              caption: formattedPost,
              parse_mode: "HTML",
              reply_markup: inlineKeyboard,
            }
          );

          console.log(
            `✅ Post #${postId} published to channel with ${photos.length} photos`
          );
        }
      } else {
        // Send text-only post with inline button
        await bot().sendMessage(process.env.CHANNEL_ID, formattedPost, {
          parse_mode: "HTML",
          reply_markup: inlineKeyboard,
        });

        console.log(`✅ Post #${postId} published to channel (text only)`);
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

  formatPostForPreview,
  notifyAdmins: async function (postId, message) {
    try {
      const admins = await db.getAdmins();
      for (const admin of admins) {
        try {
          await bot().sendMessage(admin.telegram_id, message, {
            parse_mode: "HTML",
          });
        } catch (error) {
          console.error(`Failed to notify admin ${admin.telegram_id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error notifying admins:", error);
    }
  },
};
