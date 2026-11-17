import type { FC } from "react";

import { HOSPITAL_NAME } from "@/lib/secret-utils";
import styles from "@/styles/elution-record.module.css";

/** 1 枚に並べるジェネレータ欄の数 */
export const BLOCK_COUNT = 5;
/** ジェネレータ 1 本あたりの溶出記録行数 */
export const ROWS_PER_BLOCK = 5;

/** 列幅（mm）。合計が .sheet の幅（184mm）になるようにする */
const COLUMNS = [
  { key: "generator", label: ["ジェネレータ"], width: 62 },
  { key: "serial", label: ["溶出通番"], width: 24 },
  { key: "date", label: ["溶出日"], width: 18 },
  { key: "time", label: ["溶出", "時刻"], width: 18 },
  { key: "activity", label: ["放射能"], width: 18 },
  { key: "volume", label: ["液量"], width: 18 },
  { key: "operator", label: ["作業", "担当者"], width: 26 },
] as const;

export const ElutionRecordSheet: FC<{ year: number; month: number }> = ({
  year,
  month,
}) => {
  return (
    <div className={styles.sheet}>
      <h2 className={styles.title}>
        <sup>99</sup>Mo-<sup>99m</sup>Tc ジェネレータ溶出記録
      </h2>

      <div className={styles.subtitle}>
        <div className={styles.year_month}>
          <span>{year} 年</span>
          <span>{month} 月</span>
        </div>
        <div className={styles.facility}>
          <span>{HOSPITAL_NAME}</span>
          <span>RI検査室</span>
        </div>
      </div>

      <table className={styles.table}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.key} style={{ width: `${column.width}mm` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key}>
                {column.label.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: BLOCK_COUNT }, (_, block) =>
            Array.from({ length: ROWS_PER_BLOCK }, (_, row) => (
              <tr
                key={`${block}-${row}`}
                className={row === 0 ? styles.block_start : undefined}
              >
                {row === 0 && (
                  <td
                    rowSpan={ROWS_PER_BLOCK}
                    className={styles.generator_cell}
                  >
                    <div className={styles.purchase_date}>
                      <span>購入日（入荷日）</span>
                      <span className={styles.slash}>／</span>
                    </div>
                  </td>
                )}
                <td />
                <td />
                <td className={styles.time_cell}>:</td>
                <td />
                <td />
                <td />
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
};
