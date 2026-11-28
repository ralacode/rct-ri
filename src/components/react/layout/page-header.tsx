// src/components/react/layout/page-header.tsx
//
// ページ上部の見出し。タイトル・説明と、右側に置く操作ボタンをまとめる。
// どのページでも同じ見た目になるよう、ページの見出しはこれを使う。

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  description?: ReactNode;
  /** 右側（狭い画面では下側）に置く操作 */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 @lg:flex-row @lg:items-end @lg:justify-between",
        className,
      )}
    >
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** ページ本文の幅をそろえるコンテナ */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-4xl gap-6 pt-4 md:pt-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
