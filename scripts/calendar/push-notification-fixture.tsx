"use client";
import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarNotificationSettings } from "@/components/calendar/calendar-notifications";
import { CalendarPushReconciler } from "@/components/calendar/calendar-push-reconciler";

function Fixture() {
  const startup = new URL(location.href).searchParams.has("startup");
  const [open, setOpen] = useState(!startup);
  return <>{startup && <CalendarPushReconciler accountId="account-fixture" />}<button onClick={() => setOpen(true)}>行程通知</button><CalendarNotificationSettings open={open} onClose={() => setOpen(false)} /></>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
