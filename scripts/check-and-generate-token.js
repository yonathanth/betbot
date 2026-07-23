#!/usr/bin/env node

/**
 * Token Checker and Generator
 * Helps diagnose and generate tokens
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { generateLicenseToken, decodeToken, validatePrivateKey, b64uDecode } = require("../services/tokenService");

console.log("🔍 Token Analysis Tool\n");

// Check environment
console.log("📋 Environment Check:");
console.log(`   TOKEN_PRIVATE_KEY exists: ${!!process.env.TOKEN_PRIVATE_KEY}`);
if (process.env.TOKEN_PRIVATE_KEY) {
  console.log(`   TOKEN_PRIVATE_KEY length: ${process.env.TOKEN_PRIVATE_KEY.length} chars`);
  
  try {
    const decoded = b64uDecode(process.env.TOKEN_PRIVATE_KEY);
    console.log(`   Decoded key length: ${decoded.length} bytes`);
    console.log(`   Valid Ed25519 key: ${decoded.length === 64 ? '✅ Yes' : '❌ No (needs 64 bytes)'}`);
  } catch (error) {
    console.log(`   ❌ Failed to decode: ${error.message}`);
  }
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: node scripts/check-and-generate-token.js <did> [note]

Example:
  node scripts/check-and-generate-token.js GYM-1768976660
  node scripts/check-and-generate-token.js GYM-1768976660 "Premium User"

This will generate a permanent license token for the given DID.
`);
  process.exit(0);
}

const did = args[0];
const note = args[1] || null;

console.log(`🎯 Target DID: ${did}`);
if (note) console.log(`📝 Note: ${note}`);

try {
  console.log("\n🔐 Generating permanent license token...\n");
  
  const permanentToken = generateLicenseToken(
    null, // Use env variable
    did,
    "permanent",
    null,
    note
  );

  console.log("✅ SUCCESS! Permanent Token Generated:\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(permanentToken);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Decode and show details
  const decoded = decodeToken(permanentToken);
  console.log("📋 Token Details:");
  console.log(`   DID: ${decoded.payload.did}`);
  console.log(`   Type: ${decoded.payload.type}`);
  console.log(`   Mode: ${decoded.payload.mode}`);
  console.log(`   Issued: ${decoded.payload.iat}`);
  console.log(`   Expires: Never (Permanent)`);
  if (decoded.payload.note) {
    console.log(`   Note: ${decoded.payload.note}`);
  }

  console.log("\n💾 This token never expires - save it securely!\n");

} catch (error) {
  console.error("\n❌ Error:", error.message);
  console.log("\n💡 Troubleshooting:");
  console.log("   1. Ensure TOKEN_PRIVATE_KEY is set in .env");
  console.log("   2. Key must be 64 bytes when base64-decoded");
  console.log("   3. Key should be base64 or base64url encoded");
  process.exit(1);
}
