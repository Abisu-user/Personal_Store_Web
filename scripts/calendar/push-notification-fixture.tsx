"use client";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarNotificationSettings } from "@/components/calendar/calendar-notifications";

function Fixture() {
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setOpen(true)}>行程通知</button><CalendarNotificationSettings open={open} onClose={() => setOpen(false)} /></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
