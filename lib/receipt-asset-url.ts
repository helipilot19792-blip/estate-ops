import { parseStorageReference } from "./storage-reference";

type ReceiptStorage = {
  from: (bucket: string) => {
    createSignedUrl: (path: string, expiresIn: number) => Promise<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }>;
  };
};

// Resolve at the time of opening, including receipts saved as legacy signed URLs.
// Never fall back to a saved token when signing fails.
export async function getFreshReceiptUrl(storage: ReceiptStorage, value: string) {
  const raw = value.trim();
  const reference = parseStorageReference(raw);
  if (!reference) {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported receipt link.");
    }
    return url.href;
  }
  const { data, error } = await storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error("Could not open the receipt. Please try again or contact support.");
  }
  return data.signedUrl;
}
