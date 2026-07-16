import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XAUWatch — XAUUSD Day Trade Dashboard",
    short_name: "XAUWatch",
    description: "Mobile-first XAUUSD decision dashboard with chart screenshots, structured AI analysis, and visual trade plans.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b09",
    theme_color: "#090b09",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
