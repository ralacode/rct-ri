// src/components/react/exam_order/daily-list/injection-record-dialog.tsx
//
// 検査一覧の投与記録（投与時刻・投与量・残量）入力ダイアログ。

import { useEffect, useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { invoke } from "@/lib/api";
import { errorMessage } from "@/lib/utils";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  EMPTY_INJECTION,
  InjectionFields,
  toInjectionPayload,
  toInjectionValues,
  validateInjection,
  type InjectionValues,
} from "@components/react/exam_order/injection-fields";
import { PediatricDoseNote } from "@components/react/exam_order/pediatric-dose-note";

interface Props {
  /** 入力する検査オーダー。null のときは閉じている */
  order: ExamOrderWithPatient | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function InjectionRecordDialog({ order, onOpenChange, onSaved }: Props) {
  const id = useId();
  const [values, setValues] = useState<InjectionValues>(EMPTY_INJECTION);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 開くたびに、そのオーダーの値で初期化する
  useEffect(() => {
    if (!order) return;
    setValues(toInjectionValues(order));
    setShowErrors(false);
    setSubmitError(null);
  }, [order]);

  const errors = validateInjection(values);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await invoke("edit_exam_order_fields", {
        id: order.id,
        ...toInjectionPayload(values),
      });
      toast.success("投与記録を保存しました", {
        description: `${order.exam_time} ${order.exam_item}（${order.last_name_kanji} ${order.first_name_kanji} 様）`,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setSubmitError(errorMessage(err, "保存に失敗しました。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>投与記録</DialogTitle>
            {order && (
              <DialogDescription>
                {order.exam_time}　{order.exam_item}
                <br />
                {order.last_name_kanji} {order.first_name_kanji} 様（ID{" "}
                {order.patient_id}）
              </DialogDescription>
            )}
          </DialogHeader>

          {order && (
            <PediatricDoseNote
              examItem={order.exam_item}
              weight={order.weight}
            />
          )}

          <InjectionFields
            id={id}
            values={values}
            onChange={setValues}
            errors={showErrors ? errors : {}}
          />

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                キャンセル
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中…" : "保存する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
