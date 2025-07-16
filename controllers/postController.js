const {
  getBot,
  setState,
  getState,
  clearState,
  addToMediaGroup,
  getMediaGroup,
  clearMediaGroup,
} = require("../services/botService");
const db = require("../services/dbService");
const channelService = require("../services/channelService");

// Function to get bot instance
const bot = () => getBot();

// Helper function for notifying admins with post and action buttons
async function notifyAdminsNewPost(chatId) {
  try {
    // Get the latest pending post for this user
    const posts = await db.getPendingPostsForUser(chatId);
    if (!posts || posts.length === 0) {
      console.error("No pending posts found for user:", chatId);
      return;
    }

    const post = posts[0]; // Get the latest post
    const adminController = require("./adminController");

    // Format post for admin review using existing function
    const message = adminController.formatPostForAdmin(post);

    // Get admin users
    const admins = await db.getAdmins();

    for (const admin of admins) {
      try {
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

          await bot().sendMediaGroup(admin.telegram_id, mediaGroup);

          // Send approval buttons as separate message
          const preposts = parseInt(process.env.PREPOSTS) || 0;
          const displayId = post.id + preposts;

          await bot().sendMessage(
            admin.telegram_id,
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
          await bot().sendMessage(admin.telegram_id, message, {
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

        console.log(
          `✅ Admin ${admin.telegram_id} notified with post ID ${post.id}`
        );
      } catch (error) {
        console.error(
          `Failed to notify admin ${admin.telegram_id}:`,
          error.message
        );

        // Check if it's a "chat not found" error and handle it
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
          await db.markAdminAsInactive(admin.telegram_id);
        }
      }
    }
  } catch (error) {
    console.error("Error notifying admins:", error);
  }
}

module.exports = {
  async askPropertyType(chatId) {
    try {
      await bot().sendMessage(chatId, "🛖 ምን ዓይነት ቤት ነው የሚያከራዩት?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "የመኖሪያ ቤት",
                callback_data: "property_residential",
              },
            ],
            [
              {
                text: "የ ስራ ቦታ (ቢሮ፣ ሱቅ፣ መጋዘን..)",
                callback_data: "property_commercial",
              },
            ],
          ],
        },
      });
      setState(chatId, { step: "awaiting_property_type" });
    } catch (error) {
      console.error("Error in askPropertyType:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ /start ተጠቅመው እንደገና ይሞክሩ።");
    }
  },

  async handlePropertySelection(msg, propertyType) {
    const chatId = msg.chat.id;
    try {
      const type = propertyType.split("_")[1]; // residential/commercial
      const typeText = type === "residential" ? "የመኖሪያ ቤት" : "የስራ ቦታ";

      // Create initial post
      const state = getState(chatId);
      const postId = await db.createPost(chatId, {
        property_type: type,
        listing_type: "rent",
      });

      await bot().deleteMessage(chatId, msg.message_id);

      setState(chatId, {
        step: "get_property_title",
        postId,
        property_type: type,
      });

      // Ask for property title with buttons
      await this.askPropertyTitle(chatId, type);
    } catch (error) {
      console.error("Post creation failed:", error);
      await bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askPropertyTitle(chatId, propertyType) {
    try {
      let message, keyboard;

      if (propertyType === "commercial") {
        message = "🏢 የ ስራ ቦታዎ ምን ዓይነት ነው?";
        keyboard = [
          [{ text: "ቢሮ", callback_data: "title_ቢሮ" }],
          [{ text: "ሱቅ", callback_data: "title_ሱቅ" }],
          [{ text: "መጋዘን", callback_data: "title_መጋዘን" }],
          [{ text: "ለየትኛውም ንግድ", callback_data: "title_ለየትኛውም ንግድ" }],
        ];
      } else {
        message = "🛖 የመኖሪያ ቤትዎ ምን ዓይነት ነው?";
        keyboard = [
          [{ text: "ኮንዶሚንየም", callback_data: "title_ኮንዶሚንየም" }],
          [{ text: "አፓርታማ", callback_data: "title_አፓርታማ" }],
          [{ text: "ስቱዲዮ", callback_data: "title_ስቱዲዮ" }],
          [{ text: "ሙሉ ግቢ", callback_data: "title_ሙሉ ግቢ" }],
          [{ text: "ግቢ ውስጥ ያለ", callback_data: "title_ግቢ ውስጥ ያለ" }],
        ];
      }

      await bot().sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
    } catch (error) {
      console.error("Error in askPropertyTitle:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handlePropertyTitleSelection(msg, titleData) {
    const chatId = msg.chat.id;
    try {
      const title = titleData.split("_")[1];

      await bot().deleteMessage(chatId, msg.message_id);

      await db.updatePost(chatId, { title });
      setState(chatId, { property_title: title });

      // Handle special cases
      if (title === "ግቢ ውስጥ ያለ") {
        setState(chatId, { step: "get_rooms_count" });
        await bot().sendMessage(chatId, "ስንት ክፍል ነው? ቁጥር ብቻ ያስገቡ:");
      } else if (title === "ሙሉ ግቢ") {
        setState(chatId, { step: "get_villa_type" });
        await bot().sendMessage(chatId, "🏡 ምን ዓይነት ሙሉ ግቢ ነው?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "ቪላ", callback_data: "villa_type_ቪላ" }],
              [{ text: "ጂ+1", callback_data: "villa_type_ጂ+1" }],
              [{ text: "ጂ+2", callback_data: "villa_type_ጂ+2" }],
              [{ text: "ጂ+3", callback_data: "villa_type_ጂ+3" }],
              [{ text: "ሌላ", callback_data: "villa_type_ሌላ" }],
            ],
          },
        });
      } else if (
        ["ኮንዶሚንየም", "አፓርታማ", "ቢሮ", "ሱቅ", "መጋዘን", "ለየትኛውም ንግድ"].includes(title)
      ) {
        setState(chatId, { step: "get_floor" });
        await bot().sendMessage(
          chatId,
          "🏢 በስንተኛ ፎቅ ላይ ነው? ቁጥር ብቻ ያስገቡ ወይም ለግራውንድ 0 ያስገቡ:"
        );
      } else {
        // For studio and other types, skip to bedrooms
        await this.askBedrooms(chatId);
      }
    } catch (error) {
      console.error("Error in handlePropertyTitleSelection:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleRoomsCount(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || !/^\d+$/.test(msg.text)) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ቁጥር ያስገቡ:");
      }

      const roomsCount = parseInt(msg.text);
      await db.updatePost(chatId, { rooms_count: roomsCount });

      setState(chatId, { rooms_count: roomsCount });
      await this.askBathrooms(chatId);
    } catch (error) {
      console.error("Error in handleRoomsCount:", error);
      bot().sendMessage(chatId, "❌ ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleVillaTypeSelection(msg, villaData) {
    const chatId = msg.chat.id;
    try {
      const villaType = villaData.split("_")[2];

      await bot().deleteMessage(chatId, msg.message_id);

      await db.updatePost(chatId, { villa_type: villaType });
      setState(chatId, { villa_type: villaType });

      if (villaType === "ሌላ") {
        setState(chatId, { step: "get_villa_type_other" });
        await bot().sendMessage(chatId, "🏡 እባክዎ የቪላ ዓይነቱን ይግለጹ:");
      } else {
        await this.askBedrooms(chatId);
      }
    } catch (error) {
      console.error("Error in handleVillaTypeSelection:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleVillaTypeOther(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || msg.text.length < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ የቪላ ዓይነቱን ይግለጹ:");
      }

      await db.updatePost(chatId, { villa_type_other: msg.text.trim() });
      await this.askBedrooms(chatId);
    } catch (error) {
      console.error("Error in handleVillaTypeOther:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleFloorInput(msg) {
    const chatId = msg.chat.id;
    try {
      let floorText;

      if (
        msg.text === "0" ||
        msg.text.toLowerCase() === "ግራውንድ" ||
        msg.text.toLowerCase() === "ground"
      ) {
        floorText = "ግራውንድ";
      } else if (/^\d+$/.test(msg.text)) {
        const floorNumber = parseInt(msg.text);
        floorText = `${floorNumber}ኛ ፎቅ`;
      } else {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ ቁጥር ያስገቡ ብቻ ያስገቡ።። (ለግራውንድ 0 ን ይጠቀሙ)"
        );
      }

      await db.updatePost(chatId, { floor: floorText });
      await this.askBedrooms(chatId);
    } catch (error) {
      console.error("Error in handleFloorInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askBedrooms(chatId) {
    try {
      const state = getState(chatId);

      // Skip bedrooms and bathrooms for commercial properties
      if (state.property_type === "commercial") {
        return this.askPropertySize(chatId);
      }

      // Skip bedrooms for studio and "ግቢ ውስጥ ያለ" but still ask bathroom type
      if (
        state.property_title === "ስቱዲዮ" ||
        state.property_title === "ግቢ ውስጥ ያለ"
      ) {
        return this.askBathrooms(chatId);
      }

      setState(chatId, { step: "get_bedrooms" });
      await bot().sendMessage(chatId, "🛏️ ስንት መኝታ ክፍል አለው? ቁጥር ብቻ ያስገቡ:");
    } catch (error) {
      console.error("Error in askBedrooms:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleBedroomsInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || !/^\d+$/.test(msg.text)) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ቁጥር ያስገቡ:");
      }

      const bedrooms = parseInt(msg.text);
      await db.updatePost(chatId, { bedrooms });
      await this.askBathrooms(chatId);
    } catch (error) {
      console.error("Error in handleBedroomsInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askBathrooms(chatId) {
    try {
      const state = getState(chatId);

      if (
        state.property_title === "ስቱዲዮ" ||
        state.property_title === "ግቢ ውስጥ ያለ"
      ) {
        setState(chatId, { step: "get_bathroom_type" });
        await bot().sendMessage(chatId, "🚿 መታጠቢያ ቤቱ የግል ነው ወይስ የጋራ?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚿 የግል", callback_data: "bathroom_የግል" }],
              [{ text: "🚿 የጋራ", callback_data: "bathroom_የጋራ" }],
            ],
          },
        });
      } else {
        setState(chatId, { step: "get_bathrooms" });
        await bot().sendMessage(chatId, "🚿 ስንት መታጠቢያ ቤት አለው? ቁጥር ብቻ ያስገቡ:");
      }
    } catch (error) {
      console.error("Error in askBathrooms:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleBathroomType(msg, bathroomData) {
    const chatId = msg.chat.id;
    try {
      const bathroomType = bathroomData.split("_")[1];

      await bot().deleteMessage(chatId, msg.message_id);

      await db.updatePost(chatId, { bathroom_type: bathroomType });
      await this.askPropertySize(chatId);
    } catch (error) {
      console.error("Error in handleBathroomType:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleBathroomsInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || !/^\d+$/.test(msg.text)) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ቁጥር ያስገቡ:");
      }

      const bathrooms = parseInt(msg.text);
      await db.updatePost(chatId, { bathrooms });
      await this.askPropertySize(chatId);
    } catch (error) {
      console.error("Error in handleBathroomsInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askPropertySize(chatId) {
    try {
      setState(chatId, { step: "get_property_size" });

      const state = getState(chatId);
      const propertyTitle = state.property_title;

      // For studio, ግቢ ውስጥ ያለ, and ሙሉ ግቢ - make size optional
      if (["ስቱዲዮ", "ግቢ ውስጥ ያለ", "ሙሉ ግቢ"].includes(propertyTitle)) {
        await bot().sendMessage(
          chatId,
          "📐 የቤቱ ስፋት ስንት ነው?(በካሬ) ቁጥር ብቻ ያስገቡ፡\n\n" +
            "ስፋቱን አያውቁም ወይም መዝለል ይፈልጋሉ? ከታች ያለውን ይጫኑ!",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⏭️ ስፋቱን  ይዝለሉ",
                    callback_data: "skip_property_size",
                  },
                ],
              ],
            },
          }
        );
      } else {
        await bot().sendMessage(chatId, "📐 የቤቱ ስፋት ስንት ነው?(በካሬ) ቁጥር ብቻ ያስገቡ፡");
      }
    } catch (error) {
      console.error("Error in askPropertySize:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handlePropertySizeInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || !/^\d+\.?\d*$/.test(msg.text)) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ቁጥር ያስገቡ:");
      }

      const size = parseFloat(msg.text);
      await db.updatePost(chatId, { property_size: `${size} ካሬ` });
      await this.askMainLocation(chatId);
    } catch (error) {
      console.error("Error in handlePropertySizeInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async skipPropertySize(chatId) {
    try {
      await this.askMainLocation(chatId);
    } catch (error) {
      console.error("Error in skipPropertySize:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askMainLocation(chatId) {
    try {
      setState(chatId, { step: "get_main_location" });
      await bot().sendMessage(
        chatId,
        "ዋና ሰፈሩ የት ነው?\n\n" +
          "እባክዎ ዋና ሰፈሩን ብቻ ያስገቡ (ምሳሌ: መገናኛ, ሰሚት, ቦሌ, ፒያሳ ....):",
        {
          reply_markup: {
            remove_keyboard: true,
          },
        }
      );
    } catch (error) {
      console.error("Error in askMainLocation:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleMainLocationInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || msg.text.length < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ዋና ሰፈር ያስገቡ:");
      }

      const mainLocation = msg.text.trim();
      setState(chatId, { main_location: mainLocation });
      await this.askAreaLocation(chatId);
    } catch (error) {
      console.error("Error in handleMainLocationInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askAreaLocation(chatId) {
    try {
      setState(chatId, { step: "get_area_location" });
      await bot().sendMessage(
        chatId,
        "ትክክለኛ አከባቢውን ለማስረዳት ይማክሩ፡ (ምሳሌ: ለሙ ሆቴል ጀርባ፣ ፍየል ቤት አጠገብ...)"
      );
    } catch (error) {
      console.error("Error in askAreaLocation:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleAreaLocationInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || msg.text.length < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ የአከባቢውን መግለጫ ያስገቡ:");
      }

      const state = getState(chatId);
      const fullLocation = `${state.main_location}, ${msg.text.trim()}`;

      await db.updatePost(chatId, { location: fullLocation });
      await this.askPrice(chatId);
    } catch (error) {
      console.error("Error in handleAreaLocationInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askPrice(chatId) {
    try {
      setState(chatId, { step: "get_price" });
      await bot().sendMessage(chatId, "💰 ዋጋው ስንት ነው?(በብር) ቁጥር ብቻ ያስገቡ፡ ");
    } catch (error) {
      console.error("Error in askPrice:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handlePriceInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || !/^\d+\.?\d*$/.test(msg.text.replace(/,/g, ""))) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ዋጋ ያስገቡ:");
      }

      const price = parseFloat(msg.text.replace(/,/g, ""));
      const formattedPrice = `${price.toLocaleString()} ብር`;

      await db.updatePost(chatId, { price: formattedPrice });
      await this.askDescription(chatId);
    } catch (error) {
      console.error("Error in handlePriceInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askContactDisplay(chatId) {
    try {
      const user = await db.getUser(chatId);
      setState(chatId, { step: "get_contact_display" });

      await bot().sendMessage(
        chatId,
        `📞 የተመዘገበው የስልክ ቁጥርዎ (${user.phone}) በማስታወቂያው ላይ እንዲታይ ይፈልጋሉ?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ አዎ፣ እንዲታይ እፈልጋለሁ",
                  callback_data: "contact_display_yes",
                },
              ],
              [
                {
                  text: "❌ አይ፣ ሌላ ቁጥር እጨምራለሁ",
                  callback_data: "contact_display_no",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in askContactDisplay:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleContactDisplaySelection(msg, contactData) {
    const chatId = msg.chat.id;
    try {
      const displayContact = contactData.split("_")[2] === "yes";

      await bot().editMessageText(
        displayContact ? "✅ የተመዘገበው ስልክ ቁጥር ይታያል" : "✅ ሌላ ቁጥር ይጨምራሉ",
        {
          chat_id: chatId,
          message_id: msg.message_id,
        }
      );

      if (displayContact) {
        await this.askNameDisplay(chatId);
      } else {
        setState(chatId, { step: "get_custom_contact" });
        await bot().sendMessage(
          chatId,
          "📞 እባክዎ በማስታወቂያው ላይ እንዲታይ የሚፈልጉትን የስልክ ቁጥር ያስገቡ:"
        );
      }
    } catch (error) {
      console.error("Error in handleContactDisplaySelection:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleCustomContactInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || msg.text.length < 10) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ:");
      }

      await db.updatePost(chatId, { contact_info: msg.text.trim() });
      await this.askNameDisplay(chatId);
    } catch (error) {
      console.error("Error in handleCustomContactInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askNameDisplay(chatId) {
    try {
      const user = await db.getUser(chatId);
      setState(chatId, { step: "get_name_display" });

      await bot().sendMessage(
        chatId,
        `👤 ስምዎ (${user.name}) በማስታወቂያው ላይ እንዲታይ ይፈልጋሉ?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ አዎ፣ ስሜ እንዲታይ እፈልጋለሁ",
                  callback_data: "name_display_yes",
                },
              ],
              [
                {
                  text: "👤 የማይታወቅ ስም እጠቀማለሁ",
                  callback_data: "name_display_no",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in askNameDisplay:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleNameDisplaySelection(msg, nameData) {
    const chatId = msg.chat.id;
    try {
      const displayName = nameData.split("_")[2] === "yes";

      await bot().editMessageText(
        displayName ? "✅ ስምዎ ይታያል" : "✅ የማይታወቅ ስም ይጠቀማሉ",
        {
          chat_id: chatId,
          message_id: msg.message_id,
        }
      );

      if (displayName) {
        await this.askDescription(chatId);
      } else {
        setState(chatId, { step: "get_nickname" });
        await bot().sendMessage(
          chatId,
          "👤 እባክዎ በማስታወቂያው ላይ እንዲታይ የሚፈልጉትን ስም ያስገቡ:"
        );
      }
    } catch (error) {
      console.error("Error in handleNameDisplaySelection:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleNicknameInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || msg.text.length < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ስም ያስገቡ:");
      }

      await db.updatePost(chatId, { display_name: msg.text.trim() });
      await this.askDescription(chatId);
    } catch (error) {
      console.error("Error in handleNicknameInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askDescription(chatId) {
    try {
      setState(chatId, { step: "get_description" });
      await bot().sendMessage(
        chatId,
        "ስለ ቤቱ ተጨማረ መረጃ ካሎት ያጋሩን:\n" + "(ከሌሎት ከታች ያለውን ቁልፍ ይጫኑ)",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "⏭️ ተጨማረ መረጃ የለኝም", callback_data: "skip_description" }],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in askDescription:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleDescriptionInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (!msg.text || msg.text.trim().toLowerCase() === "ሃሳፍ") {
        return this.askForPhotoOption(chatId);
      }

      if (msg.text.length < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ ስለ ንብረቱ ዝርዝር መግለጫ ያስገቡ፡");
      }

      await db.updatePost(chatId, { description: msg.text.trim() });
      await this.askForPhotoOption(chatId);
    } catch (error) {
      console.error("Error in handleDescriptionInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async skipDescription(chatId) {
    try {
      await this.askForPhotoOption(chatId);
    } catch (error) {
      console.error("Error in skipDescription:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askPlatformLink(chatId) {
    try {
      setState(chatId, { step: "get_platform_link" });
      await bot().sendMessage(
        chatId,
        "🔗 ቤቱን በሌላ ቦታ አስተዋውቀዋል?\n\n" +
          "ቤቱ በ Facebook, TikTok, Jiji, YouTube ወይም ሌላ ቦታ ከተለጠፈ ሊንኩን እዚህ ያስገቡ።\n\n" +
          "ካልተለጠፈ ክታች ያለውን ቁልፍ ይጫኑ",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "⏭️ ሌላ ቦታ አለጠፍኩም",
                  callback_data: "skip_platform_link",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in askPlatformLink:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handlePlatformLinkInput(msg) {
    const chatId = msg.chat.id;
    try {
      if (
        !msg.text ||
        msg.text.trim().toLowerCase() === "ሃሳፍ" ||
        msg.text.trim().toLowerCase() === "ዝለል"
      ) {
        return this.askForPhotoOption(chatId);
      }

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

      // Basic URL validation and platform detection
      let platformName = "ሌላ";
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

      await db.updatePost(chatId, {
        platform_link: validatedLink,
        platform_name: platformName,
      });

      await bot().sendMessage(chatId, `✅የ ${platformName} ሊንክ ተቀምጧል!`);

      await this.askForPhotoOption(chatId);
    } catch (error) {
      console.error("Error in handlePlatformLinkInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async skipPlatformLink(chatId) {
    try {
      await this.askForPhotoOption(chatId);
    } catch (error) {
      console.error("Error in skipPlatformLink:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askForPhotoOption(chatId) {
    try {
      setState(chatId, { step: "photo_option", photos: [] });

      await bot().sendMessage(
        chatId,
        "📸 የቤቱን ፎቶዎች ወይም ቪዲዮዎች ማስገባት ይፈልጋሉ?\n" + "(እስከ 8 ሚድያ ድረስ መጨመር ይችላሉ)",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📸 አዎ፣ ሚድያ መጨመር እፈልጋለሁ",
                  callback_data: "add_photos",
                },
              ],
              [{ text: "⏭️ አይ፣ ሚድያ የሉኝም", callback_data: "skip_photos" }],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in askForPhotoOption:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async askForPhotos(chatId) {
    try {
      setState(chatId, { step: "get_photos" });

      await bot().sendMessage(
        chatId,
        "📷 እባክዎ የቤቱን ሚድያ (ፎቶዎች/ቪዲዮዎች) ይላኩ\n\n" +
          "📝 መመሪያዎች:\n" +
          "• እስከ 8 ሚድያ ድረስ መላክ ይችላሉ\n" +
          "• ሚድያዎች ጥራታቸው ጥሩ እንዲሆን ያድርጉ\n" +
          "• ቪዲዮዎች እስከ 50MB ድረስ ሊሆኑ ይችላሉ\n" +
          "• ሚድያዎችን አንድ በአንድ ወይም በአንድ ጊዜ መላክ ይችላሉ\n" +
          "• ጨርሰው ሲጨርሱ 'ጨርሻለሁ' የሚለውን ቁልፍ ይጫኑ",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ጨርሻለሁ", callback_data: "finish_photos" }],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in askForPhotos:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handlePhotoUpload(msg) {
    const chatId = msg.chat.id;
    try {
      const state = getState(chatId);
      let photos = state.photos || [];

      let newPhoto = null;

      // Handle regular photo
      if (msg.photo) {
        // Get the highest resolution photo
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
            "❌ ቪዲዮው ከ50MB በላይ ነው። እባክዎ ትንሽ ቪዲዮ ይላኩ።"
          );
        }
        newPhoto = {
          file_id: msg.video.file_id,
          file_size: msg.video.file_size,
          type: "video",
        };
      }

      if (!newPhoto) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ፎቶ ወይም ቪዲዮ ይላኩ።");
      }

      // Check if adding this photo would exceed the limit
      if (photos.length >= 8) {
        return bot().sendMessage(
          chatId,
          "❌ አስቀድመው 8 ሚድያ አሉ። ተጨማሪ ሚድያ መጨመር አይችሉም። እባክዎ 'ሚድያ ጨርሻለሁ' ይጫኑ።"
        );
      }

      // Add the photo
      photos.push(newPhoto);

      // If we now have 8 photos, take only the first 8
      if (photos.length > 8) {
        photos = photos.slice(0, 8);
        setState(chatId, { photos });

        return bot().sendMessage(
          chatId,
          `✅ ሚድያ 8/8 ተቀምጠዋል (ከ8 በላይ ስለላኩ የመጀመሪያውን 8 እንወስዳለን)\n\n`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ ጨርሻለሁ", callback_data: "finish_photos" }],
              ],
            },
          }
        );
      }

      setState(chatId, { photos });

      await bot().sendMessage(
        chatId,
        `✅ ሚድያ ${photos.length}/8 ተቀምጧል\n\n` +
          `${
            photos.length < 8
              ? "📷 ተጨማሪ ሚድያ መላክ ይችላሉ ወይም ቁልፉን ይጫኑ።"
              : "✅ 8 ሚድያ አስገብተዋል፣ እባክዎ ጨርሻለሁ ይጫኑ።"
          }`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ ጨርሻለሁ", callback_data: "finish_photos" }],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handlePhotoUpload:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async skipPhotos(chatId) {
    try {
      await this.completeListing(chatId);
    } catch (error) {
      console.error("Error in skipPhotos:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async finishPhotos(chatId) {
    try {
      const state = getState(chatId);
      const photos = state.photos || [];

      if (photos.length > 0) {
        // Save photos to database
        await db.savePostPhotos(chatId, photos);

        await bot().sendMessage(chatId, `✅ ${photos.length} ሚድያዎችዎ ተቀምጠዋል!`);
      }

      await this.completeListing(chatId);
    } catch (error) {
      console.error("Error in finishPhotos:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async completeListing(chatId) {
    try {
      // Show preview first
      await this.showPreview(chatId);
    } catch (error) {
      console.error("Error in completeListing:", error);
      bot().sendMessage(chatId, "❌ ማስታወቂያዎን መላክ አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async showPreview(chatId) {
    try {
      const state = getState(chatId);
      const post = await db.getPost(state.postId);

      if (!post) {
        throw new Error("Post not found");
      }

      // Use the same formatting as channel posts for preview
      const previewMessage = channelService.formatPostForPreview(post);

      // Get the latest pending post for this user to get postId
      const latestPost = await db.getLatestPendingPost(chatId);
      const postId = latestPost ? latestPost.id : null;

      // Get photos for this post
      const photos = await db.getPostPhotos(post.id);

      const previewText =
        "📋 <b>የማስታወቂያዎ ቅድመ ዕይታ:</b>\n\n" +
        "ከዚህ በታች ማስታወቂያዎ በቻናላችን ላይ እንዴት እንደሚታይ ይመልከቱ:\n\n" +
        "──────────────────\n\n" +
        previewMessage +
        "\n\n──────────────────";

      const inlineKeyboard = [
        [{ text: "✅ ይህ ይበቃኛል", callback_data: "confirm_listing" }],
        [
          { text: "✏️ ማረም", callback_data: `user_edit_${postId}` },
          { text: "🔄 እንደ አዲስ ጀመር", callback_data: "start_new_listing" },
        ],
      ];

      if (photos && photos.length > 0) {
        if (photos.length === 1) {
          // Single media: Send using appropriate method based on file type
          const media = photos[0];
          if (media.file_type === "video") {
            await bot().sendVideo(chatId, media.telegram_file_id, {
              caption: previewText,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: inlineKeyboard,
              },
            });
          } else {
            // Photos and documents
            await bot().sendPhoto(chatId, media.telegram_file_id, {
              caption: previewText,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: inlineKeyboard,
              },
            });
          }
        } else {
          // Multiple media: Send as media group with preview text on first item
          const mediaGroup = photos.map((photo, index) => ({
            type:
              photo.file_type === "video"
                ? "video"
                : photo.file_type === "document"
                ? "document"
                : "photo",
            media: photo.telegram_file_id,
            caption: index === 0 ? previewText : undefined,
            parse_mode: index === 0 ? "HTML" : undefined,
          }));

          await bot().sendMediaGroup(chatId, mediaGroup);

          // Send action buttons as separate message
          await bot().sendMessage(chatId, "📋 የማስታወቂያ እርምጃዎች:", {
            reply_markup: {
              inline_keyboard: inlineKeyboard,
            },
          });
        }
      } else {
        // No photos: Send text-only message
        await bot().sendMessage(chatId, previewText, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });
      }
    } catch (error) {
      console.error("Error showing preview:", error);
      bot().sendMessage(
        chatId,
        "❌ ቅድመ ዕይታ ማሳየት አልተቻለም፣ እባክዎ /start በመጫን እንደገና ይሞክሩ።"
      );
    }
  },

  async confirmListing(chatId) {
    try {
      // Check if this is an admin posting with custom info
      const state = getState(chatId);
      if (state?.admin_display_name && state?.admin_contact_info) {
        // Use admin-provided contact info and platform link
        const updateData = {
          contact_info: state.admin_contact_info,
          display_name: state.admin_display_name,
        };

        // Add platform link if provided by admin
        if (state.admin_platform_link) {
          updateData.platform_link = state.admin_platform_link;
          updateData.platform_name = state.admin_platform_name;
        }

        await db.updatePost(chatId, updateData);
      } else {
        // Automatically save user's registered phone and name to the post
        const user = await db.getUser(chatId);
        if (user) {
          await db.updatePost(chatId, {
            contact_info: user.phone,
            display_name: user.name,
          });
        }
      }

      setState(chatId, { step: null });

      await bot().sendMessage(
        chatId,
        "✅ ማስታወቂያዎ ደርሶናል!\n\n" +
          "አስተዳዳሪዎች ማስታወቂያዎን በቅርቡ ይመለከቱታል።\n" +
          "ከተፈቀደ በኋላ፣ ወደ ቻናላችን ይለቀቃል።\n\n" +
          "ቤት ቦትን ስለተጠቀሙ እናመሰግናለን!"
      );

      // Return to main menu after post submission
      setTimeout(async () => {
        try {
          await require("../controllers/userController").showMainMenu(chatId);
        } catch (error) {
          console.error("Error returning to main menu:", error);
        }
      }, 2000);

      // Notify admins
      notifyAdminsNewPost(chatId);
    } catch (error) {
      console.error("Error in confirmListing:", error);
      bot().sendMessage(chatId, "❌ ማስታወቂያ መላክ አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  // NEW User Editing System - Exactly like Admin System
  async handleUserEditPost(callback) {
    try {
      const chatId = callback.message.chat.id;
      const postId = callback.data.split("_")[2];

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      // Get post details to determine property type and available fields
      const post = await db.getPost(parseInt(postId));

      if (!post) {
        return bot().sendMessage(chatId, "❌ ማስታወቂያ አልተገኘም!");
      }

      setState(chatId, {
        step: "user_edit",
        postId: parseInt(postId),
        post: post,
      });

      // Create property-type-aware edit options
      const editOptions = this.getUserEditOptionsForPost(post, postId);

      await bot().sendMessage(
        chatId,
        `✏️ <b>የማስታወቂያ ማረሚያ</b>\n\n` +
          `📋 <b>ማስታወቂያ:</b> ${post.title || "N/A"}\n` +
          `🛖 <b>ዓይነት:</b> ${
            post.property_type === "residential" ? "የመኖሪያ ቤት" : "የንግድ ቤት"
          }\n\n` +
          `ምን መርመም ይፈልጋሉ?`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );
    } catch (error) {
      console.error("Error in handleUserEditPost:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  // User Photo Editing System - Same as Admin but for Users
  async handleUserPhotoAdd(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ ለማረምየተመረጠ ማስታወቂያ የለም!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;

      // Set state for adding photos
      setState(chatId, {
        step: "user_photo_upload",
        postId: postId,
        photoMode: "add",
        photos: [],
      });

      // Get current photo count
      const currentPhotos = await db.getPostPhotos(postId);

      await bot().sendMessage(
        chatId,
        `📷 <b>ሚድያ መጨመሪያ ሁኔታ</b>\n\n` +
          `አሁን ያሉ ሚድያ: ${currentPhotos.length}/8\n` +
          `የተጨመሩ በሰላ: 0\n` +
          `ሚድያዎችን ይላኩ ከነባሩ ሚድያ ጋር ለመጨመር።`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ ሚድያ መጨመር ጨርሻለሁ",
                  callback_data: "user_photos_done",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleUserPhotoAdd:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleUserPhotoReplace(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ ለማረምየተመረጠ ማስታወቂያ የለም!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;

      // Delete all existing photos first
      await db.deletePostPhotos(postId);

      // Set state for replacing photos
      setState(chatId, {
        step: "user_photo_upload",
        postId: postId,
        photoMode: "replace",
        photos: [],
      });

      await bot().sendMessage(
        chatId,
        `🔄 <b>ሚድያ መቀየሪያ ሁኔታ</b>\n\n` +
          `ሁሉም ነባር ሚድያ ተሰርዘዋል።\n` +
          `አሁን አዲስ ሚድያ ይላኩ (እስከ 8 ሚድያ ድረስ)።`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ ሚድያ መጨመር ጨርሻለሁ",
                  callback_data: "user_photos_done",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleUserPhotoReplace:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleUserPhotoDelete(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ ለማረምየተመረጠ ማስታወቂያ የለም!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;

      // Delete all photos
      await db.deletePostPhotos(postId);

      // Go back to edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getUserEditOptionsForPost(updatedPost, postId);

      await bot().sendMessage(
        chatId,
        "✅ ሁሉም ሚድያ ተሰርዘዋል!\n\nሌላ ምን መርመም ይፈልጋሉ?",
        {
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "user_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleUserPhotoDelete:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleUserPhotosDone(callback) {
    try {
      const chatId = callback.message.chat.id;
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, {
          text: "❌ ለማረምየተመረጠ ማስታወቂያ የለም!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      const postId = state.postId;
      const photos = state.photos || [];

      if (photos.length > 0) {
        // Save all photos using the same method as regular photo upload
        await db.savePostPhotos(chatId, photos);
      }

      // Go back to edit options - single completion message only
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getUserEditOptionsForPost(updatedPost, postId);

      await bot().sendMessage(
        chatId,
        photos.length > 0
          ? "✅ የፎቶ ማረምተጠናቅቋል!\n\nሌላ ምን መርመም ይፈልጋሉ?"
          : "✅ የፎቶ ማረምተጠናቅቋል!\n\nሌላ ምን መርመም ይፈልጋሉ?",
        {
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "user_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleUserPhotosDone:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleUserPhotoUpload(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!state || state.step !== "user_photo_upload" || !state.postId) {
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
            "❌ ቪዲዮው ከ50MB በላይ ነው። እባክዎ ትንሽ ቪዲዮ ይላኩ።"
          );
        }
        newPhoto = {
          file_id: msg.video.file_id,
          file_size: msg.video.file_size,
          type: "video",
        };
      }

      if (!newPhoto) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ፎቶ ወይም ቪዲዮ ይላኩ።");
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
          `❌ ተጨማሪ ሚድያ መጨመር አይችሉም። ይህ በአጠቃላይ ${totalWillHave} ሚድያ ያደርገዋል፣ ነገር ግን ከፍተኛው 8 ነው።\n\n` +
            `አሁን የተቀመጡ: ${currentSavedCount}\n` +
            `በሰላ ውስጥ: ${photos.length}\n` +
            `እባክዎ 'ጨርሻለሁ' ይጫኑ አሁን ያሉ ሚድያ ለማስቀመጥ።`
        );
      }

      // Add the photo to the queue
      photos.push(newPhoto);
      setState(chatId, { ...state, photos });

      // Send simple confirmation (matching regular post creation style)
      await bot().sendMessage(
        chatId,
        `✅ ሚድያ ${currentSavedCount + photos.length}/8 ተቀምጧል\n\n` +
          `${
            currentSavedCount + photos.length < 8
              ? "📷 ተጨማሪ ሚድያ መላክ ይችላሉ ወይም ቁልፉን ይጫኑ።"
              : "✅ ከፍተኛ ቁጥር ላይ ደርሷል! እባክዎ 'ጨርሻለሁ' ይጫኑ።"
          }`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ ሚድያ መጨመር ጨርሻለሁ",
                  callback_data: "user_photos_done",
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error in handleUserPhotoUpload:", error);
      bot().sendMessage(chatId, "❌ ሚድያ ማስተናገድ ተሳንቷል። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleUserMediaGroupPhoto(msg) {
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
              `❌ ተጨማሪ ሚድያ መጨመር አይችሉም። ከፍተኛው በአጠቃላይ 8 ነው።\n\n` +
                `አሁን የተቀመጡ: ${currentSavedCount}\n` +
                `በሰላ ውስጥ: ${photos.length}\n` +
                `እባክዎ 'ጨርሻለሁ' ይጫኑ አሁን ያሉ ሚድያ ለማስቀመጥ።`
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

          // Send simple confirmation message (matching regular post creation style)
          if (totalWillHave >= 8) {
            await bot().sendMessage(
              chatId,
              `✅ ሚድያ 8/8 ተቀምጠዋል${
                mediaGroupPhotos.length > totalPhotosToAdd
                  ? ` (ከ${mediaGroupPhotos.length} ሚድያ የመጀመሪያውን ${totalPhotosToAdd} ወሰድን)`
                  : ""
              }\n\n` + `✅ ከፍተኛ ቁጥር ላይ ደርሷል! እባክዎ 'ጨርሻለሁ' ይጫኑ።`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "✅ ሚድያ መጨመር ጨርሻለሁ",
                        callback_data: "user_photos_done",
                      },
                    ],
                  ],
                },
              }
            );
          } else {
            await bot().sendMessage(
              chatId,
              `✅ ሚድያ ${totalWillHave}/8 ተቀምጧል\n\n` +
                `${
                  totalWillHave < 8
                    ? "📷 ተጨማሪ ሚድያ መላክ ይችላሉ ወይም ቁልፉን ይጫኑ።"
                    : "✅ ከፍተኛ ቁጥር ላይ ደርሷል! እባክዎ 'ጨርሻለሁ' ይጫኑ።"
                }`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "✅ ሚድያ መጨመር ጨርሻለሁ",
                        callback_data: "user_photos_done",
                      },
                    ],
                  ],
                },
              }
            );
          }
        } catch (error) {
          console.error("Error processing user media group:", error);
        }
      }, 1000); // Wait 1 second for all photos in group to arrive
    } catch (error) {
      console.error("Error in handleUserMediaGroupPhoto:", error);
      bot().sendMessage(chatId, "❌ የሚድያ ቡድን ማስተናገድ ተሳንቷል። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  // User villa type edit handlers
  async handleUserVillaTypeEdit(callback) {
    try {
      const chatId = callback.message.chat.id;
      const villaType = callback.data.split("_")[3];
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      // Update the post
      await db.updatePost(chatId, { villa_type: villaType });

      // Get updated post and show edit options again
      const updatedPost = await db.getPost(state.postId);
      const editOptions = this.getUserEditOptionsForPost(
        updatedPost,
        state.postId
      );

      await bot().sendMessage(
        chatId,
        `✅ የቪላ ዓይነት በተሳካ ሁኔታ ወደ "${villaType}" ተማርሟል!\n\nሌላ ምን መርመም ይፈልጋሉ?`,
        {
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, {
        step: "user_edit",
        postId: state.postId,
        post: updatedPost,
      });
    } catch (error) {
      console.error("Error in handleUserVillaTypeEdit:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  // User bathroom type edit handlers
  async handleUserBathroomTypeEdit(callback) {
    try {
      const chatId = callback.message.chat.id;
      const bathroomType = callback.data.split("_")[3];
      const state = getState(chatId);

      if (!state || !state.postId) {
        return bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      // Update the post
      await db.updatePost(chatId, { bathroom_type: bathroomType });

      // Get updated post and show edit options again
      const updatedPost = await db.getPost(state.postId);
      const editOptions = this.getUserEditOptionsForPost(
        updatedPost,
        state.postId
      );

      await bot().sendMessage(
        chatId,
        `✅ የመታጠቢያ ዓይነት በተሳካ ሁኔታ ወደ "${bathroomType}" ተማርሟል!\n\nሌላ ምን መርመም ይፈልጋሉ?`,
        {
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, {
        step: "user_edit",
        postId: state.postId,
        post: updatedPost,
      });
    } catch (error) {
      console.error("Error in handleUserBathroomTypeEdit:", error);
      try {
        bot().answerCallbackQuery(callback.id, { text: "ስህተት!" });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  // Helper function to get edit options based on post type (USER VERSION)
  getUserEditOptionsForPost(post, postId) {
    const commonFields = [
      [
        {
          text: "📋 የንብረት ርዕስ",
          callback_data: `user_edit_field_title_${postId}`,
        },
      ],
      [
        {
          text: "📍 አድራሻ",
          callback_data: `user_edit_field_location_${postId}`,
        },
      ],
      [{ text: "💰 ዋጋ", callback_data: `user_edit_field_price_${postId}` }],
      [
        {
          text: "📞 ተያያዥ መረጃ",
          callback_data: `user_edit_field_contact_info_${postId}`,
        },
      ],
      [
        {
          text: "👤 የሚታየው ስም",
          callback_data: `user_edit_field_display_name_${postId}`,
        },
      ],
    ];

    const propertySpecificFields = [];

    // Add property-specific fields based on property type and title
    if (post.property_type === "residential") {
      if (post.title === "ግቢ ውስጥ ያለ" && post.rooms_count) {
        propertySpecificFields.push([
          {
            text: "🛖 የክፍሎች ብዛት",
            callback_data: `user_edit_field_rooms_count_${postId}`,
          },
        ]);
      }

      if (post.title === "ሙሉ ግቢ") {
        if (post.villa_type) {
          propertySpecificFields.push([
            {
              text: "🏡 የቪላ ዓይነት",
              callback_data: `user_edit_field_villa_type_${postId}`,
            },
          ]);
        }
        if (post.villa_type_other) {
          propertySpecificFields.push([
            {
              text: "🏡 የቪላ ዓይነት (ሌላ)",
              callback_data: `user_edit_field_villa_type_other_${postId}`,
            },
          ]);
        }
      }

      if (["ኮንዶሚንየም", "አፓርታማ"].includes(post.title) && post.floor) {
        propertySpecificFields.push([
          { text: "🏢 ፎቅ", callback_data: `user_edit_field_floor_${postId}` },
        ]);
      }

      if (post.bedrooms) {
        propertySpecificFields.push([
          {
            text: "🛏️ መኝታ ክፍሎች",
            callback_data: `user_edit_field_bedrooms_${postId}`,
          },
        ]);
      }

      if (post.bathrooms) {
        propertySpecificFields.push([
          {
            text: "🚿 መታጠቢያ ክፍሎች",
            callback_data: `user_edit_field_bathrooms_${postId}`,
          },
        ]);
      }

      if (post.bathroom_type) {
        propertySpecificFields.push([
          {
            text: "🚿 የመታጠቢያ ዓይነት",
            callback_data: `user_edit_field_bathroom_type_${postId}`,
          },
        ]);
      }
    } else if (post.property_type === "commercial") {
      if (
        ["ቢሮ", "ሱቅ", "መጋዘን", "ለየትኛውም ንግድ"].includes(post.title) &&
        post.floor
      ) {
        propertySpecificFields.push([
          { text: "🏢 ፎቅ", callback_data: `user_edit_field_floor_${postId}` },
        ]);
      }
    }

    // Add common fields that might be present
    if (post.property_size) {
      propertySpecificFields.push([
        {
          text: "📐 የንብረት መጠን",
          callback_data: `user_edit_field_property_size_${postId}`,
        },
      ]);
    }

    if (post.description) {
      propertySpecificFields.push([
        {
          text: "📝 መግለጫ",
          callback_data: `user_edit_field_description_${postId}`,
        },
      ]);
    }

    if (post.platform_link) {
      propertySpecificFields.push([
        {
          text: "🔗 ፕላትፎርም ሊንክ",
          callback_data: `user_edit_field_platform_link_${postId}`,
        },
      ]);
    }

    // Add photos editing option
    propertySpecificFields.push([
      {
        text: "📷 ሚድያ",
        callback_data: `user_edit_field_photos_${postId}`,
      },
    ]);

    // Combine all fields
    const allFields = [
      ...commonFields,
      ...propertySpecificFields,
      [{ text: "✅ ማረም ጨርሻለሁ!", callback_data: `user_edit_done_${postId}` }],
    ];

    return allFields;
  },

  // Helper function to get field-specific edit information (USER VERSION)
  getUserFieldEditInfo(field, post) {
    const fieldMappings = {
      title: {
        displayName: "የንብረት ርዕስ",
        currentValue: post.title || "N/A",
        prompt: "📋 አዲስ ርዕስ ያስገቡ:",
        dbField: "title",
      },
      location: {
        displayName: "አድራሻ",
        currentValue: post.location || "N/A",
        prompt: "📍 አዲስ አድራሻ ያስገቡ:",
        dbField: "location",
      },
      price: {
        displayName: "ዋጋ",
        currentValue: post.price || "N/A",
        prompt: "💰 አዲስ ዋጋ ያስገቡ:",
        dbField: "price",
      },
      contact_info: {
        displayName: "ተያያዥ መረጃ",
        currentValue: post.contact_info || "N/A",
        prompt: "📞 አዲስ ተያያዥ መረጃ ያስገቡ:",
        dbField: "contact_info",
      },
      display_name: {
        displayName: "የሚታየው ስም",
        currentValue: post.display_name || "N/A",
        prompt: "👤 አዲስ የሚታየው ስም ያስገቡ:",
        dbField: "display_name",
      },
      description: {
        displayName: "መግለጫ",
        currentValue: post.description || "N/A",
        prompt: "📝 አዲስ መግለጫ ያስገቡ:",
        dbField: "description",
      },
      rooms_count: {
        displayName: "የክፍሎች ብዛት",
        currentValue: post.rooms_count || "N/A",
        prompt: "🛖 የክፍሎች ብዛት ያስገቡ (ቁጥር ብቻ):",
        dbField: "rooms_count",
      },
      villa_type: {
        displayName: "የቪላ ዓይነት",
        currentValue: post.villa_type || "N/A",
        prompt: "🏡 የቪላ ዓይነቱን ይምረጡ:",
        dbField: "villa_type",
        keyboard: {
          inline_keyboard: [
            [{ text: "🏡 ቪላ", callback_data: "user_villa_edit_ቪላ" }],
            [{ text: "🛖 ጂ+1", callback_data: "user_villa_edit_ጂ+1" }],
            [{ text: "🏢 ጂ+2", callback_data: "user_villa_edit_ጂ+2" }],
            [{ text: "🏢 ጂ+3", callback_data: "user_villa_edit_ጂ+3" }],
            [{ text: "🏗️ ሌላ", callback_data: "user_villa_edit_ሌላ" }],
          ],
        },
      },
      villa_type_other: {
        displayName: "የቪላ ዓይነት (ሌላ)",
        currentValue: post.villa_type_other || "N/A",
        prompt: "🏡 የቪላ ዓይነቱን ያስገቡ:",
        dbField: "villa_type_other",
      },
      floor: {
        displayName: "ፎቅ",
        currentValue: post.floor || "N/A",
        prompt: "🏢 የፎቅ ቁጥሩን ያስገቡ (1, 2..) ወይም ለመሬት ቤት 0:",
        dbField: "floor",
      },
      bedrooms: {
        displayName: "መኝታ ክፍሎች",
        currentValue: post.bedrooms || "N/A",
        prompt: "🛏️ የመኝታ ክፍሎች ብዛት ያስገቡ:",
        dbField: "bedrooms",
      },
      bathrooms: {
        displayName: "መታጠቢያ ክፍሎች",
        currentValue: post.bathrooms || "N/A",
        prompt: "🚿 የመታጠቢያ ክፍሎች ብዛት ያስገቡ:",
        dbField: "bathrooms",
      },
      bathroom_type: {
        displayName: "የመታጠቢያ ዓይነት",
        currentValue: post.bathroom_type || "N/A",
        prompt: "🚿 የመታጠቢያ ዓይነቱን ይምረጡ:",
        dbField: "bathroom_type",
        keyboard: {
          inline_keyboard: this.getUserBathroomTypeOptions(post.title),
        },
      },
      property_size: {
        displayName: "የንብረት መጠን",
        currentValue: post.property_size || "N/A",
        prompt: "📐 የንብረት መጠን ያስገቡ:",
        dbField: "property_size",
      },
      platform_link: {
        displayName: "ፕላትፎርም ሊንክ",
        currentValue: post.platform_link || "N/A",
        prompt: "🔗 ፕላትፎርም ሊንክ ያስገቡ (URL):",
        dbField: "platform_link",
      },
      photos: {
        displayName: "ሚድያ",
        currentValue: "_",
        prompt: "📷 የሚድያ አስተዳደር:\n\nሚድያዎችን እንዴት መቆጣጠር ይፈልጋሉ?",
        dbField: "photos",
        keyboard: {
          inline_keyboard: [
            [
              {
                text: "➕ ያለው ሚድያ ላይ ይጨምሩ",
                callback_data: "user_photo_add",
              },
            ],
            [
              {
                text: "🔄 ሁሉንም ሚድያ ይቀይሩ",
                callback_data: "user_photo_replace",
              },
            ],
            [
              {
                text: "🗑️ ሁሉንም ሚድያ ይሰርዙ",
                callback_data: "user_photo_delete",
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
        prompt: `አዲስ ${field} ያስገቡ:`,
        dbField: field,
      }
    );
  },

  // Helper function to get bathroom type options for users
  getUserBathroomTypeOptions(propertyTitle) {
    if (["ስቱዲዮ", "ኮንዶሚንየም", "አፓርታማ"].includes(propertyTitle)) {
      return [
        [{ text: "🚿 ሻወር", callback_data: "user_bathroom_edit_ሻወር" }],
        [{ text: "🛁 ባዝ", callback_data: "user_bathroom_edit_ባዝ" }],
        [
          {
            text: "🚿🛁 ሻወር እና ባዝ",
            callback_data: "user_bathroom_edit_ሻወር እና ባዝ",
          },
        ],
      ];
    } else {
      return [
        [{ text: "🚿 ሻወር", callback_data: "user_bathroom_edit_ሻወር" }],
        [{ text: "🛁 ባዝ", callback_data: "user_bathroom_edit_ባዝ" }],
        [
          {
            text: "🚿🛁 ሻወር እና ባዝ",
            callback_data: "user_bathroom_edit_ሻወር እና ባዝ",
          },
        ],
        [{ text: "🚽 ቀላል", callback_data: "user_bathroom_edit_ቀላል" }],
      ];
    }
  },

  async handleUserEditField(callback) {
    try {
      const chatId = callback.message.chat.id;
      const parts = callback.data.split("_");

      // Handle compound field names (like contact_info, display_name, etc.)
      let field, postId;
      if (parts.length === 5) {
        field = parts[3];
        postId = parts[4];
      } else if (parts.length === 6) {
        field = `${parts[3]}_${parts[4]}`;
        postId = parts[5];
      } else {
        console.error("Invalid callback data format:", callback.data);
        return bot().answerCallbackQuery(callback.id, {
          text: "ልክ ያልሆነ ቅርጽ!",
        });
      }

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      // Get post details for context
      const post = await db.getPost(postId);
      if (!post) {
        return bot().sendMessage(chatId, "❌ ማስታወቂያ አልተገኘም!");
      }

      setState(chatId, {
        step: `user_edit_${field}`,
        postId: parseInt(postId),
        editingField: field,
        post: post,
      });

      // Get field-specific prompts and validation
      const fieldInfo = this.getUserFieldEditInfo(field, post);

      await bot().sendMessage(
        chatId,
        `✏️ <b>${fieldInfo.displayName} ማረሚያ</b>\n\n` +
          `📋 <b>አሁን ያለው:</b> ${fieldInfo.currentValue}\n\n` +
          `${fieldInfo.prompt}`,
        {
          parse_mode: "HTML",
          reply_markup: fieldInfo.keyboard || undefined,
        }
      );
    } catch (error) {
      console.error("Error in handleUserEditField:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "የመርመሚያ ሂደት ጀማር ተሳንቷል!",
        });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleUserEditInput(msg) {
    try {
      const chatId = msg.chat.id;
      const state = getState(chatId);

      if (!state || !state.step.startsWith("user_edit_") || !state.postId) {
        return;
      }

      const field = state.editingField;
      const postId = state.postId;
      const post = state.post;

      // Handle photos differently - photos now use buttons, not text input
      if (field === "photos") {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ ከላይ ያሉትን የሚድያ አስተዳደር ቁልፎች ይጠቀሙ።"
        );
      }

      // Get field info for validation
      const fieldInfo = this.getUserFieldEditInfo(field, post);

      // Validate input based on field type
      const validationResult = this.validateUserFieldInput(
        field,
        msg.text.trim()
      );
      if (!validationResult.isValid) {
        return bot().sendMessage(chatId, `❌ ${validationResult.error}`);
      }

      // Update the post field using regular updatePost for users
      const updateData = {};
      updateData[fieldInfo.dbField] = validationResult.value;

      await db.updatePost(chatId, updateData);

      // Get updated post for displaying new edit options
      const updatedPost = await db.getPost(postId);
      const editOptions = this.getUserEditOptionsForPost(updatedPost, postId);

      await bot().sendMessage(
        chatId,
        `✅ ${fieldInfo.displayName} በተሳካ ሁኔታ ተማርሟል!\n\n` +
          `📋 <b>አዲስ ዋጋ:</b> ${validationResult.value}\n\n` +
          "ሌላ ምን መርመም ይፈልጋሉ?",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: editOptions,
          },
        }
      );

      setState(chatId, { step: "user_edit", postId, post: updatedPost });
    } catch (error) {
      console.error("Error in handleUserEditInput:", error);
      bot().sendMessage(msg.chat.id, "❌ መስክ ማዘመን አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  // User field validation (similar to admin but adapted for users)
  validateUserFieldInput(field, value) {
    switch (field) {
      case "price":
        if (!/^\d+(\.\d{1,2})?$/.test(value)) {
          return {
            isValid: false,
            error: "እባክዎ ትክክለኛ ዋጋ ያስገቡ (ቁጥሮች ብቻ)",
          };
        }
        return { isValid: true, value: value };

      case "rooms_count":
      case "bedrooms":
      case "bathrooms":
      case "floor":
        if (!/^\d+$/.test(value)) {
          return {
            isValid: false,
            error: "እባክዎ ትክክለኛ ቁጥር ያስገቡ",
          };
        }
        return { isValid: true, value: parseInt(value) };

      case "platform_link":
        if (value.toLowerCase() === "ዝለል" || value.toLowerCase() === "ሃሳፍ") {
          return { isValid: true, value: null };
        }

        let validatedLink = value;
        try {
          new URL(value);
        } catch (e) {
          try {
            new URL(`http://${value}`);
            validatedLink = `http://${value}`;
          } catch (e2) {
            return {
              isValid: false,
              error: "እባክዎ ትክክለኛ ሊንክ ያስገቡ (https://example.com) ወይም 'ዝለል' ይጻፉ",
            };
          }
        }
        return { isValid: true, value: validatedLink };

      default:
        if (!value || value.length < 1) {
          return {
            isValid: false,
            error: "እባክዎ ዋጋ ያስገቡ",
          };
        }
        return { isValid: true, value: value };
    }
  },

  async handleUserEditDone(callback) {
    try {
      const chatId = callback.message.chat.id;
      const postId = callback.data.split("_")[3];

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id, { text: "ማረም ጨርሻለሁ!" });

      setState(chatId, { step: null });

      await bot().editMessageText(
        "✅  ተጠናቅቋል!\n\nአሁን የማስታወቂያዎን ቅድመ ዕይታ እንደገና ማየት ይችላሉ:",
        {
          chat_id: chatId,
          message_id: callback.message.message_id,
        }
      );

      // Show preview again after editing
      await this.showPreview(chatId);
    } catch (error) {
      console.error("Error in handleUserEditDone:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "ማረሙን  መጨረስ አልተቻለም !",
        });
      } catch (answerError) {
        console.error("Error answering callback query:", answerError);
      }
    }
  },

  async handleStartNewListing(msg) {
    const chatId = msg.chat.id;
    try {
      await bot().editMessageText("🔄 አዲስ ማስታወቂያ ...", {
        chat_id: chatId,
        message_id: msg.message_id,
      });

      // Reset state and start over with registration check
      setState(chatId, { step: null });
      const userController = require("./userController");
      await userController.handleStartPostingWithRegistrationCheck(chatId);
    } catch (error) {
      console.error("Error in handleStartNewListing:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ /start ተጠቅመው እንደገና ይሞክሩ።");
    }
  },

  async handleMediaGroupPhoto(msg) {
    const chatId = msg.chat.id;
    try {
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

          // Add all photos from media group to user's photos
          const totalPhotosToAdd = Math.min(
            mediaGroupPhotos.length,
            8 - photos.length
          );
          const newPhotos = mediaGroupPhotos.slice(0, totalPhotosToAdd);
          photos = [...photos, ...newPhotos];

          // Clear the media group from memory
          clearMediaGroup(mediaGroupId);

          // Update state
          setState(chatId, { photos });

          // Send single confirmation message
          if (photos.length >= 8) {
            await bot().sendMessage(
              chatId,
              `✅ ሚድያ 8/8 ተቀምጠዋል${
                mediaGroupPhotos.length > totalPhotosToAdd
                  ? ` (ከ${mediaGroupPhotos.length} ሚድያ የመጀመሪያውን 8 ወሰድን)`
                  : ""
              }\n\n` + `✅ 8 ሚድያ አስገብተዋል። እባክዎ 'ጨርሻለሁ' የሚለውን ቁልፍ ይጫኑ።`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "✅ ጨርሻለሁ", callback_data: "finish_photos" }],
                  ],
                },
              }
            );
          } else {
            await bot().sendMessage(
              chatId,
              `✅ ${newPhotos.length} ሚድያ ተጨመርዋል! አጠቃላይ: ${photos.length}/8\n\n` +
                `📷 ተጨማሪ ሚድያ መላክ ይችላሉ ወይም ሲጨርሱ "ጨርሻለሁ" የሚለውን  ቁልፉ ይጫኑ።`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "✅ ጨርሻለሁ", callback_data: "finish_photos" }],
                  ],
                },
              }
            );
          }
        } catch (error) {
          console.error("Error processing media group:", error);
        }
      }, 1000); // Wait 1 second for all photos in group to arrive
    } catch (error) {
      console.error("Error in handleMediaGroupPhoto:", error);
      bot().sendMessage(chatId, "❌ ሚድያ ማስቀመጥ አልተቻለም እባክዎ እንደገና ይሞክሩ።");
    }
  },
};
