// src/components/react/exam_order/DeleteOrderButton.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MyButton } from "@components/react/my-button";
import styles from "@styles/delete-order-button.module.css";

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

  // if (!isConfirming) {
  //   return (
  //     <MyButton
  //       onClick={() => setIsConfirming(true)}
  //       type="button"
  //       className={styles.delete_order_button}
  //     >
  //       オーダー削除
  //     </MyButton>
  //   );
  // }

  return (
    <div className={`${styles.container} ${className}`}>
      {!isConfirming ? (
        <MyButton
          onClick={() => setIsConfirming(true)}
          type="button"
          className={styles.delete_order_button}
        >
          オーダー削除
        </MyButton>
      ) : (
        <>
          <p>本当に削除しますか？</p>
          <div className={styles.button_area}>
            <MyButton
              onClick={handleDelete}
              disabled={isDeleting}
              className={styles.confirm_delete}
            >
              {isDeleting ? "削除中..." : "削除する"}
            </MyButton>
            <MyButton
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
              className={styles.cancel_button}
            >
              キャンセル
            </MyButton>
          </div>
        </>
      )}
    </div>
  );
};
