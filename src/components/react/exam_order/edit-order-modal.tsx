import React, { useEffect, useId, useState } from "react";
import { invoke } from "@/lib/api";
import type { ExamOrder } from "@/types/exam_order";
import {
  cn,
  DEPARTMENTS,
  EXAM_ITEMS,
  normalizeToDbDateFormat,
  normalizeToDisplayDateFormat,
} from "@/lib/utils";
import { PHYSICIAN } from "@/lib/secret-utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MyButton } from "../my-button";
import { MyInput } from "../my-input";
import { DatalistInput } from "../datalist-input";
import { DatePickerTime } from "../date-picker-time";

interface EditOrderModalProps {
  order: ExamOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

function numberToInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = parseFloat(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  order,
  onClose,
  onSuccess,
}) => {
  const baseId = useId();
  const [examDate, setExamDate] = useState("");
  const [examTime, setExamTime] = useState("10:30");
  const [examItem, setExamItem] = useState("");
  const [dept, setDept] = useState("");
  const [physician, setPhysician] = useState("");
  const [injectionTime, setInjectionTime] = useState("");
  const [dosageMbq, setDosageMbq] = useState("");
  const [dosageMl, setDosageMl] = useState("");
  const [remainMbq, setRemainMbq] = useState("");
  const [remainMl, setRemainMl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!order) return;
    setExamDate(normalizeToDisplayDateFormat(order.exam_date) || order.exam_date);
    setExamTime(order.exam_time || "10:30");
    setExamItem(order.exam_item ?? "");
    setDept(order.requesting_department ?? "");
    setPhysician(order.requesting_physician ?? "");
    setInjectionTime(order.injection_time ?? "");
    setDosageMbq(numberToInput(order.dosage_mbq));
    setDosageMl(numberToInput(order.dosage_ml));
    setRemainMbq(numberToInput(order.remain_mbq));
    setRemainMl(numberToInput(order.remain_ml));
    setError(null);
    setIsSubmitting(false);
  }, [order]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    if (!examDate || !examTime || !examItem || !dept || !physician) {
      setError("検査日、予約時間、検査項目、依頼科、依頼医を入力してください。");
      return;
    }

    const dbExamDate = normalizeToDbDateFormat(examDate);
    if (!dbExamDate) {
      setError("検査日の日付が正しくありません。");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await invoke("edit_exam_order", {
        id: order.id,
        examDate: dbExamDate,
        examTime,
        examItem,
        requestingDepartment: dept,
        requestingPhysician: physician,
        dosageMbq: parseOptionalNumber(dosageMbq),
        dosageMl: parseOptionalNumber(dosageMl),
        remainMbq: parseOptionalNumber(remainMbq),
        remainMl: parseOptionalNumber(remainMl),
        injectionTime: injectionTime.trim() === "" ? null : injectionTime,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : "検査オーダーの更新に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={order != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "font-(family-name:--font-family)! text-(--text)!",
          "duration-0 animate-none max-h-[90vh] overflow-y-auto",
        )}
      >
        <form method="post" data-astro-reload onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>検査オーダーを編集</DialogTitle>
          </DialogHeader>
          <DialogDescription className="sr-only">
            登録済みの検査オーダーを編集するためのフォームです
          </DialogDescription>

          {error && <div className="text-red-700">{error}</div>}

          <div className={cn("grid gap-4")}>
            <DatePickerTime
              valueString={examDate}
              timeString={examTime}
              onChange={setExamDate}
              onChangeTime={(e) => setExamTime(e.target.value)}
              dateText="検査日"
              timeText="予約時間"
            />
            <DatalistInput
              id={`edit_order_department_${baseId}`}
              label="依頼科"
              list={`edit_order_department_list_${baseId}`}
              placeholder="依頼科を入力..."
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              options={DEPARTMENTS}
              inputClassName={cn("h-10 cursor-pointer")}
            />
            <DatalistInput
              id={`edit_order_physician_${baseId}`}
              label="依頼医"
              list={`edit_order_physician_list_${baseId}`}
              placeholder="依頼医を入力..."
              value={physician}
              onChange={(e) => setPhysician(e.target.value)}
              options={PHYSICIAN}
              inputClassName={cn("h-10 cursor-pointer")}
            />
            <DatalistInput
              id={`edit_order_item_${baseId}`}
              label="検査項目"
              list={`edit_order_item_list_${baseId}`}
              placeholder="検査項目を入力..."
              value={examItem}
              onChange={(e) => setExamItem(e.target.value)}
              options={EXAM_ITEMS}
              inputClassName={cn("h-10 cursor-pointer")}
            />
            <MyInput
              label="投与時刻"
              type="time"
              id={`edit_order_injection_time_${baseId}`}
              value={injectionTime}
              onChange={(e) => setInjectionTime(e.target.value)}
              inputClassName={cn(
                "text-xl w-auto appearance-none bg-background tracking-[0.2rem]",
                "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
                "cursor-pointer",
              )}
            />
            <MyInput
              id={`edit_order_dosage_mbq_${baseId}`}
              label="投与量（MBq）"
              value={dosageMbq}
              onChange={(e) => setDosageMbq(e.target.value)}
              placeholder="例：740"
            />
            <MyInput
              id={`edit_order_dosage_ml_${baseId}`}
              label="投与量（mL）"
              value={dosageMl}
              onChange={(e) => setDosageMl(e.target.value)}
              placeholder="例：1.5"
            />
            <MyInput
              id={`edit_order_remain_mbq_${baseId}`}
              label="残量（MBq）"
              value={remainMbq}
              onChange={(e) => setRemainMbq(e.target.value)}
              placeholder="例：0.5"
            />
            <MyInput
              id={`edit_order_remain_ml_${baseId}`}
              label="残量（mL）"
              value={remainMl}
              onChange={(e) => setRemainMl(e.target.value)}
              placeholder="例：0"
            />
          </div>

          <DialogFooter className={cn("grid")}>
            <MyButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存する"}
            </MyButton>
            <DialogClose asChild>
              <MyButton type="button" className={cn("bg-red-500")} disabled={isSubmitting}>
                キャンセル
              </MyButton>
            </DialogClose>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
