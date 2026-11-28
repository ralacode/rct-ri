// src/components/react/auth/auth-card.tsx
//
// ログイン・初期設定の画面の枠（ロゴ・手順・見出し・説明）。

import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteMeta } from "@/lib/constants";

interface Props {
  title: string;
  description?: ReactNode;
  /** 「初期設定 1 / 2」などの手順 */
  step?: string;
  children: ReactNode;
}

export function AuthCard({ title, description, step, children }: Props) {
  return (
    <div className="grid w-full gap-6">
      <div className="flex items-center justify-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          RCT
        </span>
        <span className="text-sm text-muted-foreground">
          {siteMeta.siteTitle}（放射線業務支援アプリ）
        </span>
      </div>
      <Card>
        <CardHeader>
          {step && <p className="text-xs text-muted-foreground">{step}</p>}
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
