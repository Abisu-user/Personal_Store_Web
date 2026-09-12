import React from "react";
import { createRoot } from "react-dom/client";
import BookmarksPage from "@/app/(app)/bookmarks/page";
import NotesPage from "@/app/(app)/notes/page";
import PhotosPage from "@/app/(app)/photos/page";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileAppNavigation } from "@/components/layout/mobile-app-navigation";
import { CreateItemProvider } from "@/components/layout/create-item-provider";
import { applyAppearance, appearanceDefaults, setAppearanceIdentity } from "@/lib/appearance/preferences";

const requested = new URLSearchParams(location.search).get("page");
window.testPath = requested === "notes" ? "/notes" : requested === "photos" ? "/photos" : "/bookmarks";
setAppearanceIdentity("mobile-collections-test");
window.setTestAppearance = (settings: object) => applyAppearance({ ...appearanceDefaults, ...settings });
applyAppearance({ ...appearanceDefaults, theme: "light" });
const Page = window.testPath === "/notes" ? NotesPage : window.testPath === "/photos" ? PhotosPage : BookmarksPage;
void Page().then(page => createRoot(document.getElementById("root")!).render(
  <CreateItemProvider><div className="app-shell">
    <AppSidebar email="layout-test@example.com" displayName="Layout Test" avatar="✦" />
    <div className="app-main">{page}</div>
    <MobileAppNavigation />
  </div></CreateItemProvider>,
));
