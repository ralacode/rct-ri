// src/lib/pediatric-dose.ts
//
// 体重あたりの 99mTc 推奨投与量の計算
// 出典：日本核医学会「小児核医学検査適正施行のコンセンサスガイドライン 2020」第１部
//       （docs/小児核医学検査適正施行のコンセンサスガイドライン2020.pdf の 9〜10 ページ）
//
// 【算出法】投与量〔MBq〕＝ 別表１の基本量 × 別表２の当該クラスの体重別係数
//   ただし、計算により最小量以下となった場合は最小量を投与する。
//
// ガイドラインが改訂されたときは、下の定数（基本量・最小量・係数）を書き換える。

export const PEDIATRIC_DOSE_SOURCE = "JSNM 2020";

export type PediatricDoseDrug = "DMSA" | "DTPA";

interface DrugDoseSpec {
  /** 別表１のクラス */
  doseClass: "A";
  /** 別表１の基本量（MBq） */
  baseMbq: number;
  /** 別表１の最小量（MBq） */
  minMbq: number;
}

// 【別表１】放射性医薬品のクラス分類と基本量・最小量（当院で扱う 2 剤のみ）
// ※ DMSA は 2020 年の再改訂で基本量 25.6 → 20.0、最小量 15 → 20 に変更されている
const DRUG_DOSE_SPECS: Record<PediatricDoseDrug, DrugDoseSpec> = {
  DMSA: { doseClass: "A", baseMbq: 20.0, minMbq: 20 },
  DTPA: { doseClass: "A", baseMbq: 34.0, minMbq: 20 },
};

interface WeightCoefficientRow {
  /** 表の体重の表記（例: "10", "52-54"） */
  label: string;
  /** その行が適用される下限の体重（kg） */
  minWeightKg: number;
  /** クラス A の体重別係数 */
  classA: number;
}

// 【別表２】各クラスの体重別係数（クラス A のみ）
const WEIGHT_COEFFICIENTS: WeightCoefficientRow[] = [
  { label: "3", minWeightKg: 3, classA: 1.0 },
  { label: "4", minWeightKg: 4, classA: 1.12 },
  { label: "6", minWeightKg: 6, classA: 1.47 },
  { label: "8", minWeightKg: 8, classA: 1.71 },
  { label: "10", minWeightKg: 10, classA: 1.94 },
  { label: "12", minWeightKg: 12, classA: 2.18 },
  { label: "14", minWeightKg: 14, classA: 2.35 },
  { label: "16", minWeightKg: 16, classA: 2.53 },
  { label: "18", minWeightKg: 18, classA: 2.71 },
  { label: "20", minWeightKg: 20, classA: 2.88 },
  { label: "22", minWeightKg: 22, classA: 3.06 },
  { label: "24", minWeightKg: 24, classA: 3.18 },
  { label: "26", minWeightKg: 26, classA: 3.35 },
  { label: "28", minWeightKg: 28, classA: 3.47 },
  { label: "30", minWeightKg: 30, classA: 3.65 },
  { label: "32", minWeightKg: 32, classA: 3.77 },
  { label: "34", minWeightKg: 34, classA: 3.88 },
  { label: "36", minWeightKg: 36, classA: 4.0 },
  { label: "38", minWeightKg: 38, classA: 4.18 },
  { label: "40", minWeightKg: 40, classA: 4.29 },
  { label: "42", minWeightKg: 42, classA: 4.41 },
  { label: "44", minWeightKg: 44, classA: 4.53 },
  { label: "46", minWeightKg: 46, classA: 4.65 },
  { label: "48", minWeightKg: 48, classA: 4.77 },
  { label: "50", minWeightKg: 50, classA: 4.88 },
  { label: "52-54", minWeightKg: 52, classA: 5.0 },
  { label: "56-58", minWeightKg: 56, classA: 5.24 },
  { label: "60-62", minWeightKg: 60, classA: 5.47 },
  { label: "64-66", minWeightKg: 64, classA: 5.65 },
  { label: "68", minWeightKg: 68, classA: 5.77 },
];

const TABLE_MIN_WEIGHT_KG = WEIGHT_COEFFICIENTS[0].minWeightKg;
const TABLE_MAX_WEIGHT_KG =
  WEIGHT_COEFFICIENTS[WEIGHT_COEFFICIENTS.length - 1].minWeightKg;

// 検査名に薬剤名が含まれないが、その薬剤を使う当院のオーダー名
const EXAM_ITEM_DRUG_ALIASES: Record<string, PediatricDoseDrug> = {
  "腎レノグラム ラシックス負荷": "DTPA",
};

/** 検査名から対象薬剤（DMSA / DTPA）を判定する。対象外なら null。 */
export function detectPediatricDoseDrug(
  examItem: string | null | undefined,
): PediatricDoseDrug | null {
  if (!examItem) return null;
  const normalized = examItem.trim();
  const alias = EXAM_ITEM_DRUG_ALIASES[normalized];
  if (alias) return alias;

  const upper = normalized.toUpperCase();
  if (upper.includes("DMSA")) return "DMSA";
  if (upper.includes("DTPA")) return "DTPA";
  return null;
}

/**
 * 体重に対応する係数表の行を返す。
 * 表にない体重は「体重以下で最も近い行」を使う。
 * 3 kg 未満は 3 kg の行、68 kg 超は 68 kg の行で頭打ちにする。
 */
function findCoefficientRow(weightKg: number): WeightCoefficientRow {
  let row = WEIGHT_COEFFICIENTS[0];
  for (const candidate of WEIGHT_COEFFICIENTS) {
    if (candidate.minWeightKg <= weightKg) row = candidate;
    else break;
  }
  return row;
}

export interface PediatricDoseResult {
  drug: PediatricDoseDrug;
  doseClass: "A";
  weightKg: number;
  /** 適用した係数表の行（例: "10", "52-54"） */
  tableWeightLabel: string;
  coefficient: number;
  baseMbq: number;
  minMbq: number;
  /** 基本量 × 係数（小数第 1 位で四捨五入） */
  calculatedMbq: number;
  /** 最小量を下限として適用した推奨量 */
  recommendedMbq: number;
  /** 最小量が適用されたか */
  minApplied: boolean;
  /** 体重が係数表の範囲外か */
  belowTable: boolean;
  aboveTable: boolean;
}

const roundTo1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * 推奨投与量を計算する。
 * 対象外の検査、または体重が未登録（null / 0 以下 / 数値でない）の場合は null。
 */
export function calcPediatricTc99mDose(
  drug: PediatricDoseDrug,
  weightKg: number | null | undefined,
): PediatricDoseResult | null {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  const spec = DRUG_DOSE_SPECS[drug];
  const row = findCoefficientRow(weightKg);
  const coefficient = row.classA;
  const calculatedMbq = roundTo1(spec.baseMbq * coefficient);
  const minApplied = calculatedMbq < spec.minMbq;

  return {
    drug,
    doseClass: spec.doseClass,
    weightKg,
    tableWeightLabel: row.label,
    coefficient,
    baseMbq: spec.baseMbq,
    minMbq: spec.minMbq,
    calculatedMbq,
    recommendedMbq: minApplied ? spec.minMbq : calculatedMbq,
    minApplied,
    belowTable: weightKg < TABLE_MIN_WEIGHT_KG,
    aboveTable: weightKg > TABLE_MAX_WEIGHT_KG,
  };
}
