// src/lib/utils.ts
import type { ValidationResult } from "@/types/patient";
import { siteMeta } from "@lib/constants";

/**
 * ページタイトルを整形する (例: ページ名 | サイト名)
 */
export const getPageTitle = (pageTitle?: string) => {
  return pageTitle ? pageTitle : siteMeta.siteTitle;
};

export const validatePatientId = (rawId: string): ValidationResult => {
  const normalized = rawId
    .trim()
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

  if (normalized === "") {
    return {
      isValid: false,
      normalizedId: normalized,
      errorMessage: "患者IDを入力してください",
    };
  }

  if (!/^\d+$/.test(normalized)) {
    return {
      isValid: false,
      normalizedId: normalized,
      errorMessage: "患者IDは数字のみ入力してください",
    };
  }

  if (normalized.length > 10) {
    return {
      isValid: false,
      normalizedId: normalized,
      errorMessage: "患者IDは10桁以内で入力してください",
    };
  }

  return { isValid: true, normalizedId: normalized, errorMessage: "" };
};

export const validateHiragana = (
  text: string,
): { isValid: boolean; errorMessage: string } => {
  if (text === "") {
    return { isValid: true, errorMessage: "" };
  }

  // 正規表現からスペースを削除: ぁ-ん(ひらがな) と ー(長音) のみ
  const hiraganaRegex = /^[ぁ-んー]+$/;

  if (!hiraganaRegex.test(text)) {
    // スペースが含まれているか、それ以外の文字が含まれている場合
    const hasSpace = /[\s　]/.test(text);
    return {
      isValid: false,
      errorMessage: hasSpace
        ? "スペースを含めずに入力してください"
        : "ひらがなで入力してください",
    };
  }

  return { isValid: true, errorMessage: "" };
};

export const validateKanjiName = (
  text: string,
): { isValid: boolean; errorMessage: string } => {
  if (text === "") {
    return { isValid: true, errorMessage: "" };
  }

  // スペース（半角・全角）が含まれているかチェック
  const hasSpace = /[\s　]/.test(text);

  if (hasSpace) {
    return {
      isValid: false,
      errorMessage: "スペースを含めずに入力してください",
    };
  }

  // 必要に応じて記号（!@#$%等）を弾くロジックを追加可能ですが、
  // 現時点では「スペースなし」を保証する最小構成にしています。
  return { isValid: true, errorMessage: "" };
};
