import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gulera OS",
    short_name: "Gulera OS",
    description: "STR operations portal for teams and owners",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f0d0a",
    theme_color: "#0f0d0a",
    icons: [
      {
        src: "/gulera-pwa-icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/gulera-pwa-icon-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
