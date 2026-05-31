import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Notion手帳",
    short_name: "手帳",
    description: "iPad Safariで使いやすいNotion連携カレンダー手帳",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf7",
    theme_color: "#111111",
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
