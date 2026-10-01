"use client";

import { useEffect, useRef } from "react";
import { inspectPushDevice } from "@/lib/calendar/push-device";

/** Quiet startup recovery inside the authenticated app. Reuses the existing device/opt-out rules. */
export function CalendarPushReconciler({ accountId }: { accountId: string }) {
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (startedFor.current === accountId || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    startedFor.current = accountId;
    // No permission request, success toast, key rotation or subscription reset.
    // Strict Mode's duplicate effect must not cause duplicate upserts.
    void inspectPushDevice().catch(() => undefined);
  }, [accountId]);
  return null;
}
