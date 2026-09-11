const categories = Array.from({ length: 16 }, (_, index) => ({ id: `category-${index}`, name: `類別${index}`, sort_order: index, folder_id: null }));
const folders = Array.from({ length: 10 }, (_, index) => ({ id: `folder-${index}`, name: `相簿${index}`, sort_order: index, is_visible: true, is_locked: false, lock_method: null, lock_setup_required: false }));
const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cdefs%3E%3ClinearGradient id='g'%3E%3Cstop stop-color='%236f8ce8'/%3E%3Cstop offset='1' stop-color='%23d4a6db'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='180' height='180' fill='url(%23g)'/%3E%3C/svg%3E";

export async function getPhotosWorkspaceData() {
  return {
    categories,
    folders,
    photos: Array.from({ length: 18 }, (_, index) => ({
      id: `photo-${index}`,
      title: index === 2 ? "很長的照片標題用來確認手機卡片不會超出畫面" : `照片 ${index + 1}`,
      description: `照片說明 ${index + 1}`,
      originalFilename: `photo-${index}.jpg`,
      mimeType: "image/jpeg",
      byteSize: 1024 * (index + 1),
      favorite: index % 4 === 0,
      pinned: index === 0,
      archived: false,
      deletedAt: null,
      folder: null,
      category: categories[index % 5],
      imageUrl: pixel,
      updatedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T12:00:00.000Z`,
    })),
  };
}

export async function getCalendarWorkspaceData() {
  const now = new Date();
  const date = (dayOffset: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0).toISOString();
  return {
    events: [
      { id: "event-1", title: "專題討論", description: "確認進度", startsAt: date(0, 10), endsAt: date(0, 11), color: "green", updatedAt: date(0, 9) },
      { id: "event-2", title: "資料庫作業", description: null, startsAt: date(0, 14), endsAt: null, color: "blue", updatedAt: date(0, 9) },
      { id: "event-3", title: "日文複習", description: null, startsAt: date(0, 19), endsAt: null, color: "rose", updatedAt: date(0, 9) },
      { id: "event-4", title: "下週提醒", description: null, startsAt: date(5, 9), endsAt: null, color: "amber", updatedAt: date(0, 9) },
    ],
  };
}
