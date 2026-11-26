// src/components/react/exam_order/daily-list/order-status.ts

import type { ExamOrderWithPatient } from "@/types/exam_order";

/**
 * 投与記録の入力状況。
 * - done: 投与時刻が入っている
 * - partial: 投与量などの一部だけ入っている
 * - pending: まだ何も入っていない
 */
export type InjectionStatus = "done" | "partial" | "pending";

export function getInjectionStatus(
  order: Pick<
    ExamOrderWithPatient,
    "dosage_mbq" | "dosage_ml" | "remain_mbq" | "remain_ml" | "injection_time"
  >,
): InjectionStatus {
  if (order.injection_time) return "done";
  if (
    order.dosage_mbq !== null ||
    order.dosage_ml !== null ||
    order.remain_mbq !== null ||
    order.remain_ml !== null
  ) {
    return "partial";
  }
  return "pending";
}

export const INJECTION_STATUS_LABEL: Record<InjectionStatus, string> = {
  done: "投与済み",
  partial: "入力途中",
  pending: "未投与",
};
