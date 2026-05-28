import React, { type ReactNode } from "react";
import styles from "@styles/my-button.module.css";
import { Button } from "@components/ui/button";
import { cn } from "@lib/utils";

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
    <>
      {/* <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`${styles.my_button} ${className}`}
      >
        {children}
      </button> */}
      <Button
        type={type}
        onClick={onClick}
        disabled={disabled}
        size="lg"
        className={cn(
          "bg-green-500 text-white hover:opacity-70 rounded-full cursor-pointer border-none px-4 transition-all duration-500 ease-out",
          className,
        )}
      >
        {children}
      </Button>
    </>
  );
};

// // --- ベースの形状と挙動 ---
//           "font-patient text-base rounded-full border-none cursor-pointer transition-all duration-200 ease-out select-none px-8 py-6",
//           // --- 配色（覚えやすい緑 #22aa55 と 白文字） ---
//           "bg-green-600 text-white",
//           // --- インタラクション（ホバー時は少し薄く、クリック時は少し沈む） ---
//           "hover:opacity-85",
//           // --- 無効化状態（Disabled）時のスタイル ---
//           "disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:opacity-60",
