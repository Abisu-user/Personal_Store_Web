import React from "react";
import { createRoot } from "react-dom/client";
import Page from "@/app/(app)/dashboard/page";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileAppNavigation } from "@/components/layout/mobile-app-navigation";
import { CreateItemProvider } from "@/components/layout/create-item-provider";
import { applyAppearance, appearanceDefaults } from "@/lib/appearance/preferences";
import { saveMobileNavigationPreferences } from "@/lib/layout/mobile-navigation-preferences";
window.setTestAppearance = (settings: object) => applyAppearance({ ...appearanceDefaults, ...settings });
window.setTestNavigation = saveMobileNavigationPreferences;
window.changeTestPath = (path: string) => { window.testPath = path; window.dispatchEvent(new Event("test:path")); };
window.newItemCalls = 0;
window.addEventListener("personal-vault:new-item", () => { window.newItemCalls += 1; });
applyAppearance({ ...appearanceDefaults, theme: "light" });
void Page().then(page => createRoot(document.getElementById("root")!).render(
  <React.StrictMode><CreateItemProvider><div className="app-shell">
    <AppSidebar email="layout-test@example.com" displayName="Layout Test" avatar="✦" />
    <div className="app-main">{page}</div><MobileAppNavigation />
  </div></CreateItemProvider></React.StrictMode>
));
