import React from "react";
import { createRoot } from "react-dom/client";
import CalendarPage from "@/app/(app)/calendar/page";
import PhotosPage from "@/app/(app)/photos/page";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileAppNavigation } from "@/components/layout/mobile-app-navigation";
import { CreateItemProvider } from "@/components/layout/create-item-provider";
import { applyAppearance, appearanceDefaults, setAppearanceIdentity, getAppearanceStorageKey } from "@/lib/appearance/preferences";

window.testPath = new URLSearchParams(location.search).get("page") === "calendar" ? "/calendar" : "/photos";
setAppearanceIdentity("layout-test");
window.setTestAppearance = (settings: object) => {
  const value = { ...appearanceDefaults, ...settings };
  applyAppearance(value);
  localStorage.setItem(getAppearanceStorageKey(), JSON.stringify(value));
  window.dispatchEvent(new Event("personal-vault:appearance"));
};
applyAppearance({ ...appearanceDefaults, theme: "light" });
const Page = window.testPath === "/calendar" ? CalendarPage : PhotosPage;
void Page().then(page => createRoot(document.getElementById("root")!).render(
  <CreateItemProvider><div className="app-shell">
    <AppSidebar email="layout-test@example.com" displayName="Layout Test" avatar="✦" />
    <div className="app-main">{page}</div><MobileAppNavigation />
  </div></CreateItemProvider>,
));
