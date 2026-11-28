// src/lib/theme.ts
//
// 画面のテーマ（ライト・ダーク・端末の設定に合わせる）。
// 選んだテーマは端末ごとに localStorage に保存する。
// <html> に .dark を付け外しする処理は、描画前に走らせるため meta.astro のインラインスクリプトにもある。

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "rct_theme";
const THEME_EVENT = "rct:theme-change";

export function getTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // 保存領域が使えない環境では端末の設定に従う
  }
  return "system";
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: Theme = getTheme()) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 保存できなくても、このページの表示だけは切り替える
  }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_EVENT));
}

export function onThemeChange(callback: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (getTheme() === "system") applyTheme("system");
    callback();
  };
  window.addEventListener(THEME_EVENT, callback);
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    media.removeEventListener("change", onMedia);
  };
}
