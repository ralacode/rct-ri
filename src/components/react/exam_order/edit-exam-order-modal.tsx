// src/components/react/exam_order/edit-exam-order-modal.tsx

import React, { useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExamOrder } from "@/types/exam_order";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MyButton } from "../my-button";
import { MyInput } from "../my-input";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface ExamOrderProps {
  id: number;
  dosage_mbq: ExamOrder["dosage_mbq"];
  dosage_ml: ExamOrder["dosage_ml"];
  remain_mbq: ExamOrder["remain_mbq"];
  remain_ml: ExamOrder["remain_ml"];
  injection_time: ExamOrder["injection_time"];
}

interface EditExamOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  order: ExamOrderProps | null;
}

export const EditExamOrderModal: React.FC<EditExamOrderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  order,
  // onButtonClick,
}) => {
  const [dosageMbq, setDosageMbq] = useState<string>("");
  const [dosageMl, setDosageMl] = useState<string>("");
  const [remainMbq, setRemainMbq] = useState<string>("");
  const [remainMl, setRemainMl] = useState<string>("");
  const [injectionTime, setInjectionTime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const baseId = useId();

  // モーダルが開いた時、または対象のオーダーが変わった時に初期値をセット
  useEffect(() => {
    if (order) {
      setDosageMbq(
        order.dosage_mbq !== null ? order.dosage_mbq.toString() : "",
      );
      setDosageMl(order.dosage_ml !== null ? order.dosage_ml.toString() : "");
      setRemainMbq(
        order.remain_mbq !== null ? order.remain_mbq.toString() : "",
      );
      setRemainMl(order.remain_ml !== null ? order.remain_ml.toString() : "");
      setInjectionTime(
        order.injection_time ? order.injection_time.toString() : "",
      );
      setError(null);
    }
  }, [order, isOpen]);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!order) return;

    setIsSubmitting(true);
    setError(null);

    // 空文字の場合は None (null) として扱うため、数値に変換するか null にするか判定
    const parseValue = (val: string): number | null => {
      const trimmed = val.trim();
      if (trimmed === "") return null;
      const parsed = parseFloat(trimmed);
      return isNaN(parsed) ? null : parsed;
    };

    try {
      await invoke("edit_exam_order_fields", {
        id: order.id,
        dosageMbq: parseValue(dosageMbq),
        dosageMl: parseValue(dosageMl),
        remainMbq: parseValue(remainMbq),
        remainMl: parseValue(remainMl),
        injectionTime: injectionTime,
      });

      onSuccess(); // 親コンポーネント側で再取得などを走らせるコールバック
      onClose(); // モーダルを閉じる
    } catch (err) {
      console.error(err);
      setError(err as string);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm duration-0 animate-none">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-(--text)">投与量を入力</DialogTitle>
          </DialogHeader>
          <div>
            {error && <div className="text-red-700">{error}</div>}

            <div className={cn("grid gap-2 content-start")}>
              <MyInput
                label="投与時刻"
                type="time"
                id={`time-picker-optional-${baseId}`}
                // step="1" を削除（または step="60" に変更）することで、秒数を非表示にします。
                defaultValue={injectionTime}
                onChange={(e) => setInjectionTime(e.target.value)}
                inputClassName={cn(
                  "text-xl w-auto appearance-none bg-background tracking-[0.2rem]",
                  "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
                  "cursor-pointer",
                )}
              />
              <MyInput
                id={`dosage_mbq_${baseId}`}
                label="投与量（MBq）"
                value={dosageMbq}
                onChange={(e) => setDosageMbq(e.target.value)}
                placeholder="例：740"
              />
              <MyInput
                id={`dosage_ml_${baseId}`}
                label="投与量（mL）"
                value={dosageMl}
                onChange={(e) => setDosageMl(e.target.value)}
                placeholder="例：1.5"
              />
              <MyInput
                id={`remain_mbq_${baseId}`}
                label="残量（MBq）"
                value={remainMbq}
                onChange={(e) => setRemainMbq(e.target.value)}
                placeholder="例：0.5"
              />
              <MyInput
                id={`remain_ml_${baseId}`}
                label="残量（mL）"
                value={remainMl}
                onChange={(e) => setRemainMl(e.target.value)}
                placeholder="例：0"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose>
              <MyButton type="button" disabled={isSubmitting}>
                キャンセル
              </MyButton>
            </DialogClose>
            <MyButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中..." : "保存する"}
            </MyButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
