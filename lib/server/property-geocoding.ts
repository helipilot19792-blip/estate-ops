const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  process.env.GEOCODING_USER_AGENT ||
  "estate-ops/1.0 (property geocoding; contact onboarding@estateofmindpm.com)";

export type GeocodedCoordinates = {
  latitude: number;
  longitude: number;
};

function normalizeCoordinate(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function geocodePropertyAddress(address: string): Promise<GeocodedCoordinates | null> {
  const query = String(address || "").trim();
  if (!query) return null;

  const response = await fetch(
    `${NOMINATIM_ENDPOINT}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Geocoding failed with status ${response.status}.`);
  }

  const results = (await response.json().catch(() => null)) as
    | Array<{ lat?: string | number; lon?: string | number }>
    | null;
  const match = Array.isArray(results) ? results[0] : null;
  const latitude = normalizeCoordinate(match?.lat);
  const longitude = normalizeCoordinate(match?.lon);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}
