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

// (YYYY年MM月DD日)に変換する
export const formatDateString = (dateStr: string): string => {
  if (!dateStr) return "未登録";

  // 数字だけを抽出する (例: "2024-03-25 10:30:00" -> ["2024", "03", "25", "10", "30", "00"])
  const nums = dateStr.match(/\d+/g);

  // 年・月・日の3つ以上数字があれば整形する
  if (!nums || nums.length < 3) return dateStr;

  const y = nums[0];
  const m = nums[1].padStart(2, "0"); // 1桁の場合に備えて0埋め
  const d = nums[2].padStart(2, "0");

  return `${y}年${m}月${d}日`;
};

// (YYYY年MM月DD日（曜）)に変換する
export const formatDateTimeWithDay = (dateStr: string): string => {
  if (!dateStr) return "未登録";

  // 数字だけを抽出 (2024/03/25 でも 2024-03-25 10:00:00 でも対応)
  const nums = dateStr.match(/\d+/g);
  if (!nums || nums.length < 3) return dateStr;

  const y = parseInt(nums[0]);
  const m = parseInt(nums[1]);
  const d = parseInt(nums[2]);

  // Dateオブジェクトを作成（月は0から始まるので -1 する）
  const dateObj = new Date(y, m - 1, d);

  // 曜日配列
  const dayOfWeeks = ["日", "月", "火", "水", "木", "金", "土"];
  const dayName = dayOfWeeks[dateObj.getDay()];

  // 0埋め整形
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");

  return `${y}年${mm}月${dd}日（${dayName}）`;
};

/**
 * 日付（YYYY / MM / DD）の形式・妥当性・未来日チェックをまとめて行う
 * エラーがある場合はエラーメッセージ、正常な場合は null を返す
 */
export const validateDateString = (
  dateStr: string,
  label: string,
  allowFuture: boolean = false,
): string | null => {
  const datePattern = /^\d{4} \/ \d{2} \/ \d{2}$/;

  // 1. 形式チェック
  if (!datePattern.test(dateStr)) {
    return `${label}は YYYY / MM / DD 形式で入力してください`;
  }

  // 2. 実在チェック
  const cleanDateStr = dateStr.replace(/\s+/g, "");
  const [y, m, d] = cleanDateStr.split("/").map(Number);
  const dateObj = new Date(y, m - 1, d);

  if (
    dateObj.getFullYear() !== y ||
    dateObj.getMonth() !== m - 1 ||
    dateObj.getDate() !== d
  ) {
    return `${label}がおかしいです`;
  }

  // 3. 未来日チェック
  if (!allowFuture) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj > today) {
      return `${label}に未来の日付は入力できません`;
    }
  }

  return null;
};
