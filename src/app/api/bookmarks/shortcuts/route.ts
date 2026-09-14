import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBookmarksWorkspaceData } from "@/lib/bookmarks/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const shortcutSchema = z.object({
  orderedIds: z.array(z.string().uuid()).max(100).refine(
    (ids) => new Set(ids).size === ids.length,
    "捷徑不可重複。",
  ),
});

type SupabaseError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function logShortcutError(operation: string, cause: unknown) {
  const error = cause as SupabaseError | null;
  console.error(`[bookmarks:shortcuts:${operation}] failed`, {
    code: error?.code ?? null,
    message: error?.message ?? (cause instanceof Error ? cause.message : String(cause)),
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  });
}

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = shortcutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "請確認常用網站的選擇與順序。" }, { status: 400 });
  }

  try {
    // This loader applies the same primary-folder + junction-folder lock rule
    // used by Overview, recent items, the library, and search. The browser can
    // therefore never nominate an entry hidden by a locked folder.
    const workspace = await getBookmarksWorkspaceData(context.userId);
    const exposableIds = workspace.bookmarks
      .filter((bookmark) => !bookmark.deletedAt && !bookmark.archived && Boolean(bookmark.detail?.url))
      .map((bookmark) => bookmark.id);
    const exposableSet = new Set(exposableIds);
    if (parsed.data.orderedIds.some((id) => !exposableSet.has(id))) {
      return NextResponse.json({ error: "部分網站目前不可設定為常用網站。" }, { status: 403 });
    }

    const { data, error } = await createAdminClient().rpc(
      "vault_update_bookmark_overview_shortcuts",
      {
        target_user_id: context.userId,
        target_selected_entry_ids: parsed.data.orderedIds,
        target_exposable_entry_ids: exposableIds,
      },
    );
    if (error) throw error;

    return NextResponse.json(
      { ok: true, count: typeof data === "number" ? data : parsed.data.orderedIds.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (cause) {
    logShortcutError("update", cause);
    return NextResponse.json(
      { error: "目前無法儲存常用網站，請稍後再試。" },
      { status: 503 },
    );
  }
}
