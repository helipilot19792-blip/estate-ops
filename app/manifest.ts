import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gulera Ops",
    short_name: "Gulera Ops",
    description: "Cleaner scheduling and STR operations portal",
    start_url: "/cleaner",
    scope: "/",
    display: "standalone",
    background_color: "#0f0d0a",
    theme_color: "#0f0d0a",
    icons: [
      {
        src: "/gulera-pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/gulera-pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
