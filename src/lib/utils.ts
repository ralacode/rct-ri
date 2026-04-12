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
      errorMessage: "数字のみ入力してください",
    };
  }

  if (normalized.length > 10) {
    return {
      isValid: false,
      normalizedId: normalized,
      errorMessage: "10桁以内で入力してください",
    };
  }

  return { isValid: true, normalizedId: normalized, errorMessage: "" };
};
