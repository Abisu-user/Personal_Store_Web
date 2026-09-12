import { getNotesWorkspaceData as getNotesFixture } from "./mobile-stage3-data-stubs";
import { getPhotosWorkspaceData as getPhotosFixture } from "./mobile-stage4-data-stubs";

export async function getNotesWorkspaceData() {
  const data = await getNotesFixture();
  return {
    ...data,
    notes: data.notes.map(item => ({
      ...item,
      categories: item.category ? [item.category] : [],
      folders: item.folder ? [item.folder] : [],
    })),
  };
}

export async function getPhotosWorkspaceData() {
  const data = await getPhotosFixture();
  return {
    ...data,
    photos: data.photos.map(item => ({
      ...item,
      categories: item.category ? [item.category] : [],
      folders: item.folder ? [item.folder] : [],
    })),
  };
}
