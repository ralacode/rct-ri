// src/components/react/exam_order/daily-list/order-card.tsx
//
// 検査一覧の 1 件分。左に予約時刻、右に検査・患者・投与記録を並べる「カード行」。

import {
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import { calculateAge, cn, toKatakana } from "@/lib/utils";
import { canPrintProcedureSheet } from "@components/react/exam_order/procedure_page/procedure-page";
import { PediatricDoseNote } from "@components/react/exam_order/pediatric-dose-note";
import { getInjectionStatus } from "@components/react/exam_order/order-status";
import {
  InjectionRecord,
  InjectionStatusBadge,
} from "@components/react/exam_order/injection-record";

interface Props {
  order: ExamOrderWithPatient;
  onEditInjection: (order: ExamOrderWithPatient) => void;
  onPrintProcedure: (order: ExamOrderWithPatient) => void;
  onDelete: (order: ExamOrderWithPatient) => void;
}

export function OrderCard({
  order,
  onEditInjection,
  onPrintProcedure,
  onDelete,
}: Props) {
  const status = getInjectionStatus(order);
  const age = calculateAge(order.birth_date);
  const needsProcedure = canPrintProcedureSheet(order.exam_item);

  return (
    <Card className="@container/order gap-0 overflow-hidden py-0">
      {/* 広いときは左に時刻の列、狭いときは上に時刻の帯 */}
      <div className="flex flex-col @md/order:flex-row">
        {/* 予約時刻 */}
        <div className="flex shrink-0 items-center border-b bg-muted/40 px-4 py-2 @md/order:w-20 @md/order:flex-col @md/order:border-r @md/order:border-b-0 @md/order:px-0 @md/order:py-4">
          <time className="text-base font-semibold tabular-nums @md/order:text-lg">
            {order.exam_time}
          </time>
        </div>

        <div className="grid min-w-0 flex-1 gap-4 p-4">
          {/* 検査項目・状態・操作 */}
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold @md/order:text-lg">
                {order.exam_item}
              </h2>
              <InjectionStatusBadge status={status} />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={status === "pending" ? "default" : "outline"}
                size="sm"
                onClick={() => onEditInjection(order)}
              >
                {status === "pending" ? <PlusIcon /> : <PencilIcon />}
                {status === "pending" ? "投与記録を入力" : "投与記録を編集"}
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
                  {needsProcedure && (
                    <>
                      <DropdownMenuItem
                        onSelect={() => onPrintProcedure(order)}
                      >
                        <PrinterIcon />
                        標識手順書を印刷
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
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

          {/* 患者 */}
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-medium">
                {order.last_name_kanji} {order.first_name_kanji}
              </span>
              <span className="text-sm text-muted-foreground">
                {toKatakana(order.last_name_kana)}{" "}
                {toKatakana(order.first_name_kana)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular-nums">
                ID <span className="text-foreground">{order.patient_id}</span>
              </span>
              <Dot />
              <span>
                {age !== null ? `${age}歳` : "年齢不明"}・{order.gender}
              </span>
              <Dot />
              <span className="tabular-nums">
                {order.height ? `${order.height} cm` : "身長未登録"} /{" "}
                {order.weight ? `${order.weight} kg` : "体重未登録"}
              </span>
              <Dot />
              <span>
                {order.requesting_department}
                {order.requesting_physician &&
                  `・${order.requesting_physician}`}
              </span>
            </div>
          </div>

          <PediatricDoseNote examItem={order.exam_item} weight={order.weight} />

          {status !== "pending" && <InjectionRecord order={order} />}
        </div>
      </div>
    </Card>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="hidden text-border @md/order:inline">
      |
    </span>
  );
}
