#!/usr/bin/env node

/**
 * Permanent Token Generator
 * Generates a permanent license token for a given DID
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { generateLicenseToken, decodeToken } = require("../services/tokenService");

async function generatePermanentToken() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
🔑 Permanent Token Generator

Usage: node scripts/generate-permanent-token.js <did_or_token> [note]

Examples:
  node scripts/generate-permanent-token.js GYM-1768976660
  node scripts/generate-permanent-token.js "existing-token-to-extract-did"
  node scripts/generate-permanent-token.js GYM-1768976660 "Premium User"

This script will:
1. Extract DID from token or use provided DID
2. Generate a permanent license token
3. Display the new token

Environment Required:
- TOKEN_PRIVATE_KEY must be set in .env file
`);
    process.exit(1);
  }

  const input = args[0];
  const note = args[1] || null;

  try {
    let did;

    // Check if input is a token or a DID
    if (input.includes(".")) {
      // It's a token, decode it
      console.log("🔍 Decoding existing token to extract DID...");
      try {
        const decoded = decodeToken(input);
        did = decoded.payload.did;
        console.log(`✅ Extracted DID: ${did}`);
        
        // Show current token info
        console.log("\n📋 Current Token Info:");
        console.log(`   Type: ${decoded.payload.type}`);
        console.log(`   Mode: ${decoded.payload.mode || "N/A"}`);
        console.log(`   Issued: ${decoded.payload.iat}`);
        if (decoded.payload.exp) {
          console.log(`   Expires: ${decoded.payload.exp}`);
        }
        if (decoded.payload.note) {
          console.log(`   Note: ${decoded.payload.note}`);
        }
      } catch (error) {
        console.error("❌ Failed to decode token:", error.message);
        console.log("💡 Treating input as DID instead...");
        did = input;
      }
    } else {
      // It's a DID
      did = input;
      console.log(`✅ Using DID: ${did}`);
    }

    // Check for private key
    if (!process.env.TOKEN_PRIVATE_KEY) {
      console.error(`
❌ Error: TOKEN_PRIVATE_KEY not found in environment

Please add TOKEN_PRIVATE_KEY to your .env file:
TOKEN_PRIVATE_KEY=your_base64_private_key_here

You can generate a new key pair using tweetnacl or similar Ed25519 library.
`);
      process.exit(1);
    }

    // Generate permanent token
    console.log("\n🔐 Generating permanent license token...");
    const permanentToken = generateLicenseToken(
      null, // Use env variable
      did,
      "permanent",
      null,
      note
    );

    console.log("\n✅ Permanent Token Generated Successfully!\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n🎫 PERMANENT LICENSE TOKEN:\n");
    console.log(permanentToken);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Decode and show new token info
    const decoded = decodeToken(permanentToken);
    console.log("\n📋 Token Details:");
    console.log(`   DID: ${decoded.payload.did}`);
    console.log(`   Type: ${decoded.payload.type}`);
    console.log(`   Mode: ${decoded.payload.mode}`);
    console.log(`   Issued: ${decoded.payload.iat}`);
    console.log(`   Expires: Never (Permanent)`);
    if (decoded.payload.note) {
      console.log(`   Note: ${decoded.payload.note}`);
    }

    console.log("\n💾 Save this token securely - it never expires!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error) {
    console.error("❌ Error generating token:", error.message);
    process.exit(1);
  }
}

generatePermanentToken();
