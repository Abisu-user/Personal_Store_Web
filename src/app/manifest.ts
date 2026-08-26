import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Vault",
    short_name: "Personal Vault",
    description: "Secure personal information storage.",
    // Launch the installed PWA inside the protected app shell. A valid
    // Supabase session then lands on the App PIN / Passkey lock overlay;
    // signed-out visitors are redirected to the regular login page.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#6572df",
    theme_color: "#6572df",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
