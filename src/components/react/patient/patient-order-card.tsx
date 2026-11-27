// src/components/react/patient/patient-order-card.tsx
//
// 患者詳細の検査オーダー 1 件分。検査一覧のカード行と同じ作りで、左に検査日と予約時刻を置く。

import { format, isValid, parse } from "date-fns";
import { ja } from "date-fns/locale";
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDateTimeWithDay, getTodayLocalString } from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";
import {
  InjectionRecord,
  InjectionStatusBadge,
} from "@components/react/exam_order/injection-record";
import { getInjectionStatus } from "@components/react/exam_order/order-status";
import { PediatricDoseNote } from "@components/react/exam_order/pediatric-dose-note";

/** "2026-11-27" などを Date にする（読めなければ null） */
function parseExamDate(value: string): Date | null {
  const nums = value.match(/\d+/g);
  if (!nums || nums.length < 3) return null;
  const date = parse(nums.slice(0, 3).join("-"), "yyyy-M-d", new Date());
  return isValid(date) ? date : null;
}

interface Props {
  order: ExamOrder;
  /** 小児推奨量の計算に使う患者の体重 */
  weight: number | null;
  onEdit: (order: ExamOrder) => void;
  onDelete: (order: ExamOrder) => void;
}

export function PatientOrderCard({ order, weight, onEdit, onDelete }: Props) {
  const status = getInjectionStatus(order);
  const date = parseExamDate(order.exam_date);
  const dateValue = date ? format(date, "yyyy-MM-dd") : "";
  const today = getTodayLocalString();
  const isToday = dateValue === today;
  const isUpcoming = dateValue > today;

  return (
    <Card className="@container/order gap-0 overflow-hidden py-0">
      <div className="flex flex-col @md/order:flex-row">
        {/* 検査日・予約時刻（広いときは左の列、狭いときは上の帯） */}
        <div
          className={cn(
            "flex shrink-0 items-baseline gap-2 border-b bg-muted/40 px-4 py-2",
            "@md/order:w-28 @md/order:flex-col @md/order:items-center @md/order:gap-0.5 @md/order:border-r @md/order:border-b-0 @md/order:px-2 @md/order:py-4",
          )}
        >
          {date ? (
            <>
              <span className="text-xs text-muted-foreground tabular-nums">
                {format(date, "yyyy年")}
              </span>
              <span className="text-base font-semibold whitespace-nowrap tabular-nums">
                {format(date, "M/d")}
                <span className="ml-0.5 text-sm font-normal">
                  ({format(date, "E", { locale: ja })})
                </span>
              </span>
            </>
          ) : (
            <span className="text-sm">{order.exam_date}</span>
          )}
          <time className="text-sm tabular-nums text-muted-foreground">
            {order.exam_time}
          </time>
        </div>

        <div className="grid min-w-0 flex-1 gap-3 p-4">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{order.exam_item}</h3>
              <InjectionStatusBadge status={status} />
              {isToday && <Badge variant="outline">今日</Badge>}
              {isUpcoming && <Badge variant="outline">予定</Badge>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => onEdit(order)}>
                <PencilIcon />
                編集
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="その他の操作"
                  >
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(order)}
                  >
                    <Trash2Icon />
                    オーダーを削除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {order.requesting_department}
            {order.requesting_physician && `・${order.requesting_physician}`}
            <span className="ml-3 text-xs">
              登録日 {formatDateTimeWithDay(order.created_at)}
            </span>
          </p>

          {/* 投与が済んだ検査では推奨量は出さない */}
          {status !== "done" && (
            <PediatricDoseNote examItem={order.exam_item} weight={weight} />
          )}

          {status !== "pending" && <InjectionRecord order={order} />}
        </div>
      </div>
    </Card>
  );
}
