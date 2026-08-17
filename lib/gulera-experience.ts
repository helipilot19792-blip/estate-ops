export const GULERA_EXPERIENCE_KEY = "gulera-os-experience";

export type GuleraExperience = "classic" | "v2";

export function parseGuleraExperience(value: string | null | undefined): GuleraExperience | null {
  return value === "classic" || value === "v2" ? value : null;
}

export function getPreferredGuleraExperience(): GuleraExperience | null {
  if (typeof window === "undefined") return null;

  try {
    return parseGuleraExperience(window.localStorage.getItem(GULERA_EXPERIENCE_KEY));
  } catch {
    return null;
  }
}

export function rememberGuleraExperience(experience: GuleraExperience) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(GULERA_EXPERIENCE_KEY, experience);
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
    // Navigation must still work even when the preference cannot persist.
  }
}

export function getPreferredAdminDestination() {
  const preference = getPreferredGuleraExperience();

  if (preference === "classic") return "/admin";
  if (preference === "v2") return "/admin-v2";
  return "/choose-experience";
}
