// src/components/react/exam_order/daily-list/delete-order-dialog.tsx

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
import type { ExamOrderWithPatient } from "@/types/exam_order";

interface Props {
  /** 削除する検査オーダー。null のときは閉じている */
  order: ExamOrderWithPatient | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteOrderDialog({ order, onOpenChange, onDeleted }: Props) {
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
        description: `${order.exam_time} ${order.exam_item}（${order.last_name_kanji} ${order.first_name_kanji} 様）`,
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
            {order &&
              `${order.exam_time} ${order.exam_item}（${order.last_name_kanji} ${order.first_name_kanji} 様）`}
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
