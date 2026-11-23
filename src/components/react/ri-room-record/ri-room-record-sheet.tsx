import type { FC } from "react";

import styles from "@/styles/ri-room-record.module.css";

/** 1 枚あたりの記録行数 */
export const ROW_COUNT = 30;

/** 列幅（mm）。合計が .sheet の幅（186mm）になるようにする */
const COLUMN_WIDTHS = {
  date: 19,
  enter: 17,
  leave: 17,
  content: 91,
  contamination: 21,
  operator: 21,
} as const;

export const RiRoomRecordSheet: FC<{ year?: number }> = ({ year }) => {
  return (
    <div className={styles.sheet}>
      <h2 className={styles.title}>
        <span className={styles.year}>
          <span className={styles.year_value}>{year ?? ""}</span>年
        </span>
        <span>放射性同位元素使用室作業内容記録</span>
      </h2>

      <table className={styles.table}>
        <colgroup>
          {Object.entries(COLUMN_WIDTHS).map(([key, width]) => (
            <col key={key} style={{ width: `${width}mm` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>作業日</th>
            <th colSpan={2}>
              <div className={styles.time_header}>
                <span className={styles.time_label}>時刻</span>
                <span>入室</span>
                <span>退室</span>
              </div>
            </th>
            <th>作業内容</th>
            <th>
              <span className="block">汚染の</span>
              <span className="block">有無</span>
            </th>
            <th>担当者</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROW_COUNT }, (_, row) => (
            <tr key={row}>
              <td className={styles.center}>/</td>
              <td className={styles.enter_cell} />
              <td className={styles.leave_cell} />
              <td />
              <td className={styles.center}>有・無</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
