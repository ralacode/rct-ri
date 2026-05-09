import React, { type ReactNode } from "react";
import styles from "@styles/my-button.module.css";

interface Props {
  /** ボタン内に表示するコンテンツ */
  children: ReactNode;
  /** クリック時のイベントハンドラ */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** ボタンの有効/無効状態 */
  disabled?: boolean;
  /** ボタンのtype属性 (default: "button") */
  type?: "button" | "submit" | "reset";
  /** カスタムクラス名（外部からスタイルをあてる用） */
  className?: string;
}

export const MyButton: React.FC<Props> = ({
  children,
  onClick,
  disabled = false,
  type = "button",
  className = "",
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles.my_button} ${className}`}
    >
      {children}
    </button>
  );
};
