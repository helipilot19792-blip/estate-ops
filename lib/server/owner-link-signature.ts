import { createHmac, timingSafeEqual } from "crypto";

function getSigningSecret() {
  const secret =
    process.env.OWNER_LINK_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!secret) {
    throw new Error("Missing owner link signing secret.");
  }

  return secret;
}

export function signOwnerEmail(ownerEmail: string) {
  return createHmac("sha256", getSigningSecret())
    .update(ownerEmail.trim().toLowerCase())
    .digest("base64url");
}

export function verifyOwnerEmailSignature(ownerEmail: string, signature: string) {
  if (!signature) return false;

  const expected = signOwnerEmail(ownerEmail);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
