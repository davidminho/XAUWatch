import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XAUWatch — XAUUSD & BTCUSD Day Trade Dashboard",
    short_name: "XAUWatch",
    description: "Mobile-first XAUUSD and BTCUSD decision dashboard with chart screenshots, structured AI analysis, and visual trade plans.",
    start_url: "/",
    display: "standalone",
    background_color: "#03050a",
    theme_color: "#03050a",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
