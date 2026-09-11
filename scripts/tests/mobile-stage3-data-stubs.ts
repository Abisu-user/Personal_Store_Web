const categories = Array.from({ length: 16 }, (_, index) => ({ id: `category-${index}`, name: `類別${index}`, sort_order: index, folder_id: null }));
const folders = Array.from({ length: 10 }, (_, index) => ({ id: `folder-${index}`, name: `資料夾${index}`, sort_order: index, is_visible: true, is_locked: false, lock_method: null, lock_setup_required: false }));
const common = (index: number) => ({
  id: `item-${index}`,
  title: `測試項目${index}`,
  description: index === 3 ? "較長的真實摘要內容，用來確認手機卡片不會因文字長度而超出容器。" : `摘要內容 ${index}`,
  favorite: index % 4 === 0,
  pinned: index === 0,
  archived: false,
  deletedAt: null,
  folder: null,
  coverImageUrl: null,
  category: categories[index % 5],
  tags: [],
  updatedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T12:00:00.000Z`,
});

export async function getNotesWorkspaceData() {
  return { categories, folders, tags: [], notes: Array.from({ length: 12 }, (_, index) => ({ ...common(index), content: `筆記內容 ${index}`, currentVersion: index + 1 })) };
}

export async function getCodeWorkspaceData() {
  const languages = ["TypeScript", "Python", "HTML", "CSS", "SQL", "Shell"];
  return { categories, folders, tags: [], snippets: Array.from({ length: 12 }, (_, index) => ({ ...common(index), language: languages[index % languages.length], sourceCode: `const item${index} = true;\nconsole.log(item${index});` })) };
}
