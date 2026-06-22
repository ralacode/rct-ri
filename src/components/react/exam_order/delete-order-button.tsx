// src/components/react/exam_order/DeleteOrderButton.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MyButton } from "@components/react/my-button";
import { cn } from "@/lib/utils";

interface Props {
  orderId: number;
  onSuccess: () => Promise<void> | void;
  className?: string;
}

export const DeleteOrderButton: React.FC<Props> = ({
  orderId,
  onSuccess,
  className,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await invoke("delete_exam_order_cmd", { id: orderId });
      await onSuccess(); // 親コンポーネントに再取得を依頼
      setIsConfirming(false);
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn("grid grid-rows-[1.5rem_2.5rem]", className)}>
      {!isConfirming ? (
        <MyButton
          onClick={() => setIsConfirming(true)}
          type="button"
          className={cn("bg-red-500 text-white row-span-full self-end")}
        >
          オーダー削除
        </MyButton>
      ) : (
        <>
          <p>本当に削除しますか？</p>
          <div className={cn("grid grid-cols-2 gap-4")}>
            <MyButton
              onClick={handleDelete}
              disabled={isDeleting}
              className={cn("bg-red-500 text-white")}
            >
              {isDeleting ? "削除中..." : "削除する"}
            </MyButton>
            <MyButton
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
            >
              キャンセル
            </MyButton>
          </div>
        </>
      )}
    </div>
  );
};
