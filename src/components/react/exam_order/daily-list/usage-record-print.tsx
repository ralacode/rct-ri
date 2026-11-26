// src/components/react/exam_order/daily-list/usage-record-print.tsx
//
// 放射性医薬品使用記録簿（印刷専用）。
// 画面には出さず、body[data-print-mode="summary"] のときだけ印刷される
// （スタイルは daily-order-list.module.css）。
// レイアウトは紙の様式に合わせているので、画面デザインの変更とは切り離して扱う。

import React from "react";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  cn,
  formatDateTimeWithDay,
  toKatakana,
} from "@lib/utils";
import styles from "@styles/daily-order-list.module.css";
import { BorderInGrid } from "@components/react/exam_order/border_in_grid/border-in-grid";
import { BorderInGridItem1 } from "@components/react/exam_order/border_in_grid/border-in-grid-item1";
import { BorderInGridContent1 } from "@components/react/exam_order/border_in_grid/border-in-grid-content1";

const EXAM_ITEM_DISPLAY_MAP: Record<string, React.ReactNode> = {
  センチネルリンパ節シンチ: (
    <>
      <span>センチネル</span>
      <br />
      <span>リンパ節シンチ</span>
    </>
  ),
  "腎レノグラム ラシックス負荷": (
    <>
      <span>腎レノグラム</span>
      <br />
      <span>ラシックス負荷</span>
    </>
  ),
  "腎レノグラム 負荷無": (
    <>
      <span>腎レノグラム</span>
      <br />
      <span>負荷無</span>
    </>
  ),
  "心筋シンチ Tl 運動負荷": (
    <>
      <span>心筋シンチ Tl</span>
      <br />
      <span>運動負荷</span>
    </>
  ),
  "心筋シンチ Tl 薬物負荷": (
    <>
      <span>心筋シンチ Tl</span>
      <br />
      <span>薬物負荷</span>
    </>
  ),
  "脳血流シンチIMP 負荷無採血無": (
    <>
      <span>脳血流シンチ</span>
      <br />
      <span>IMP</span>
      <br />
      <span>負荷無採血無</span>
    </>
  ),
};

interface Props {
  facilityName: string;
  targetDate: string;
  orders: ExamOrderWithPatient[];
}

export const UsageRecordPrint: React.FC<Props> = ({
  facilityName,
  targetDate,
  orders,
}) => {
  return (
    <div
      className={cn(
        "hidden text-black",
        "print:grid",
        // "[body[data-print-mode='summary']_&]:grid gap-4",
        styles.for_print,
      )}
    >
      <div>
        <h1 className={"text-xl"}>{facilityName}　放射性医薬品使用記録簿</h1>

        <p>使用日：{formatDateTimeWithDay(targetDate)}</p>
      </div>

      <ul className={cn("space-y-2")}>
        {orders.map((order) => {
          return (
            <li
              className={cn("border-t border-l border-black")}
              key={order.patient_id}
            >
              <div className={cn("grid grid-flow-col")}>
                <BorderInGrid>
                  <BorderInGridItem1>予約時間</BorderInGridItem1>
                  <BorderInGridContent1>{order.exam_time}</BorderInGridContent1>
                </BorderInGrid>

                <BorderInGrid>
                  <BorderInGridItem1>氏名</BorderInGridItem1>
                  <BorderInGridContent1>
                    <ruby>
                      {order.last_name_kanji}
                      <rt className="name-rt">
                        {toKatakana(order.last_name_kana)}
                      </rt>
                    </ruby>{" "}
                    <ruby>
                      {order.first_name_kanji}
                      <rt className="name-rt">
                        {toKatakana(order.first_name_kana)}
                      </rt>
                    </ruby>
                  </BorderInGridContent1>
                </BorderInGrid>

                <BorderInGrid>
                  <BorderInGridItem1>ID</BorderInGridItem1>
                  <BorderInGridContent1>
                    {order.patient_id}
                  </BorderInGridContent1>
                </BorderInGrid>

                <BorderInGrid>
                  <BorderInGridItem1>性別</BorderInGridItem1>
                  <BorderInGridContent1>{order.gender}</BorderInGridContent1>
                </BorderInGrid>

                <BorderInGrid>
                  <BorderInGridItem1>年齢</BorderInGridItem1>
                  <BorderInGridContent1>
                    {calculateAge(order.birth_date)}歳
                  </BorderInGridContent1>
                </BorderInGrid>

                <BorderInGrid>
                  <BorderInGridItem1>依頼科</BorderInGridItem1>
                  <BorderInGridContent1>
                    {order.requesting_department}
                  </BorderInGridContent1>
                </BorderInGrid>

                <BorderInGrid>
                  <BorderInGridItem1>依頼医</BorderInGridItem1>
                  <BorderInGridContent1>
                    {order.requesting_physician}
                  </BorderInGridContent1>
                </BorderInGrid>
              </div>

              <div className={`${styles.order_content_row_2}`}>
                <div
                  className={`${styles.exam_item_area} ${styles.order_content_item}`}
                >
                  <p>検査項目</p>

                  <div>
                    <p className={styles.exam_item}>
                      {EXAM_ITEM_DISPLAY_MAP[order.exam_item] ||
                        order.exam_item}
                    </p>
                  </div>
                </div>

                <div
                  className={`${styles.drug_label} ${styles.order_content_item}`}
                >
                  <p>放射性医薬品ラベル</p>
                </div>

                <div
                  className={`${styles.record_area} ${styles.order_content_item}`}
                >
                  <div className={`${styles.record_area_user}`}>
                    <p>使用者</p>
                    <p></p>
                  </div>

                  {/* 投与時刻 */}
                  <div className={`${styles.record_area_time}`}>
                    <p>投与時刻</p>
                    {order.injection_time ? (
                      <div className="border-b border-r border-black grid justify-end pr-1">
                        {order.injection_time}
                      </div>
                    ) : (
                      <p></p>
                    )}
                  </div>

                  <div
                    className={cn(styles.activity_volume, styles.administered)}
                  >
                    <div>
                      <p>投与量</p>
                    </div>
                    <div className={cn("pr-1 text-sm")}>
                      {order.dosage_mbq !== null ? (
                        <div>{order.dosage_mbq} MBq</div>
                      ) : (
                        <p> MBq</p>
                      )}
                      {order.dosage_ml !== null ? (
                        <div>{order.dosage_ml} mL</div>
                      ) : (
                        <p> mL</p>
                      )}
                    </div>
                  </div>

                  <div
                    className={`${styles.activity_volume} ${styles.residual}`}
                  >
                    <div>
                      <p>残量</p>
                    </div>
                    <div className={cn("pr-1 text-sm")}>
                      {order.remain_mbq !== null ? (
                        <div>{order.remain_mbq} MBq</div>
                      ) : (
                        <p> MBq</p>
                      )}
                      {order.remain_ml !== null ? (
                        <div>{order.remain_ml} mL</div>
                      ) : (
                        <p> mL</p>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={`${styles.body_info_area} ${styles.order_content_item}`}
                >
                  <div className={styles.body_info}>
                    <p>{order.height} cm</p>
                    <p>{order.weight} kg</p>
                  </div>

                  <div>
                    <p>備考)</p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
