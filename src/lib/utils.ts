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

export const toKatakana = (str: string) => {
  return str.replace(/[\u3041-\u3096]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) + 0x60);
  });
};

export const calculateAge = (birthDateStr: string): number | null => {
  if (!birthDateStr) return null;

  const birthDate = new Date(birthDateStr.replace(/\s+/g, ""));
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

/**
 * 生年月日(YYYY/MM/DD)を表示用(YYYY年MM月DD日)に変換する
 */
export const formatBirthDate = (birthDateStr: string): string => {
  if (!birthDateStr) return "未登録";
  const date = birthDateStr.replace(/\s+/g, ""); // スペース除去
  const parts = date.split("/");
  if (parts.length !== 3) return birthDateStr;

  return `${parts[0]}年${parts[1]}月${parts[2]}日`;
};
