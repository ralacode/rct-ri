// src/components/react/exam_order/delete-order-dialog.tsx
//
// 検査オーダーの削除確認。検査一覧と患者詳細で使う。

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { invoke } from "@/lib/api";
import { formatDateTimeWithDay } from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";

type DeletableOrder = Pick<
  ExamOrder,
  "id" | "exam_date" | "exam_time" | "exam_item"
>;

/** 確認文やお知らせに出す「日付 時刻 検査名（患者名 様）」 */
function describeOrder(order: DeletableOrder, patientName?: string) {
  const name = patientName ? `（${patientName} 様）` : "";
  return `${formatDateTimeWithDay(order.exam_date)} ${order.exam_time} ${order.exam_item}${name}`;
}

interface Props {
  /** 削除する検査オーダー。null のときは閉じている */
  order: DeletableOrder | null;
  /** 確認文に添える患者名（患者詳細では省く） */
  patientName?: string;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteOrderDialog({
  order,
  patientName,
  onOpenChange,
  onDeleted,
}: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // 削除が終わるまでダイアログを閉じない
    if (!order) return;
    setIsDeleting(true);
    setError(null);
    try {
      await invoke("delete_exam_order_cmd", { id: order.id });
      toast.success("オーダーを削除しました", {
        description: describeOrder(order, patientName),
      });
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setError("削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={order !== null}
      onOpenChange={(open) => {
        if (!open) setError(null);
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>このオーダーを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {order && describeOrder(order, patientName)}
            <br />
            削除すると元に戻せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? "削除中…" : "削除する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
