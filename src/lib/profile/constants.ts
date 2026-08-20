export const profileAvatars = ["✦", "◈", "◉", "◆", "●", "☁"] as const;
export type ProfileAvatar = (typeof profileAvatars)[number];
