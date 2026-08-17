const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isGuleraOsV2Enabled(value = process.env.GULERA_OS_V2_ENABLED) {
  return ENABLED_VALUES.has(String(value || "").trim().toLowerCase());
}
