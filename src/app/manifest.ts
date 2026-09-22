import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Store",
    short_name: "Personal Store",
    description: "Secure personal information storage.",
    // Launch the installed PWA inside the protected app shell. A valid
    // Supabase session then lands on the App PIN / Passkey lock overlay;
    // signed-out visitors are redirected to the regular login page.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#f5f7fb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
