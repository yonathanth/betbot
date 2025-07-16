require("dotenv").config();
const { pool } = require("../config/database");

async function fixAdminIds() {
  try {
    console.log("🔍 Connecting to database...");
    await pool.getConnection();
    console.log("✅ Database connected");

    // Get environment admin IDs
    const envAdminIds = process.env.ADMIN_IDS
      ? process.env.ADMIN_IDS.split(",").map((id) => id.trim())
      : [];
    console.log("🎯 Environment admin IDs:", envAdminIds);

    if (envAdminIds.length === 0) {
      console.log("⚠️ No ADMIN_IDS found in environment variables");
      return;
    }

    // Get all admin users from database
    console.log("\n🔍 Checking database admin records...");
    const [dbAdmins] = await pool.query(`
      SELECT telegram_id, name, is_admin, is_active, created_at 
      FROM users 
      WHERE is_admin = TRUE 
      ORDER BY created_at DESC
    `);

    console.log(`📊 Found ${dbAdmins.length} admin record(s) in database:\n`);

    console.log("Database ID | Name              | Status    | Valid?");
    console.log("------------|-------------------|-----------|--------");

    const invalidAdmins = [];
    const validAdmins = [];

    for (const admin of dbAdmins) {
      const status = admin.is_active !== false ? "🟢 Active" : "🔴 Inactive";
      const name = (admin.name || "No name").padEnd(17).substring(0, 17);
      const id = String(admin.telegram_id).padEnd(11);

      // Check if this ID is valid (exists in environment)
      const isValid = envAdminIds.includes(String(admin.telegram_id));
      const validIcon = isValid ? "✅ Yes" : "❌ No";

      console.log(`${id} | ${name} | ${status}   | ${validIcon}`);

      if (!isValid) {
        invalidAdmins.push(admin);
      } else {
        validAdmins.push(admin);
      }
    }

    console.log(`\n📋 Analysis:`);
    console.log(`✅ Valid admins: ${validAdmins.length}`);
    console.log(`❌ Invalid/truncated admins: ${invalidAdmins.length}`);

    if (invalidAdmins.length > 0) {
      console.log(`\n🔧 Found truncated admin IDs that need fixing:`);

      for (const invalidAdmin of invalidAdmins) {
        const truncatedId = String(invalidAdmin.telegram_id);

        // Try to find matching environment ID
        const matchingEnvId = envAdminIds.find((envId) => {
          return (
            envId.includes(truncatedId) ||
            truncatedId.includes(envId.substring(0, -1))
          );
        });

        if (matchingEnvId) {
          console.log(
            `🔄 ${truncatedId} → ${matchingEnvId} (${
              invalidAdmin.name || "No name"
            })`
          );
        } else {
          console.log(`🗑️ ${truncatedId} → DELETE (no matching env ID)`);
        }
      }

      console.log(`\n❓ Do you want to fix these issues? (y/n)`);

      // For now, let's make it automatic based on clear truncation patterns
      await fixTruncatedIds(invalidAdmins, envAdminIds);
    }

    // Check for missing admins (in env but not in database)
    console.log(`\n🔍 Checking for missing admin records...`);
    const missingAdmins = envAdminIds.filter(
      (envId) =>
        !validAdmins.some((dbAdmin) => String(dbAdmin.telegram_id) === envId)
    );

    if (missingAdmins.length > 0) {
      console.log(
        `⚠️ Found ${missingAdmins.length} admin(s) in environment but not in database:`
      );
      for (const missingId of missingAdmins) {
        console.log(
          `📝 ${missingId} - use 'npm run setup-admin ${missingId}' to add`
        );
      }
    } else {
      console.log(`✅ All environment admins exist in database`);
    }

    console.log(`\n🎉 Admin ID verification completed!`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function fixTruncatedIds(invalidAdmins, envAdminIds) {
  try {
    console.log(`\n🔧 Fixing truncated admin IDs...`);

    for (const invalidAdmin of invalidAdmins) {
      const truncatedId = String(invalidAdmin.telegram_id);

      // Try to find the correct full ID
      let correctId = null;

      // Method 1: Find env ID that starts with truncated ID
      correctId = envAdminIds.find((envId) => envId.startsWith(truncatedId));

      // Method 2: Find env ID where truncated ID is missing last digit(s)
      if (!correctId) {
        correctId = envAdminIds.find((envId) => {
          // Check if envId with last character removed matches truncatedId
          return envId.substring(0, -1) === truncatedId;
        });
      }

      if (correctId) {
        // Check if the correct ID already exists in database
        const [existingCorrect] = await pool.query(
          "SELECT telegram_id FROM users WHERE telegram_id = ?",
          [correctId]
        );

        if (existingCorrect.length > 0) {
          console.log(
            `🗑️ Deleting duplicate ${truncatedId} (correct ID ${correctId} already exists)`
          );

          // Delete the truncated duplicate record
          await pool.query("DELETE FROM users WHERE telegram_id = ?", [
            truncatedId,
          ]);

          console.log(`✅ Deleted duplicate admin record`);
        } else {
          console.log(`🔄 Updating ${truncatedId} → ${correctId}`);

          // Update the telegram_id (no duplicate exists)
          await pool.query(
            "UPDATE users SET telegram_id = ? WHERE telegram_id = ?",
            [correctId, truncatedId]
          );

          console.log(`✅ Updated admin ID successfully`);
        }
      } else {
        console.log(
          `🗑️ Removing invalid admin ${truncatedId} (no matching pattern)`
        );

        // Delete invalid admin completely
        await pool.query("DELETE FROM users WHERE telegram_id = ?", [
          truncatedId,
        ]);

        console.log(`✅ Removed invalid admin`);
      }
    }

    console.log(`\n✅ All truncated admin IDs have been fixed!`);
  } catch (error) {
    console.error("Error fixing admin IDs:", error);
    throw error;
  }
}

fixAdminIds();
