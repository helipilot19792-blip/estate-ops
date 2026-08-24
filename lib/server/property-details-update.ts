type PropertyDetailsBody = Record<string, unknown>;

function hasOwn(body: PropertyDetailsBody, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function cleanOptionalText(value: unknown) {
  return String(value ?? "").trim() || null;
}

function normalizeOptionalTime(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function normalizeOptionalCoordinate(value: unknown, min: number, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return "";
  return parsed;
}

export function buildPropertyDetailsUpdatePayload(body: PropertyDetailsBody) {
  const updatePayload: Record<string, unknown> = {};
  const optionalTextFields = [
    ["wifiNetwork", "wifi_network"],
    ["wifiPassword", "wifi_password"],
    ["guestDeviceWelcomeMessage", "guest_device_welcome_message"],
    ["guestDeviceLocalInfo", "guest_device_local_info"],
    ["garbageDay", "garbage_day"],
    ["garbageNotes", "garbage_notes"],
    ["garbageRotationAnchorDate", "garbage_rotation_anchor_date"],
  ] as const;

  for (const [bodyKey, column] of optionalTextFields) {
    if (hasOwn(body, bodyKey)) {
      updatePayload[column] = cleanOptionalText(body[bodyKey]);
    }
  }

  if (hasOwn(body, "garbagePickupWeekday")) {
    updatePayload.garbage_pickup_weekday =
      body.garbagePickupWeekday === "" ||
      body.garbagePickupWeekday === null ||
      body.garbagePickupWeekday === undefined
        ? null
        : Number(body.garbagePickupWeekday);
  }

  if (hasOwn(body, "garbageWeekALabel")) {
    updatePayload.garbage_week_a_label =
      String(body.garbageWeekALabel ?? "").trim() || "Garbage + recycling";
  }

  if (hasOwn(body, "garbageWeekBLabel")) {
    updatePayload.garbage_week_b_label =
      String(body.garbageWeekBLabel ?? "").trim() || "Recycling only";
  }

  if (hasOwn(body, "latitude")) {
    updatePayload.latitude = normalizeOptionalCoordinate(body.latitude, -90, 90);
  }

  if (hasOwn(body, "longitude")) {
    updatePayload.longitude = normalizeOptionalCoordinate(body.longitude, -180, 180);
  }

  if (hasOwn(body, "defaultCheckinTime")) {
    updatePayload.default_checkin_time = normalizeOptionalTime(body.defaultCheckinTime);
  }

  if (hasOwn(body, "defaultCheckoutTime")) {
    updatePayload.default_checkout_time = normalizeOptionalTime(body.defaultCheckoutTime);
  }

  return updatePayload;
}
