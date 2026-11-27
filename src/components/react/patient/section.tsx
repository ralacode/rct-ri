// src/components/react/patient/section.tsx
//
// 患者詳細の各ブロック（検査オーダー・治療依頼など）の見出しと中身。

import type { ReactNode } from "react";

interface Props {
  title: string;
  /** 見出しの横に出す件数（読み込み中は undefined） */
  count?: number;
  description?: string;
  /** 見出しの右側に置く操作 */
  actions?: ReactNode;
  children: ReactNode;
}

export function Section({
  title,
  count,
  description,
  actions,
  children,
}: Props) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="text-lg font-semibold">
            {title}
            {count !== undefined && (
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {count} 件
              </span>
            )}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
