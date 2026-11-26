// src/components/react/exam_order/daily-list/procedure-sheets-print.tsx
//
// 標識手順書（印刷専用）。body[data-print-mode="procedure"] のときだけ印刷される。
// 1 件ずつ印刷するときは printProcedureSheet() で対象以外を印刷から外す。

import React, { memo } from "react";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import styles from "@styles/daily-order-list.module.css";
import { ProcedurePage } from "@components/react/exam_order/procedure_page/procedure-page";

const MemoizedProcedurePage = memo(ProcedurePage);

interface Props {
  targetDate: string;
  orders: ExamOrderWithPatient[];
}

export const ProcedureSheetsPrint: React.FC<Props> = ({
  targetDate,
  orders,
}) => {
  return (
    <div className={styles.procedure_for_print}>
      {orders.map((order) => (
        <MemoizedProcedurePage
          key={`proc-${order.id}`}
          order={order}
          targetDate={targetDate}
        />
      ))}
    </div>
  );
};
