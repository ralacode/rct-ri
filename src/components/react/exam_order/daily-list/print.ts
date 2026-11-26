// src/components/react/exam_order/daily-list/print.ts
//
// 検査一覧の印刷。body の data-print-mode で印刷する帳票を切り替える
// （どの帳票を出すかは daily-order-list.module.css の @media print で決まる）。

import styles from "@styles/daily-order-list.module.css";

/** 放射性医薬品使用記録簿を印刷する */
export function printUsageRecord() {
  document.body.setAttribute("data-print-mode", "summary");
  // 属性が反映されるのを僅かに待ってから印刷する
  setTimeout(() => {
    window.print();
    document.body.removeAttribute("data-print-mode");
  }, 50);
}

/** 1 件分の標識手順書を印刷する */
export function printProcedureSheet(orderId: number) {
  const pages = document.querySelectorAll(`.${styles.procedure_page}`);
  // 対象（id="print-target-<orderId>"）以外を印刷から外す
  pages.forEach((page) => {
    page.classList.toggle(
      styles.no_print,
      page.id !== `print-target-${orderId}`,
    );
  });
  document.body.setAttribute("data-print-mode", "procedure");

  setTimeout(() => {
    window.print();
    document.body.removeAttribute("data-print-mode");
    pages.forEach((page) => page.classList.remove(styles.no_print));
  }, 100);
}
