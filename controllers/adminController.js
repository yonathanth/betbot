const { getBot, setState, getState } = require("../services/botService");
const db = require("../services/dbService");
const channelService = require("../services/channelService");

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

  let message = `<b>${typeLabel}</b> - ID: ${post.id}\n\n`;

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

module.exports = {
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

      const postId = parseInt(msg.text);
      if (!postId || postId < 1) {
        return bot().sendMessage(chatId, "❌ እባክዎ ትክክለኛ Post ID ያስገቡ:");
      }

      const stats = await db.getPostStats(postId);
      if (!stats) {
        return bot().sendMessage(chatId, "❌ ማስታወቂያው አልተገኘም!");
      }

      const post = stats.post;
      const statsMessage =
        `📊<b>Post #${post.id} Statistics</b>\n\n` +
        `<b>Title:</b> ${post.title || "N/A"}\n` +
        `<b>Location:</b> ${post.location || "N/A"}\n` +
        `<b>Price:</b> ${post.price || "N/A"}\n` +
        `<b>Created:</b> ${new Date(post.created_at).toLocaleDateString(
          "am-ET"
        )}\n\n` +
        `📈 <b>Statistics:</b>\n` +
        `💬 Contact Clicks: ${stats.contactClicks}\n` +
        `👥 Unique Clickers: ${stats.uniqueClickers}`;

      await bot().sendMessage(chatId, statsMessage, { parse_mode: "HTML" });

      // Clear state
      setState(chatId, { step: null });
    } catch (error) {
      console.error("Error in handlePostStatsInput:", error);
      bot().sendMessage(msg.chat.id, "❌ Error retrieving statistics.");
    }
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
          // Send photos as media group with the post details as caption on first photo
          const mediaGroup = photos.map((photo, index) => ({
            type: "photo",
            media: photo.telegram_file_id,
            caption: index === 0 ? message : undefined,
            parse_mode: index === 0 ? "HTML" : undefined,
          }));

          await bot().sendMediaGroup(chatId, mediaGroup);

          // Send approval buttons as separate message
          await bot().sendMessage(chatId, `📋 Post ID: ${post.id} - Actions:`, {
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
          "🎉 ማስታወቂያዎ ጸድቆ ቻናላችን ላይ ተለቋል!\n\n" +
            "ተጨማሪ ማስታወቂያ ለመልቀቀቅ ከዚህ በታች ያለውን ቁልፍ ይጫኑ:",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "➕ አዲስ ማስታወቂያ ",
                    callback_data: "add_new_ad",
                  },
                ],
              ],
            },
          }
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
          `🏠 <b>Type:</b> ${
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
            text: "🏠 Rooms Count",
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
        prompt: "🏠 Enter the number of rooms (numbers only):",
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
            [{ text: "🏠 ጂ+1", callback_data: "villa_edit_ጂ+1" }],
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
        if (value.length < 3) {
          return { isValid: false, error: "እባክዎ ዋጋውን በዝርዝር ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "contact_info":
        if (value.length < 10) {
          return { isValid: false, error: "እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "title":
        if (value.length < 2) {
          return { isValid: false, error: "እባክዎ ትክክለኛ ርዕስ ያስገቡ:" };
        }
        return { isValid: true, value: value };

      case "location":
        if (value.length < 2) {
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

      if (!state || !state.step.startsWith("admin_post_")) {
        return;
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
          step: null,
          admin_display_name: state.admin_display_name,
          admin_contact_info: msg.text.trim(),
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
        "❌ <b>ማስታወቂያዎ አልተለቀቀም</b>\n\n" +
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
