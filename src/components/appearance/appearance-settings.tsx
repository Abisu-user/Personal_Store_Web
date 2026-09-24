"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import {
  BACKGROUND_IMAGE_ACCEPT,
  BACKGROUND_IMAGE_MAX_BYTES,
  BackgroundImageError,
  backgroundImageErrorMessage,
  backgroundImageMimeTypeForFile,
} from "@/lib/appearance/background-image-format";
import { prepareBackgroundImage } from "@/lib/appearance/background-image-processing";
import {
  Accent,
  Appearance,
  Background,
  BackgroundRotation,
  BookmarkDisplay,
  Density,
  FontFamily,
  SecondaryFontWeight,
  Theme,
  activeBackground,
  appearanceDefaults,
  applyAppearance,
  getBackgroundImageUrl,
  loadAccountAppearance,
  normalizeHexColor,
  removeBackgroundImage,
  saveAppearance,
  storeBackgroundImage,
} from "@/lib/appearance/preferences";
import {
  mobileNavigationDefaults,
  mobileNavigationDestinations,
  mobileNavigationVisibleSlotKeys,
  normalizeMobileNavigationColor,
  normalizeMobileNavigationPreferences,
  type MobileNavigationDestination,
  type MobileNavigationPreferences,
  type MobileNavigationSideCount,
  type MobileNavigationSlotKey,
} from "@/lib/layout/mobile-navigation-preferences";
import { mobileNavigationThemeVariables } from "@/lib/layout/mobile-navigation-theme";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";

const options = {
  theme: [
    ["system", "跟隨系統"],
    ["light", "淺色"],
    ["dark", "深色"],
  ] as const,
  accent: [
    ["blue", "靛藍"],
    ["violet", "紫羅蘭"],
    ["emerald", "翡翠綠"],
    ["rose", "玫瑰紅"],
  ] as const,
  background: [
    ["default", "預設"],
    ["mist", "柔霧"],
    ["aurora", "極光"],
    ["paper", "紙感"],
    ["midnight", "午夜"],
    ["image", "圖片"],
  ] as const,
  density: [
    ["comfortable", "舒適"],
    ["compact", "緊湊"],
  ] as const,
  bookmarkDisplay: [
    ["list", "行列＋圖片"],
    ["grid", "圖片格子"],
    ["text", "純文字清單"],
  ] as const,
  font: [
    ["system", "系統字"],
    ["rounded", "圓體"],
    ["serif", "明體"],
    ["mono", "等寬"],
  ] as const,
};
const focusPositions = [
  ["left", "偏左", 18, 50],
  ["center", "置中", 50, 50],
  ["right", "偏右", 82, 50],
  ["top", "偏上", 50, 18],
  ["bottom", "偏下", 50, 82],
] as const;

function hexToRgb(hex: string) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as const;
}
function rgbToHex(rgb: number[]) {
  return `#${rgb.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
function navigationDestination(id: MobileNavigationDestination) {
  return mobileNavigationDestinations.find((item) => item.id === id);
}
function MobileNavigationPreview({
  navigation,
}: {
  navigation: MobileNavigationPreferences;
}) {
  const keys = mobileNavigationVisibleSlotKeys(navigation.sideCount);
  const theme = mobileNavigationThemeVariables(navigation);
  const customItem = (key: MobileNavigationSlotKey) => {
    const item = navigationDestination(navigation.slots[key]);
    return item ? (
      <button
        aria-label={`${item.label}，可自訂`}
        className="mobile-navigation-preview-item"
        key={key}
        onClick={() =>
          document.getElementById(`mobile-navigation-${key}`)?.focus()
        }
        type="button"
      >
        <AppIcon name={item.icon} />
        <span>{item.label}</span>
      </button>
    ) : null;
  };
  return (
    <div
      className="mobile-navigation-live-preview"
      style={
        {
          ...theme,
          "--mobile-navigation-preview-count": navigation.sideCount * 2 + 1,
        } as CSSProperties
      }
    >
      <span aria-hidden="true" className="mobile-navigation-preview-indicator">
        <span />
      </span>
      <button
        aria-label="首頁，固定"
        className="mobile-navigation-preview-item fixed is-active"
        disabled
        type="button"
      >
        <AppIcon name="home" />
        <span>首頁</span>
        <small>固定</small>
      </button>
      {keys.left.map(customItem)}
      <button
        aria-label="新增，固定"
        className="mobile-navigation-preview-item fixed"
        disabled
        type="button"
      >
        <AppIcon name="plus" />
        <span>新增</span>
        <small>固定</small>
      </button>
      {keys.right.map(customItem)}
      <button
        aria-label="更多，固定"
        className="mobile-navigation-preview-item fixed"
        disabled
        type="button"
      >
        <AppIcon name="more" />
        <span>更多</span>
        <small>固定</small>
      </button>
    </div>
  );
}
export function AppearanceSettings() {
  const backgroundJobs = useBackgroundSave();
  const [appearance, setAppearance] = useState<Appearance>(appearanceDefaults);
  const [ready, setReady] = useState(false);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const [navigationColorDraft, setNavigationColorDraft] = useState(
    mobileNavigationDefaults.backgroundColor,
  );
  const rgb = useMemo(
    () => hexToRgb(appearance.customColor),
    [appearance.customColor],
  );
  const imageMode = appearance.background === "image";
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const hydrated = (await loadAccountAppearance({ all: true }))
          .appearance;
        if (!active) return;
        applyAppearance(hydrated);
        setAppearance(hydrated);
        setNavigationColorDraft(hydrated.mobileNavigation.backgroundColor);
        setReady(true);
      } catch {
        if (active) {
          setAppearance(appearanceDefaults);
          setReady(true);
        }
      }
    };
    void restore();
    const onSyncError = () =>
      setImageNotice("設定未能同步至帳號，請稍後再試。");
    window.addEventListener(
      "personal-vault:appearance-sync-error",
      onSyncError,
    );
    return () => {
      active = false;
      window.removeEventListener(
        "personal-vault:appearance-sync-error",
        onSyncError,
      );
    };
  }, []);
  function commit(next: Appearance, queueSync = true) {
    setAppearance(next);
    saveAppearance(next, { sync: false });
    if (!queueSync) return;
    backgroundJobs.enqueue({
      type: "appearance",
      title: "同步外觀設定",
      operation: "更新設定",
      page: "/appearance",
      entityKey: "appearance:current-device",
      mergeKey: "appearance:current-device",
      debounceMs: 350,
      persist: true,
      sensitive: false,
      request: {
        url: "/api/appearance",
        method: "PUT",
        body: {
          device: window.matchMedia("(max-width: 700px)").matches
            ? "mobile"
            : "desktop",
          appearance: next,
        },
      },
      onSuccess: () => {
        window.dispatchEvent(
          new CustomEvent("personal-vault:appearance-synced"),
        );
      },
      onError: () => {
        window.dispatchEvent(
          new CustomEvent("personal-vault:appearance-sync-error"),
        );
      },
    });
  }
  function update<Key extends keyof Appearance>(
    key: Key,
    value: Appearance[Key],
  ) {
    commit({ ...appearance, [key]: value } as Appearance);
  }
  function updateCustomColor(value: string) {
    commit({
      ...appearance,
      accent: "custom" as Accent,
      customColor: normalizeHexColor(value, appearance.customColor),
    });
  }
  function updateRgb(index: number, value: string) {
    if (value === "") return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const nextRgb = [...rgb];
    nextRgb[index] = Math.max(0, Math.min(255, parsed));
    updateCustomColor(rgbToHex(nextRgb));
  }
  const mobileNavigation = appearance.mobileNavigation;
  function saveMobileNavigation(next: MobileNavigationPreferences) {
    update("mobileNavigation", normalizeMobileNavigationPreferences(next));
  }
  function changeMobileNavigationCount(sideCount: MobileNavigationSideCount) {
    saveMobileNavigation({ ...mobileNavigation, sideCount });
  }
  function changeMobileNavigationItem(
    key: MobileNavigationSlotKey,
    value: MobileNavigationDestination,
  ) {
    const slots = { ...mobileNavigation.slots };
    const previous = slots[key];
    const duplicate = (
      Object.entries(slots) as Array<
        [MobileNavigationSlotKey, MobileNavigationDestination]
      >
    ).find(
      ([slotKey, destination]) => slotKey !== key && destination === value,
    );
    if (duplicate) slots[duplicate[0]] = previous;
    slots[key] = value;
    saveMobileNavigation({ ...mobileNavigation, slots });
  }
  function changeMobileNavigationColor(value: string) {
    setNavigationColorDraft(value);
    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value.trim()))
      saveMobileNavigation({
        ...mobileNavigation,
        backgroundColor: normalizeMobileNavigationColor(value),
      });
  }
  function resetMobileNavigation() {
    setNavigationColorDraft(mobileNavigationDefaults.backgroundColor);
    saveMobileNavigation(mobileNavigationDefaults);
  }
  function reset() {
    const references = [...appearance.backgroundImages];
    if (references.length)
      backgroundJobs.enqueue({
        type: "appearance-upload",
        title: "移除工作區背景",
        operation: "刪除背景",
        page: "/appearance",
        execute: async ({ reportProgress }) => {
          reportProgress(undefined, "正在移除背景圖片");
          await Promise.all(references.map(removeBackgroundImage));
        },
        persist: false,
        onError: (cause) =>
          setImageNotice(cause.message || "背景圖片移除失敗，請稍後再試。"),
      });
    setNavigationColorDraft(mobileNavigationDefaults.backgroundColor);
    commit(appearanceDefaults);
  }
  function chooseBackgrounds(files: FileList | null) {
    if (!files?.length) return;
    const selected = [...files];
    if (selected.some((file) => !backgroundImageMimeTypeForFile(file))) {
      setImageNotice(
        backgroundImageErrorMessage(
          new BackgroundImageError(
            "validation",
            "BACKGROUND_IMAGE_FORMAT_NOT_ALLOWED",
          ),
        ),
      );
      return;
    }
    if (selected.some((file) => file.size > BACKGROUND_IMAGE_MAX_BYTES)) {
      setImageNotice(
        backgroundImageErrorMessage(
          new BackgroundImageError("validation", "BACKGROUND_IMAGE_TOO_LARGE"),
        ),
      );
      return;
    }
    const previous = appearance;
    const available = Math.max(0, 10 - previous.backgroundImages.length);
    if (!available) {
      setImageNotice("背景圖片最多可保留 10 張，請先移除不需要的圖片。");
      return;
    }
    backgroundJobs.enqueue({
      type: "appearance-upload",
      title: `上傳 ${Math.min(selected.length, available)} 張工作區背景`,
      operation: "上傳背景",
      page: "/appearance",
      persist: false,
      execute: async ({ reportProgress }) => {
        reportProgress(undefined, "正在處理圖片");
        const images = await Promise.all(
          selected.slice(0, available).map(prepareBackgroundImage),
        );
        reportProgress(undefined, "正在上傳圖片");
        const references = await Promise.all(
          images.map((item) => storeBackgroundImage(item.blob)),
        );
        const merged = [...previous.backgroundImages, ...references].slice(-10);
        const activeIndex = Math.max(0, merged.length - references.length);
        await Promise.all(
          previous.backgroundImages
            .filter((reference) => !merged.includes(reference))
            .map(removeBackgroundImage),
        );
        return { images, merged, activeIndex };
      },
      onSuccess: (result) => {
        const value = result as {
          images: Awaited<ReturnType<typeof prepareBackgroundImage>>[];
          merged: string[];
          activeIndex: number;
        };
        commit({
          ...previous,
          background: "image",
          backgroundImages: value.merged,
          backgroundActiveIndex: value.activeIndex,
          backgroundImage: value.merged[value.activeIndex],
        });
        setImageNotice(
          value.images.some((item) => item.lowQuality)
            ? "已加入背景清單。原圖低於建議 2048 × 1152；過度放大或裁切後可能略為失真。"
            : `已加入 ${value.images.length} 張高畫質背景圖片。`,
        );
      },
      onError: (error) => {
        if (process.env.NODE_ENV !== "production")
          console.error("[workspace-background]", error);
        setImageNotice(backgroundImageErrorMessage(error));
      },
    });
    setImageNotice("背景圖片已加入背景工作，可繼續使用其他功能。");
  }
  function selectImage(index: number) {
    if (!getBackgroundImageUrl(appearance.backgroundImages[index]))
      setImageNotice("背景圖片正在載入，請稍候。 ");
    commit({
      ...appearance,
      background: "image",
      backgroundActiveIndex: index,
      backgroundImage: appearance.backgroundImages[index],
      backgroundRotation: "manual",
    });
  }
  function removeImage(index: number) {
    const removed = appearance.backgroundImages[index];
    const images = appearance.backgroundImages.filter(
      (_, current) => current !== index,
    );
    const activeIndex = Math.min(
      appearance.backgroundActiveIndex,
      Math.max(0, images.length - 1),
    );
    commit({
      ...appearance,
      backgroundImages: images,
      backgroundActiveIndex: activeIndex,
      backgroundImage: images[activeIndex],
    });
    backgroundJobs.enqueue({
      type: "appearance-upload",
      title: "移除工作區背景",
      operation: "刪除背景",
      page: "/appearance",
      execute: async ({ reportProgress }) => {
        reportProgress(undefined, "正在移除背景圖片");
        await removeBackgroundImage(removed);
      },
      persist: false,
      onError: (cause) =>
        setImageNotice(cause.message || "背景圖片移除失敗，請稍後再試。"),
    });
    setImageNotice(
      images.length ? "背景圖片已移除。" : "已移除所有自訂背景圖片。",
    );
  }
  const previewImage = activeBackground(appearance);

  return (
    <section aria-busy={!ready} className="appearance-workspace">
      <section className="appearance-preview">
        <div>
          <p className="eyebrow">LIVE PREVIEW</p>
          <h2>這是你的工作空間</h2>
          <p>選擇會立即套用並同步至這個帳號的相同版面裝置。</p>
        </div>
        <div className="appearance-sample">
          <span>V</span>
          <div>
            <strong>今日焦點</strong>
            <small>將常用資料整理得更舒服</small>
          </div>
          <i>◈</i>
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">THEME</p>
          <h2>明暗模式</h2>
        </div>
        <div className="appearance-options">
          {options.theme.map(([value, label]) => (
            <button
              aria-pressed={appearance.theme === value}
              className={
                appearance.theme === value
                  ? "appearance-choice active"
                  : "appearance-choice"
              }
              key={value}
              onClick={() => update("theme", value as Theme)}
              type="button"
            >
              <i className={`theme-swatch ${value}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">ACCENT</p>
          <h2>主色調</h2>
        </div>
        <div>
          <div className="appearance-options accent-options">
            {options.accent.map(([value, label]) => (
              <button
                aria-pressed={appearance.accent === value}
                className={
                  appearance.accent === value
                    ? "appearance-choice active"
                    : "appearance-choice"
                }
                key={value}
                onClick={() => update("accent", value as Accent)}
                type="button"
              >
                <i className={`accent-swatch ${value}`} />
                <span>{label}</span>
              </button>
            ))}
            <button
              aria-pressed={appearance.accent === "custom"}
              className={
                appearance.accent === "custom"
                  ? "appearance-choice active custom-color-choice"
                  : "appearance-choice custom-color-choice"
              }
              onClick={() => update("accent", "custom")}
              type="button"
            >
              <i
                className="accent-swatch custom"
                style={{ background: appearance.customColor }}
              />
              <span>自訂色</span>
            </button>
          </div>
          <div className="custom-color-controls">
            <label>
              調色盤
              <input
                aria-label="自訂主色調"
                onChange={(event) => updateCustomColor(event.target.value)}
                type="color"
                value={appearance.customColor}
              />
            </label>
            <label>
              HEX
              <input
                aria-label="HEX 色碼"
                onChange={(event) => {
                  if (/^#[0-9a-f]{6}$/i.test(event.target.value))
                    updateCustomColor(event.target.value);
                }}
                pattern="#[0-9A-Fa-f]{6}"
                value={appearance.customColor}
              />
            </label>
            {["R", "G", "B"].map((label, index) => (
              <label key={label}>
                {label}
                <input
                  aria-label={`${label} 色彩數值`}
                  inputMode="numeric"
                  max="255"
                  min="0"
                  onChange={(event) => updateRgb(index, event.target.value)}
                  type="number"
                  value={rgb[index]}
                />
              </label>
            ))}
          </div>
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">TYPOGRAPHY</p>
          <h2>文字與字體</h2>
        </div>
        <div>
          <div className="appearance-options">
            {options.font.map(([value, label]) => (
              <button
                aria-pressed={appearance.fontFamily === value}
                className={
                  appearance.fontFamily === value
                    ? "appearance-choice active"
                    : "appearance-choice"
                }
                key={value}
                onClick={() => update("fontFamily", value as FontFamily)}
                type="button"
              >
                <i className={`font-swatch ${value}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="custom-color-controls">
            <label>
              文字顏色
              <input
                aria-label="文字顏色"
                onChange={(event) => update("textColor", event.target.value)}
                type="color"
                value={appearance.textColor ?? "#152743"}
              />
            </label>
            <button
              className="secondary-button compact"
              onClick={() => update("textColor", undefined)}
              type="button"
            >
              跟隨明暗模式
            </button>
          </div>
          <label className="font-scale-control">
            字體大小
            <input
              aria-label="字體大小"
              max="120"
              min="85"
              onChange={(event) =>
                update("fontScale", Number(event.target.value))
              }
              type="range"
              value={appearance.fontScale}
            />
            <output>{appearance.fontScale}%</output>
          </label>
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">BACKGROUND</p>
          <h2>工作區背景</h2>
          <p className="hint">
            目前設定只套用於此裝置版面，不會影響另一種版面。
          </p>
        </div>
        <div>
          <div className="appearance-options background-options">
            {options.background.map(([value, label]) => (
              <button
                aria-pressed={appearance.background === value}
                className={
                  appearance.background === value
                    ? "appearance-choice active"
                    : "appearance-choice"
                }
                key={value}
                onClick={() => update("background", value as Background)}
                type="button"
              >
                <i className={`background-swatch ${value}`} />
                <span>{label}</span>
              </button>
            ))}
            <label className="appearance-choice background-color-choice">
              <i
                className="background-swatch color"
                style={{ background: appearance.canvasColor }}
              />
              <span>顏色</span>
              <input
                aria-label="預設背景顏色"
                onChange={(event) => update("canvasColor", event.target.value)}
                type="color"
                value={appearance.canvasColor}
              />
            </label>
          </div>
          {imageMode && (
            <div className="background-image-controls">
              <label>
                上傳圖片（最多 10 張）
                <input
                  accept={BACKGROUND_IMAGE_ACCEPT}
                  multiple
                  onChange={(event) =>
                    void chooseBackgrounds(event.target.files)
                  }
                  type="file"
                />
              </label>
              {appearance.backgroundImages.length > 0 && (
                <>
                  <div
                    aria-label="背景圖片清單"
                    className="background-playlist"
                  >
                    {appearance.backgroundImages.map((image, index) => (
                      <div
                        className={
                          appearance.backgroundActiveIndex === index
                            ? "background-thumbnail active"
                            : "background-thumbnail"
                        }
                        key={`${image.slice(-24)}-${index}`}
                      >
                        <button
                          aria-label={`選擇第 ${index + 1} 張背景`}
                          onClick={() => selectImage(index)}
                          style={{
                            backgroundImage: `url("${getBackgroundImageUrl(image) ?? ""}")`,
                          }}
                          type="button"
                        />
                        <button
                          aria-label={`移除第 ${index + 1} 張背景`}
                          className="background-image-remove"
                          onClick={() => removeImage(index)}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <label>
                    切換方式
                    <select
                      aria-label="背景切換方式"
                      onChange={(event) =>
                        update(
                          "backgroundRotation",
                          event.target.value as BackgroundRotation,
                        )
                      }
                      value={appearance.backgroundRotation}
                    >
                      <option value="manual">手動選擇</option>
                      <option value="login">每次登入／重新開啟時</option>
                      <option value="interval">依時間自動切換</option>
                    </select>
                  </label>
                  {appearance.backgroundRotation === "interval" && (
                    <label>
                      切換間隔（分鐘）
                      <input
                        aria-label="背景切換間隔"
                        inputMode="numeric"
                        max="1440"
                        min="1"
                        onChange={(event) =>
                          update(
                            "backgroundRotationMinutes",
                            Number(event.target.value),
                          )
                        }
                        type="number"
                        value={appearance.backgroundRotationMinutes}
                      />
                    </label>
                  )}
                  <div className="background-preview-wrap">
                    <strong>工作區預覽</strong>
                    <div
                      aria-label="背景預覽"
                      className="background-preview"
                      style={{
                        backgroundImage: `url("${previewImage}")`,
                        backgroundPosition: `${appearance.backgroundPositionX}% ${appearance.backgroundPositionY}%`,
                        backgroundSize: `${appearance.backgroundZoom}%`,
                        filter: `brightness(${appearance.backgroundBrightness}%) blur(${appearance.backgroundBlur}px)`,
                      }}
                    >
                      <span>預覽中的工作區</span>
                    </div>
                  </div>
                  <div className="crop-controls">
                    <strong>自由裁切與顯示</strong>
                    <p>
                      調整會立即套用到實際工作區；圖片會以較高解析度保留，過度放大仍可能降低畫質。
                    </p>
                    <label>
                      水平焦點{" "}
                      <input
                        aria-label="裁切水平焦點"
                        max="100"
                        min="0"
                        onChange={(event) =>
                          update(
                            "backgroundPositionX",
                            Number(event.target.value),
                          )
                        }
                        type="range"
                        value={appearance.backgroundPositionX}
                      />
                    </label>
                    <label>
                      垂直焦點{" "}
                      <input
                        aria-label="裁切垂直焦點"
                        max="100"
                        min="0"
                        onChange={(event) =>
                          update(
                            "backgroundPositionY",
                            Number(event.target.value),
                          )
                        }
                        type="range"
                        value={appearance.backgroundPositionY}
                      />
                    </label>
                    <label>
                      放大{" "}
                      <input
                        aria-label="裁切放大程度"
                        max="180"
                        min="100"
                        onChange={(event) =>
                          update("backgroundZoom", Number(event.target.value))
                        }
                        type="range"
                        value={appearance.backgroundZoom}
                      />
                      <output>{appearance.backgroundZoom}%</output>
                    </label>
                    <label>
                      亮度{" "}
                      <input
                        aria-label="背景亮度"
                        max="150"
                        min="60"
                        onChange={(event) =>
                          update(
                            "backgroundBrightness",
                            Number(event.target.value),
                          )
                        }
                        type="range"
                        value={appearance.backgroundBrightness}
                      />
                      <output>{appearance.backgroundBrightness}%</output>
                    </label>
                    <label>
                      模糊{" "}
                      <input
                        aria-label="背景模糊程度"
                        max="20"
                        min="0"
                        onChange={(event) =>
                          update("backgroundBlur", Number(event.target.value))
                        }
                        type="range"
                        value={appearance.backgroundBlur}
                      />
                      <output>{appearance.backgroundBlur}px</output>
                    </label>
                    <label>
                      外框透明度{" "}
                      <input
                        aria-label="外框透明度"
                        max="100"
                        min="0"
                        onChange={(event) =>
                          update("surfaceOpacity", Number(event.target.value))
                        }
                        type="range"
                        value={appearance.surfaceOpacity}
                      />
                      <output>{appearance.surfaceOpacity}%</output>
                    </label>
                    {focusPositions.map(([value, label, x, y]) => (
                      <button
                        className={
                          appearance.backgroundPosition === value
                            ? "active"
                            : ""
                        }
                        key={value}
                        onClick={() =>
                          commit({
                            ...appearance,
                            backgroundPosition: value,
                            backgroundPositionX: x,
                            backgroundPositionY: y,
                          })
                        }
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}{" "}
              {imageNotice && (
                <p className="background-image-notice">{imageNotice}</p>
              )}
            </div>
          )}
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">LAYOUT</p>
          <h2>資料密度</h2>
        </div>
        <div className="appearance-options">
          {options.density.map(([value, label]) => (
            <button
              aria-pressed={appearance.density === value}
              className={
                appearance.density === value
                  ? "appearance-choice active"
                  : "appearance-choice"
              }
              key={value}
              onClick={() => update("density", value as Density)}
              type="button"
            >
              <i className={`density-swatch ${value}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">BOOKMARK VIEW</p>
          <h2>網站收藏清單樣式</h2>
          <p>手機與電腦會套用相同的顯示偏好。</p>
        </div>
        <div>
          <div className="appearance-options">
            {options.bookmarkDisplay.map(([value, label]) => (
              <button
                aria-pressed={appearance.bookmarkDisplay === value}
                className={
                  appearance.bookmarkDisplay === value
                    ? "appearance-choice active"
                    : "appearance-choice"
                }
                key={value}
                onClick={() =>
                  update("bookmarkDisplay", value as BookmarkDisplay)
                }
                type="button"
              >
                <i className={`bookmark-display-swatch ${value}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {appearance.bookmarkDisplay === "grid" && (
            <label className="bookmark-grid-columns">
              每列格子數量{" "}
              <input
                aria-label="每列格子數量"
                max="4"
                min="1"
                onChange={(event) =>
                  update("bookmarkGridColumns", Number(event.target.value))
                }
                type="range"
                value={appearance.bookmarkGridColumns}
              />
              <output>{appearance.bookmarkGridColumns} 格</output>
            </label>
          )}
        </div>
      </section>
      <section className="appearance-section mobile-navigation-settings">
        <div>
          <p className="eyebrow">MOBILE NAVIGATION</p>
          <h2>手機底部導覽列</h2>
          <p>
            首頁、新增與更多永久固定；其他位置、顏色與透明度會同步至同帳號的手機版。
          </p>
        </div>
        <div className="mobile-navigation-settings-body">
          <div className="mobile-navigation-layout-options">
            {([2, 3, 4] as MobileNavigationSideCount[]).map((sideCount) => (
              <button
                aria-pressed={mobileNavigation.sideCount === sideCount}
                className={
                  mobileNavigation.sideCount === sideCount ? "active" : ""
                }
                key={sideCount}
                onClick={() => changeMobileNavigationCount(sideCount)}
                type="button"
              >
                <strong>左右各 {sideCount} 個</strong>
                <span>共 {sideCount * 2 + 1} 格</span>
              </button>
            ))}
          </div>
          <MobileNavigationPreview navigation={mobileNavigation} />
          <div className="mobile-navigation-slot-grid">
            {[
              ...mobileNavigationVisibleSlotKeys(mobileNavigation.sideCount)
                .left,
              ...mobileNavigationVisibleSlotKeys(mobileNavigation.sideCount)
                .right,
            ].map((key, index) => (
              <label key={key}>
                {index < mobileNavigation.sideCount - 1
                  ? `左側功能 ${index + 1}`
                  : `右側功能 ${index - (mobileNavigation.sideCount - 2)}`}
                <select
                  aria-label={`底部導覽${index < mobileNavigation.sideCount - 1 ? "左側" : "右側"}自訂功能`}
                  id={`mobile-navigation-${key}`}
                  onChange={(event) =>
                    changeMobileNavigationItem(
                      key,
                      event.target.value as MobileNavigationDestination,
                    )
                  }
                  value={mobileNavigation.slots[key]}
                >
                  {mobileNavigationDestinations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mobile-navigation-settings-hint">
            若選到其他位置已使用的功能，兩個位置會自動交換；縮減格數不會刪除被隱藏的位置。
          </p>
          <div className="mobile-navigation-visual-controls">
            <label>
              導覽列顏色
              <span>
                <input
                  aria-label="底部導覽列顏色"
                  onChange={(event) => {
                    setNavigationColorDraft(event.target.value.toUpperCase());
                    saveMobileNavigation({
                      ...mobileNavigation,
                      backgroundColor: event.target.value,
                    });
                  }}
                  type="color"
                  value={mobileNavigation.backgroundColor}
                />
                <input
                  aria-invalid={
                    !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(
                      navigationColorDraft.trim(),
                    )
                  }
                  aria-label="底部導覽列 HEX 色碼"
                  onBlur={() =>
                    setNavigationColorDraft(mobileNavigation.backgroundColor)
                  }
                  onChange={(event) =>
                    changeMobileNavigationColor(event.target.value)
                  }
                  placeholder="#101117"
                  spellCheck={false}
                  value={navigationColorDraft}
                />
              </span>
            </label>
            <label>
              導覽列透明度 <output>{mobileNavigation.opacity}%</output>
              <input
                aria-label="底部導覽列透明度"
                max="100"
                min="40"
                onChange={(event) =>
                  saveMobileNavigation({
                    ...mobileNavigation,
                    opacity: Number(event.target.value),
                  })
                }
                type="range"
                value={mobileNavigation.opacity}
              />
            </label>
          </div>
          <button
            className="secondary-button compact mobile-navigation-reset"
            onClick={resetMobileNavigation}
            type="button"
          >
            恢復導覽列預設
          </button>
        </div>
      </section>
      <section className="appearance-section">
        <div>
          <p className="eyebrow">SECONDARY TEXT</p>
          <h2>副標題／次要文字</h2>
          <p className="hint">
            套用於頁面描述、卡片說明與輔助文字，不影響按鈕、狀態、警告或連結。
          </p>
        </div>
        <div className="secondary-typography-controls">
          <div className="appearance-options">
            {options.font.map(([value, label]) => (
              <button
                aria-pressed={appearance.secondaryFontFamily === value}
                className={
                  appearance.secondaryFontFamily === value
                    ? "appearance-choice active"
                    : "appearance-choice"
                }
                key={value}
                onClick={() =>
                  update("secondaryFontFamily", value as FontFamily)
                }
                type="button"
              >
                <i className={`font-swatch ${value}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="custom-color-controls">
            <label>
              次要文字顏色
              <input
                aria-label="副標題與次要文字顏色"
                onChange={(event) =>
                  update("secondaryTextColor", event.target.value)
                }
                type="color"
                value={appearance.secondaryTextColor ?? "#60708A"}
              />
            </label>
            <button
              className="secondary-button compact"
              onClick={() => update("secondaryTextColor", undefined)}
              type="button"
            >
              跟隨明暗模式
            </button>
          </div>
          <label className="font-scale-control">
            字體大小
            <input
              aria-label="副標題與次要文字字體大小"
              max="120"
              min="80"
              onChange={(event) =>
                update("secondaryFontScale", Number(event.target.value))
              }
              type="range"
              value={appearance.secondaryFontScale}
            />
            <output>{appearance.secondaryFontScale}%</output>
          </label>
          <label>
            字重
            <select
              aria-label="副標題與次要文字字重"
              onChange={(event) =>
                update(
                  "secondaryFontWeight",
                  Number(event.target.value) as SecondaryFontWeight,
                )
              }
              value={appearance.secondaryFontWeight}
            >
              <option value="400">一般</option>
              <option value="500">中等</option>
              <option value="600">半粗</option>
              <option value="700">粗體</option>
            </select>
          </label>
          <p className="secondary-text appearance-secondary-preview">
            調整適合自己的顯示方式，變更會立即預覽並在背景同步。
          </p>
        </div>
      </section>
      <button
        className="secondary-button appearance-reset"
        onClick={reset}
        type="button"
      >
        還原預設外觀
      </button>
    </section>
  );
}
