// src/components/react/exam_order/injection-record.tsx
//
// 投与記録の表示（状況バッジ・投与時刻・投与量・残量・実投与量）。検査一覧と患者詳細で使う。

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";
import {
  INJECTION_STATUS_LABEL,
  type InjectionStatus,
} from "@components/react/exam_order/order-status";

type InjectionFields = Pick<
  ExamOrder,
  "dosage_mbq" | "dosage_ml" | "remain_mbq" | "remain_ml" | "injection_time"
>;

export function InjectionStatusBadge({ status }: { status: InjectionStatus }) {
  return (
    <Badge
      variant={
        status === "done"
          ? "default"
          : status === "partial"
            ? "secondary"
            : "outline"
      }
      className={cn(status === "pending" && "text-muted-foreground")}
    >
      {INJECTION_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * 投与記録（投与時刻・投与量・残量・実投与量）。
 * 親の @container/order の幅が広いときは 4 列、狭いときは 2 列で並べる。
 */
export function InjectionRecord({ order }: { order: InjectionFields }) {
  const actualMbq =
    order.dosage_mbq !== null && order.remain_mbq !== null
      ? (order.dosage_mbq - order.remain_mbq).toFixed(1)
      : null;
  const actualMl =
    order.dosage_ml !== null && order.remain_ml !== null
      ? (order.dosage_ml - order.remain_ml).toFixed(1)
      : null;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border @xl/order:grid-cols-4">
      <Stat label="投与時刻">{order.injection_time || "--:--"}</Stat>
      <Stat label="投与量">
        <Amount mbq={order.dosage_mbq} ml={order.dosage_ml} />
      </Stat>
      <Stat label="残量">
        <Amount mbq={order.remain_mbq} ml={order.remain_ml} />
      </Stat>
      <Stat label="実投与量" emphasis>
        <Amount mbq={actualMbq} ml={actualMl} />
      </Stat>
    </dl>
  );
}

function Stat({
  label,
  emphasis,
  children,
}: {
  label: string;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-0.5 bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm tabular-nums", emphasis && "font-semibold")}>
        {children}
      </dd>
    </div>
  );
}

function Amount({
  mbq,
  ml,
}: {
  mbq: number | string | null;
  ml: number | string | null;
}) {
  return (
    <span className="flex flex-wrap gap-x-2">
      <span>
        {mbq ?? "-"} <span className="text-muted-foreground">MBq</span>
      </span>
      <span>
        {ml ?? "-"} <span className="text-muted-foreground">mL</span>
      </span>
    </span>
  );
}
