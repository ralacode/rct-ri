// src/components/react/exam_order/daily-list/daily-order-list.tsx
//
// 検査一覧ページ。日ごとの検査オーダーをカード行で表示する。
// 印刷物（使用記録簿・標識手順書）は画面とは別のコンポーネントで、画面には出ない。

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ClipboardListIcon, PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { invoke } from "@/lib/api";
import { onDataChanged } from "@/lib/live";
import { useFacilityName } from "@/lib/settings";
import { cn, getTodayLocalString } from "@/lib/utils";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import styles from "@styles/daily-order-list.module.css";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

import { DateNavigator } from "./date-navigator";
import { DeleteOrderDialog } from "@components/react/exam_order/delete-order-dialog";
import { InjectionRecordDialog } from "./injection-record-dialog";
import { OrderCard } from "./order-card";
import { getInjectionStatus } from "@components/react/exam_order/order-status";
import { printProcedureSheet, printUsageRecord } from "./print";
import { ProcedureSheetsPrint } from "./procedure-sheets-print";
import { UsageRecordPrint } from "./usage-record-print";

export function DailyOrderList() {
  const facilityName = useFacilityName();
  const [targetDate, setTargetDate] = useState(getTodayLocalString());
  const [orders, setOrders] = useState<ExamOrderWithPatient[] | null>(null);
  const [editingOrder, setEditingOrder] = useState<ExamOrderWithPatient | null>(
    null,
  );
  const [deletingOrder, setDeletingOrder] =
    useState<ExamOrderWithPatient | null>(null);

  const targetDateRef = useRef(targetDate);
  targetDateRef.current = targetDate;

  const fetchOrders = async (date: string) => {
    try {
      const data = await invoke<ExamOrderWithPatient[]>(
        "get_daily_exam_orders",
        { date },
      );
      // 取得中に日付が変わっていたら古い結果は捨てる
      if (date === targetDateRef.current) setOrders(data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      if (date === targetDateRef.current) setOrders([]);
    }
  };

  useEffect(() => {
    setOrders(null);
    void fetchOrders(targetDate);
  }, [targetDate]);

  useEffect(() => {
    return onDataChanged(() => fetchOrders(targetDateRef.current));
  }, []);

  const refresh = () => fetchOrders(targetDateRef.current);
  const list = orders ?? [];
  const doneCount = list.filter((o) => getInjectionStatus(o) === "done").length;

  return (
    <div className={cn("relative", styles.container)}>
      {/* 穴あけパンチの中心合わせ用マーク（印刷時のみ、各ページの左端・縦中央に出る） */}
      <ChevronLeft className={styles.punch_mark} aria-hidden="true" />

      <PageContainer className="print:hidden">
        <PageHeader
          title="検査一覧"
          description="日ごとの RI 検査オーダーと投与記録"
          actions={
            <Button
              variant="outline"
              disabled={list.length === 0}
              onClick={printUsageRecord}
            >
              <PrinterIcon />
              使用記録簿を印刷
            </Button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateNavigator value={targetDate} onChange={setTargetDate} />
          {orders && orders.length > 0 && (
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">
                {orders.length}
              </span>{" "}
              件・投与済み{" "}
              <span className="font-medium text-foreground">{doneCount}</span>{" "}
              件
            </p>
          )}
        </div>

        {orders === null ? (
          <OrderListSkeleton />
        ) : orders.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardListIcon />
              </EmptyMedia>
              <EmptyTitle>この日の検査はありません</EmptyTitle>
              <EmptyDescription>
                検査オーダーは患者詳細ページから登録できます。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-3">
            {orders.map((order) => (
              <li key={order.id}>
                <OrderCard
                  order={order}
                  onEditInjection={setEditingOrder}
                  onPrintProcedure={(o) => printProcedureSheet(o.id)}
                  onDelete={setDeletingOrder}
                />
              </li>
            ))}
          </ul>
        )}
      </PageContainer>

      <InjectionRecordDialog
        order={editingOrder}
        onOpenChange={(open) => !open && setEditingOrder(null)}
        onSaved={refresh}
      />
      <DeleteOrderDialog
        order={deletingOrder}
        patientName={
          deletingOrder
            ? `${deletingOrder.last_name_kanji} ${deletingOrder.first_name_kanji}`
            : undefined
        }
        onOpenChange={(open) => !open && setDeletingOrder(null)}
        onDeleted={refresh}
      />

      {/* 印刷物（画面には出ない）。投与記録の入力中は印刷しない */}
      {editingOrder === null && (
        <>
          <UsageRecordPrint
            facilityName={facilityName}
            targetDate={targetDate}
            orders={list}
          />
          <ProcedureSheetsPrint targetDate={targetDate} orders={list} />
        </>
      )}
    </div>
  );
}

function OrderListSkeleton() {
  return (
    <ul className="grid gap-3" aria-busy="true" aria-label="読み込み中">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex overflow-hidden rounded-xl border">
          <div className="w-20 border-r bg-muted/40" />
          <div className="grid flex-1 gap-3 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
