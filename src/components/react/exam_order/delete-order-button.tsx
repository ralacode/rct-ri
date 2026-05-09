// src/components/react/exam_order/DeleteOrderButton.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  orderId: number;
  onSuccess: () => Promise<void> | void;
}

export const DeleteOrderButton: React.FC<Props> = ({ orderId, onSuccess }) => {
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

  if (!isConfirming) {
    return (
      <button onClick={() => setIsConfirming(true)} type="button">
        オーダー削除
      </button>
    );
  }

  return (
    <div>
      <p>本当に削除しますか？</p>
      <button onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? "削除中..." : "削除する"}
      </button>
      <button onClick={() => setIsConfirming(false)} disabled={isDeleting}>
        キャンセル
      </button>
    </div>
  );
};
