import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Vault",
    short_name: "Personal Vault",
    description: "Secure personal information storage.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#6572df",
    theme_color: "#6572df",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
