import assert from "node:assert/strict";
import {
  createStorageReference,
  isStorageReference,
  parseStorageReference,
} from "../lib/storage-reference.ts";

const reference = createStorageReference("invoice-assets", "org-1/receipts/My File.pdf");
assert.equal(reference, "storage://invoice-assets/org-1/receipts/My File.pdf");
assert.equal(isStorageReference(reference), true);
assert.deepEqual(parseStorageReference(reference), {
  bucket: "invoice-assets",
  path: "org-1/receipts/My File.pdf",
});
assert.deepEqual(
  parseStorageReference(
    "https://project.supabase.co/storage/v1/object/public/property-sop-images/property-1/cover/photo.jpg"
  ),
  { bucket: "property-sop-images", path: "property-1/cover/photo.jpg" }
);
assert.equal(parseStorageReference("https://example.com/photo.jpg"), null);

console.log("storage reference tests passed");
