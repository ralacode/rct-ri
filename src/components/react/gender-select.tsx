// src/components/react/gender-select.tsx
import { cn } from "@/lib/utils";
import React from "react";
import type { Patient } from "@/types/patient";

interface GenderSelectProps {
  value: Patient["gender"]; // 💡 string から Patient["gender"] に変更
  onChange: (newValue: Patient["gender"]) => void; // 💡 引数の型も変更
  disabled?: boolean;
  className?: string;
}

// ベースとなるボタン全体のスタイル（共通）
const BASE_STYLE =
  "grid justify-center items-center py-4 text-xl rounded-md border font-medium cursor-pointer transition-colors select-none";

// 選択されているときのスタイル
const ACTIVE_STYLE =
  "border-emerald-700 bg-emerald-100 text-emerald-700 font-semibold ring-2 ring-emerald-500/20";

// 選択されていないときのスタイル
const INACTIVE_STYLE =
  "border-gray-500 bg-white hover:bg-gray-100 hover:border-gray-400";

// disabled のときのスタイル
const DISABLED_STYLE = "opacity-50 cursor-not-allowed pointer-events-none";

export const GenderSelect: React.FC<GenderSelectProps> = ({
  value,
  onChange,
  disabled = false,
  className,
}) => {
  return (
    <div className={cn("grid gap-2", className)}>
      <p className={cn("text-sm")}>性別</p>

      <div className={cn("grid grid-flow-col gap-4")}>
        <label
          className={cn(
            BASE_STYLE,
            value === "男" ? ACTIVE_STYLE : INACTIVE_STYLE,
            disabled && DISABLED_STYLE,
          )}
        >
          <input
            type="radio"
            name="gender"
            value="男"
            checked={value === "男"}
            onChange={() => !disabled && onChange("男")}
            className="sr-only"
          />
          男
        </label>

        {/* 「女」ボタン */}
        <label
          className={cn(
            BASE_STYLE,
            value === "女" ? ACTIVE_STYLE : INACTIVE_STYLE,
            disabled && DISABLED_STYLE,
          )}
        >
          <input
            type="radio"
            name="gender"
            value="女"
            checked={value === "女"}
            onChange={() => !disabled && onChange("女")}
            className="sr-only"
          />
          女
        </label>
      </div>
    </div>
  );
};
