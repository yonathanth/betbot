#!/usr/bin/env node

/**
 * Ed25519 Key Pair Generator
 * Generates a new Ed25519 key pair for token signing
 */

const nacl = require("tweetnacl");
const { b64uEncode } = require("../services/tokenService");

console.log("🔐 Ed25519 Key Pair Generator\n");
console.log("Generating new key pair...\n");

// Generate new key pair
const keyPair = nacl.sign.keyPair();

// Combine secret key (seed + public key = 64 bytes)
const privateKey = Buffer.from(keyPair.secretKey);
const publicKey = Buffer.from(keyPair.publicKey);

// Encode to base64url
const privateKeyB64 = b64uEncode(privateKey);
const publicKeyB64 = b64uEncode(publicKey);

console.log("✅ Key Pair Generated Successfully!\n");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("\n🔑 PRIVATE KEY (Keep this SECRET!):\n");
console.log(privateKeyB64);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("\n🔓 PUBLIC KEY (Can be shared for verification):\n");
console.log(publicKeyB64);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("📋 Key Details:");
console.log(`   Private Key Length: ${privateKey.length} bytes (${privateKeyB64.length} chars)`);
console.log(`   Public Key Length: ${publicKey.length} bytes (${publicKeyB64.length} chars)`);

console.log("\n📝 Add this to your .env file:\n");
console.log(`TOKEN_PRIVATE_KEY=${privateKeyB64}`);
console.log(`TOKEN_PUBLIC_KEY=${publicKeyB64}`);

console.log("\n⚠️  IMPORTANT:");
console.log("   1. Keep the private key SECRET and secure");
console.log("   2. Never commit the private key to version control");
console.log("   3. Backup the private key safely");
console.log("   4. Anyone with the private key can generate valid tokens");
console.log("   5. The public key can be used to verify token signatures\n");
