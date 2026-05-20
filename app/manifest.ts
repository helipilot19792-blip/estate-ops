import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estate of Mind Portal",
    short_name: "Estate Portal",
    description: "Cleaner scheduling and STR operations portal",
    start_url: "/cleaner",
    scope: "/",
    display: "standalone",
    background_color: "#0f0d0a",
    theme_color: "#0f0d0a",
    icons: [
      {
        src: "/estateoslogo.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/eomlogo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
