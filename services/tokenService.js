const nacl = require("tweetnacl");

/**
 * Token generation service for creating signed tokens using Ed25519
 */

function b64uEncode(bytes) {
  const b64 = Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return b64;
}

function b64uDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function toUtf8(s) {
  return Buffer.from(s, "utf8");
}

function isoNow() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString();
}

function addMinutesIso(minutes) {
  const d = new Date();
  d.setUTCMinutes(d.getUTCMinutes() + Number(minutes));
  return d.toISOString();
}

function generateLicenseToken(skB64, did, mode, days = null, note = null) {
  // Use private key from environment if not provided
  const privateKey = skB64 || process.env.TOKEN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "No private key provided. Set TOKEN_PRIVATE_KEY in .env file or pass it as parameter."
    );
  }

  const sk = b64uDecode(privateKey);
  if (sk.length !== 64) {
    throw new Error(
      "Ed25519 private key must be 64 bytes (seed+public), base64-url or base64 acceptable."
    );
  }

  const keyPair = nacl.sign.keyPair.fromSecretKey(new Uint8Array(sk));
  const header = { alg: "Ed25519", kid: "v1" };

  let payload;
  if (mode === "permanent") {
    payload = {
      v: 1,
      type: "license",
      did,
      iat: isoNow(),
      mode: mode,
      ...(note ? { note } : {}),
    };
  } else if (mode === "periodic") {
    if (!days) {
      throw new Error("Periodic license requires days parameter");
    }
    payload = {
      v: 1,
      type: "license",
      did,
      iat: isoNow(),
      mode: mode,
      exp: addDaysIso(days),
      ...(note ? { note } : {}),
    };
  } else {
    throw new Error("License mode must be 'permanent' or 'periodic'");
  }

  const headerB64 = b64uEncode(toUtf8(JSON.stringify(header)));
  const payloadB64 = b64uEncode(toUtf8(JSON.stringify(payload)));
  const message = toUtf8(`${headerB64}.${payloadB64}`);

  const sig = nacl.sign.detached(message, keyPair.secretKey);
  const sigB64 = b64uEncode(Buffer.from(sig));

  const token = `${headerB64}.${payloadB64}.${sigB64}`;
  return token;
}

function generateRecoveryToken(skB64, did, minutes, note = null) {
  // Use private key from environment if not provided
  const privateKey = skB64 || process.env.TOKEN_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "No private key provided. Set TOKEN_PRIVATE_KEY in .env file or pass it as parameter."
    );
  }

  const sk = b64uDecode(privateKey);
  if (sk.length !== 64) {
    throw new Error(
      "Ed25519 private key must be 64 bytes (seed+public), base64-url or base64 acceptable."
    );
  }

  const keyPair = nacl.sign.keyPair.fromSecretKey(new Uint8Array(sk));
  const header = { alg: "Ed25519", kid: "v1" };

  const payload = {
    v: 1,
    type: "recovery",
    did,
    iat: isoNow(),
    exp: addMinutesIso(minutes),
    ...(note ? { note } : {}),
  };

  const headerB64 = b64uEncode(toUtf8(JSON.stringify(header)));
  const payloadB64 = b64uEncode(toUtf8(JSON.stringify(payload)));
  const message = toUtf8(`${headerB64}.${payloadB64}`);

  const sig = nacl.sign.detached(message, keyPair.secretKey);
  const sigB64 = b64uEncode(Buffer.from(sig));

  const token = `${headerB64}.${payloadB64}.${sigB64}`;
  return token;
}

function validatePrivateKey(skB64) {
  try {
    const sk = b64uDecode(skB64);
    return sk.length === 64;
  } catch (error) {
    return false;
  }
}

function decodeToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }

    const header = JSON.parse(Buffer.from(b64uDecode(parts[0])).toString());
    const payload = JSON.parse(Buffer.from(b64uDecode(parts[1])).toString());

    return {
      header,
      payload,
      signature: parts[2],
    };
  } catch (error) {
    throw new Error("Failed to decode token: " + error.message);
  }
}

module.exports = {
  generateLicenseToken,
  generateRecoveryToken,
  validatePrivateKey,
  decodeToken,
  b64uEncode,
  b64uDecode,
};
