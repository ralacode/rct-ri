// src/lib/utils.ts
import type { ValidationResult } from "@/types/patient";
import { siteMeta } from "@lib/constants";
import { invoke } from "@tauri-apps/api/core";

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

// (YYYY年MM月DD日（曜）)に変換する（時間もあれば含む）
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

  let result = `${y}年${mm}月${dd}日（${dayName}）`;

  // もし時間（時・分）が含まれていれば追加する
  if (nums.length >= 5) {
    const hh = nums[3].padStart(2, "0");
    const min = nums[4].padStart(2, "0");
    result += ` ${hh}:${min}`;
  }

  return result;
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

// 予約時間枠
export const examTimeSlots = [
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
];

export const DEPARTMENTS = [
  "乳腺内分泌外科",
  "呼吸器科",
  "ひ尿器科",
  "婦人科",
  "血液・腫瘍内科",
  "耳鼻咽喉科",
  "消化器科",
  "消化器外科",
  "脳神経外科",
  "整形外科",
  "皮膚科",
  "腎臓科",
  "感染症科",
  "脳神経内科",
  "循環器科",
  "小児循環器科",
  "小児科",
  "新生児科",
  "外科",
  "呼吸器外科",
  "小児外科",
  "リウマチ科",
  "心臓血管外科",
  "小児心臓外科",
  "産科",
  "産婦人科",
  "眼科",
  "その他",
];

export const PHYSICIAN = [
  "澤田 孝峰",
  "竹下 卓志",
  "和田 邦泰",
  "里地 葉",
  "その他",
];

export const EXAM_ITEMS = [
  "脳DATシンチ",
  "骨シンチ",
  "センチネルリンパ節シンチ",
  "心筋シンチ I123-MIBG",
  "心筋シンチ Tl 運動負荷",
  "心筋シンチ Tl 薬物負荷",
  "腎レノグラム ラシックス負荷",
  "腎形態シンチ DMSA",
  "脳血流シンチIMP 負荷無採血無",
  "ガリウムシンチ",
  "甲状腺シンチ",
  "肺血流シンチ",
  "腎シンチ",
];

export const NEEDS_PROCEDURE_ITEMS = [
  "センチネルリンパ節シンチ",
  "骨シンチ",
  "腎レノグラム ラシックス負荷",
  "甲状腺シンチ",
];

// 本日の日付を取得する関数
export const getTodayLocalString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// 本日の日時を取得
export const getCurrentDateTimeLocalString = (): string => {
  const now = new Date();
  const date = getTodayLocalString(); // 上記関数を再利用
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${date} ${hours}:${minutes}:${seconds}`;
};

/**
 * 検査オーダーを削除する共通関数
 * @param orderId 削除対象のID
 * @param onSuccess 削除成功時に実行したい処理（再取得など）
 * @param onStart 削除開始時に実行したい処理（LoadingフラグONなど）
 * @param onFinish 削除終了時に実行したい処理（LoadingフラグOFFなど）
 */
export async function deleteOrder(
  orderId: number,
  onSuccess: () => Promise<void> | void,
  onStart?: () => void,
  onFinish?: () => void,
) {
  if (onStart) onStart();
  try {
    await invoke("delete_exam_order_cmd", { id: orderId });
    await onSuccess(); // ここで fetchData や fetchOrders が呼ばれる
  } catch (e) {
    console.error("削除エラー:", e);
    alert("削除に失敗しました。");
  } finally {
    if (onFinish) onFinish();
  }
}
