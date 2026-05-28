import * as React from "react";
import styles from "@styles/my-input.module.css";
import { cn } from "@lib/utils";

// interface Props {
//   className?: string;
//   labelClassName?: string;
//   inputClassName?: string;
//   id: string;
//   label: string;
//   type?: "text" | "email" | "tel" | "url";
//   placeholder?: string;
//   required?: boolean;
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
// }

// React.InputHTMLAttributes を継承することで、maxLength や min, max などの標準属性を網羅します
interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  id: string;
  label: string;
}

export const MyInput = ({
  className = "",
  labelClassName = "",
  inputClassName = "",
  id,
  label,
  type = "text",
  placeholder = "",
  required = false,
  value,
  onChange,
  ...rest
}: Props) => {
  return (
    <div className={cn("grid gap-1", className)}>
      <label
        htmlFor={id}
        className={cn(
          // ラベルのデフォルトスタイル
          // 小さめ、太字、少し薄い黒
          "block text-sm font-medium text-gray-700/90",
          labelClassName,
        )}
      >
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        // cn関数を使い、inputのデフォルトスタイルを設定
        className={cn(
          // --- ベース ---
          "rounded-4xl border transition-colors",
          // --- サイズ・余白 ---
          "px-4 py-2 w-full",
          // --- 色・枠線（ライトモード） ---
          "border-gray-500 bg-white text-my_gray placeholder:text-gray-400",
          // --- フォーカス時のスタイル ---
          "focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none",
          // --- ホバー時のスタイル ---
          "hover:border-gray-400",
          // --- 無効化（Disabled）時のスタイル ---
          "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-70",
          // --- バリデーションエラー（aria-invalid）時のスタイル ---
          "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/20",
          // 外部からのクラスで上書き可能にする
          inputClassName,
        )}
        required={required}
        value={value}
        autoComplete="off"
        onChange={onChange}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  );
};
