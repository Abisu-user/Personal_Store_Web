import { notFound, redirect } from "next/navigation";

// Compatibility for saved links. Current UI opens dialogs without navigating.
export default async function CreateTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const pages: Record<string, string> = { bookmark: "/bookmarks", note: "/notes", code: "/code", file: "/files", photo: "/photos", vocabulary: "/vocabulary" };
  if (!pages[type]) notFound();
  redirect(`${pages[type]}?create=${type}`);
}
