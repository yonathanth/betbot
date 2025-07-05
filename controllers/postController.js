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

// Helper function for notifying admins
async function notifyAdminsNewPost(chatId) {
  try {
    const user = await db.getUser(chatId);
    const message =
      `🔔 <b>አዲስ ማስታወቂያ</b>\n\n` +
      `<b>ተጠቃሚ:</b> ${user.name}\n` +
      `<b>ስልክ:</b> ${user.phone}\n` +
      `<b>ቴሌግራም መለያ:</b> ${chatId}\n\n` +
      `በመጠባበቅ ላይ ያሉ ማስታወቂያዎችን /admin ብለው ያግኙ።`;

    await channelService.notifyAdmins(null, message);
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
        message = "🏠 የመኖሪያ ቤትዎ ምን ዓይነት ነው?";
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
        await bot().sendMessage(chatId, "ስንት ክፍል አለው? ቁጥር ብቻ ያስገቡ:");
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
      if (!msg.text || msg.text.length < 2) {
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
      await bot().sendMessage(chatId, "📐 የቤቱ ስፋት ስንት ነው?(በካሬ) ቁጥር ብቻ ያስገቡ፡");
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

  async askMainLocation(chatId) {
    try {
      setState(chatId, { step: "get_main_location" });
      await bot().sendMessage(
        chatId,
        "ዋና ሰፈሩ የት ነው?\n\n" + "እባክዎ ዋና ሰፈሩን ብቻ ያስገቡ (ምሳሌ: መገናኛ, ሰሚት, ቦሌ, ፒያሳ):",
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
      if (!msg.text || msg.text.length < 2) {
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
      if (!msg.text || msg.text.length < 3) {
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
        return this.askPlatformLink(chatId);
      }

      if (msg.text.length < 5) {
        return bot().sendMessage(
          chatId,
          "❌ እባክዎ ስለ ንብረቱ ዝርዝር መግለጫ ያስገቡ (ቢያንስ 5 ፊደል)፡"
        );
      }

      await db.updatePost(chatId, { description: msg.text.trim() });
      await this.askPlatformLink(chatId);
    } catch (error) {
      console.error("Error in handleDescriptionInput:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async skipDescription(chatId) {
    try {
      await this.askPlatformLink(chatId);
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
        "📸 ቤቱን ፎቶዎች ማስገባት ይፈልጋሉ?\n" + "(እስከ 8 ፎቶዎች ድረስ መጨመር ይችላሉ)",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📸 አዎ፣ ፎቶዎችን መጨመር እፈልጋለሁ",
                  callback_data: "add_photos",
                },
              ],
              [{ text: "⏭️ አይ፣፣ ፎቶዎች የሉኝም", callback_data: "skip_photos" }],
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
        "📷 እባክዎ የቤቱን ፎቶዎች ይላኩ\n\n" +
          "📝 መመሪያዎች:\n" +
          "• እስከ 8 ፎቶዎች ድረስ መላክ ይችላሉ\n" +
          "• ፎቶዎች ጥራታቸው ጥሩ እንዲሆን ያድርጉ\n" +
          "• ፎቶዎችን አንድ በአንድ ወይም በአንድ ጊዜ መላክ ይችላሉ\n" +
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

      if (!newPhoto) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ ፎቶ ይላኩ።");
      }

      // Check if adding this photo would exceed the limit
      if (photos.length >= 8) {
        return bot().sendMessage(
          chatId,
          "❌ አስቀድመው 8 ፎቶዎች አሉ። ተጨማሪ ፎቶዎች መጨመር አይችሉም። እባክዎ 'ፎቶዎች ጨርሻለሁ' ይጫኑ።"
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
          `✅ ፎቶዎች 8/8 ተቀምጠዋል (ከ8 በላይ ስለላኩ የመጀመሪያውን 8 እንወስዳለን)\n\n`,
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
        `✅ ፎቶ ${photos.length}/8 ተቀምጧል\n\n` +
          `${
            photos.length < 8
              ? "📷 ተጨማሪ ፎቶዎች መላክ ይችላሉ ወይም ቁልፉን ይጫኑ።"
              : "✅ 8 ፎቶዎች አስገብተዋል፣ እባክዎ ጨርሻለሁ ይጫኑ።"
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

        await bot().sendMessage(chatId, `✅ ${photos.length} ፎቶዎችዎ ተቀምጠዋል!`);
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

      await bot().sendMessage(
        chatId,
        "📋 <b>የማስታወቂያዎ ቅድመ ዕይታ:</b>\n\n" +
          "ከዚህ በታች ማስታወቂያዎ በቻናላችን ላይ እንዴት እንደሚታይ ይመልከቱ:\n\n" +
          "──────────────────\n\n" +
          previewMessage +
          "\n\n──────────────────",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ ይህ ይበቃኛል", callback_data: "confirm_listing" },
                { text: "🔄 እንደ አዲስ ጀመር", callback_data: "start_new_listing" },
              ],
            ],
          },
        }
      );
    } catch (error) {
      console.error("Error showing preview:", error);
      bot().sendMessage(chatId, "❌ ቅድመ ዕይታ ማሳየት አልተቻለም፣፣ እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async confirmListing(chatId) {
    try {
      // Check if this is an admin posting with custom info
      const state = getState(chatId);
      if (state?.admin_display_name && state?.admin_contact_info) {
        // Use admin-provided contact info
        await db.updatePost(chatId, {
          contact_info: state.admin_contact_info,
          display_name: state.admin_display_name,
        });
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
          "ቤት ቦትን ስለተጠቀሙ እናመሰግናለን!",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔄 አዲስ ማስታወቂያ ለመልቀቅ፣ ይህን ይጫኑ",
                  callback_data: "start_new_listing",
                },
              ],
            ],
          },
        }
      );

      // Notify admins
      notifyAdminsNewPost(chatId);
    } catch (error) {
      console.error("Error in confirmListing:", error);
      bot().sendMessage(chatId, "❌ ማስታወቂያ መላክ አልተቻለም። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async showEditOptions(chatId) {
    try {
      const state = getState(chatId);
      const postId = state.postId;

      await bot().sendMessage(chatId, "✏️ ምን መርመም ይፈልጋሉ?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🏡 የንብረት ዓይነት",
                callback_data: `user_edit_field_title_${postId}`,
              },
            ],
            [
              {
                text: "📍 አድራሻ",
                callback_data: `user_edit_field_location_${postId}`,
              },
            ],
            [
              {
                text: "💰 ዋጋ",
                callback_data: `user_edit_field_price_${postId}`,
              },
            ],
            [
              {
                text: "📞 ተያያዥ መረጃ",
                callback_data: `user_edit_field_contact_${postId}`,
              },
            ],
            [
              {
                text: "📝 መግለጫ",
                callback_data: `user_edit_field_description_${postId}`,
              },
            ],
            [
              {
                text: "🔗 ፕላትፎርም ሊንክ",
                callback_data: `user_edit_field_platform_${postId}`,
              },
            ],
            [
              {
                text: "📷 ፎቶዎች",
                callback_data: `user_edit_field_photos_${postId}`,
              },
            ],
            [
              {
                text: "✅ ማርመሙን አጠናቅቅ",
                callback_data: `user_edit_done_${postId}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      console.error("Error showing edit options:", error);
      bot().sendMessage(chatId, "❌ የማርመሙ አማራጮች ማሳየት ተሳንቶአል። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleUserEditField(callback) {
    try {
      const chatId = callback.message.chat.id;
      const parts = callback.data.split("_");
      const field = parts[3];
      const postId = parts[4];

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id);

      setState(chatId, {
        step: `user_edit_${field}`,
        postId: parseInt(postId),
        editingField: field,
      });

      const fieldNames = {
        title: "የንብረት ዓይነት",
        location: "አድራሻ",
        price: "ዋጋ",
        contact: "ተያያዥ መረጃ",
        description: "መግለጫ",
        platform: "ፕላትፎርም ሊንክ",
        photos: "ፎቶዎች",
      };

      if (field === "photos") {
        // Handle photos differently
        await bot().sendMessage(
          chatId,
          "📷 አዲስ ፎቶዎች ያስገቡ ወይም 'ሰዓጠ' ይተይቡ ፎቶዎችን ለማጥፋት:"
        );
      } else {
        await bot().sendMessage(
          chatId,
          `✏️ አዲስ ${fieldNames[field]} ያስገቡ:\n\n` +
            `<i>አዲስ ${fieldNames[field]}ዎን ይተይቡ እና ይላኩ።</i>`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error) {
      console.error("Error in handleUserEditField:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "የማርመሙ ሂደት ተሳንቷል!",
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

      // Handle different field types
      if (field === "photos") {
        if (msg.text && msg.text.toLowerCase() === "ሰዓጠ") {
          // Delete photos
          await db.deletePostPhotos(postId);
          await bot().sendMessage(chatId, "✅ ፎቶዎች ተጠፍተዋል!");
        } else if (msg.photo) {
          // Handle new photo
          await this.handlePhotoUpload(msg);
          return;
        }
      } else {
        // Update the post field
        const updateData = {};

        if (field === "platform") {
          const link = msg.text.trim();
          let platformName = "ሌላ";
          if (link.includes("facebook.com") || link.includes("fb.com")) {
            platformName = "Facebook";
          } else if (link.includes("tiktok.com")) {
            platformName = "TikTok";
          } else if (link.includes("jiji.")) {
            platformName = "Jiji";
          } else if (
            link.includes("youtube.com") ||
            link.includes("youtu.be")
          ) {
            platformName = "YouTube";
          }

          updateData.platform_link = link;
          updateData.platform_name = platformName;
        } else {
          // Add validation for platform link field
          if (field === "platform") {
            const link = msg.text.trim();

            // Check if user wants to skip
            if (link.toLowerCase() === "ዝለል" || link.toLowerCase() === "ሃሳፍ") {
              // Skip platform link - don't update, just proceed to show edit options
              await this.showEditOptions(chatId);
              return;
            }

            let validatedLink = link;

            // Validate URL
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
                  "❌ እባክዎ ትክክለኛ ሊንክ ያስገቡ (https://example.com):\n\nወይም 'ዝለል' ወይም 'ሃሳፍ' ይጻፉ ለመዝለል።"
                );
              }
            }

            // Update the link in updateData
            updateData.platform_link = validatedLink;
          } else {
            updateData[field] = msg.text.trim();
          }
        }

        await db.updatePost(chatId, updateData);

        await bot().sendMessage(
          chatId,
          `✅ ${field === "platform" ? "ፕላትፎርም ሊንክ" : field} ተማርሟል!\n\n` +
            "ሌላ ምን መርመም ይፈልጋሉ?"
        );
      }

      // Show edit options again
      await this.showEditOptions(chatId);
    } catch (error) {
      console.error("Error in handleUserEditInput:", error);
      bot().sendMessage(msg.chat.id, "❌ ማርመሙ ተሳንቷል። እባክዎ እንደገና ይሞክሩ።");
    }
  },

  async handleUserEditDone(callback) {
    try {
      const chatId = callback.message.chat.id;

      // Answer callback query first to prevent timeout
      bot().answerCallbackQuery(callback.id, { text: "ማርመሙ ተጠናቀቀ!" });

      setState(chatId, { step: null });

      await bot().editMessageText("✅ ማርመሙ ተጠናቆላል!\n\nይህ አሁን የማስታወቂያዎ ቅጽ ነው:", {
        chat_id: chatId,
        message_id: callback.message.message_id,
      });

      // Show preview again after editing
      await this.showPreview(chatId);
    } catch (error) {
      console.error("Error in handleUserEditDone:", error);
      try {
        bot().answerCallbackQuery(callback.id, {
          text: "ማርመሙ መጨረስ ተሳንቷል!",
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

      // Reset state and start over
      setState(chatId, { step: null });
      const userController = require("./userController");
      await userController.askListingType(chatId);
    } catch (error) {
      console.error("Error in handleStartNewListing:", error);
      bot().sendMessage(chatId, "❌ይቅርታ! እባክዎ /start ተጠቅመው እንደገና ይሞክሩ።");
    }
  },

  async handleMediaGroupPhoto(msg) {
    const chatId = msg.chat.id;
    try {
      const mediaGroupId = msg.media_group_id;

      // Add photo to media group collection
      let newPhoto = null;
      if (msg.photo) {
        newPhoto = {
          file_id: msg.photo[msg.photo.length - 1].file_id,
          file_size: msg.photo[msg.photo.length - 1].file_size,
          type: "photo",
        };
        addToMediaGroup(mediaGroupId, newPhoto);
      }

      // Set a timeout to process the complete media group
      // This gives time for all photos in the group to arrive
      setTimeout(async () => {
        try {
          const state = getState(chatId);
          let photos = state.photos || [];
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
              `✅ ፎቶዎች 8/8 ተቀምጠዋል${
                mediaGroupPhotos.length > totalPhotosToAdd
                  ? ` (ከ${mediaGroupPhotos.length} ፎቶዎች የመጀመሪያውን 8 ወሰድን)`
                  : ""
              }\n\n` + `✅ 8 ፎቶዎች አስገብተዋል። እባክዎ 'ጨርሻለሁ' የሚለውን ቁልፍ ይጫኑ።`,
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
              `✅ ${newPhotos.length} ፎቶዎች ተጨመርዋል! አጠቃላይ: ${photos.length}/8\n\n` +
                `📷 ተጨማሪ ፎቶዎች መላክ ይችላሉ ወይም ሲጨርሱ "ጨርሻለሁ" የሚለውን  ቁልፉ ይጫኑ።`,
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
      bot().sendMessage(chatId, "❌ ፎቶ ማስቀመጥ አልተቻለም እባክዎ እንደገና ይሞክሩ።");
    }
  },
};
