// src/components/react/exam_order/daily-list.tsx

import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  deleteOrder,
  formatDateTimeWithDay,
  getTodayLocalString,
  toKatakana,
} from "@lib/utils";
import styles from "@styles/daily-order-list.module.css";
import { DeleteOrderButton } from "@components/react/exam_order/delete-order-button";

const EXAM_ITEM_DISPLAY_MAP: Record<string, React.ReactNode> = {
  センチネルリンパ節シンチ: (
    <>
      <span>センチネル</span>
      <br />
      <span>リンパ節シンチ</span>
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

export const DailyOrderList: React.FC = () => {
  const [targetDate, setTargetDate] = useState(getTodayLocalString());
  const [orders, setOrders] = useState<ExamOrderWithPatient[]>([]);

  // input要素にアクセスするためのref
  const dateInputRef = useRef<HTMLInputElement>(null);

  const fetchOrders = async (date: string) => {
    try {
      const data = await invoke<ExamOrderWithPatient[]>(
        "get_daily_exam_orders",
        { date },
      );
      setOrders(data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  };

  useEffect(() => {
    fetchOrders(targetDate);
  }, [targetDate]);

  // カレンダーを開く処理
  const handleOpenCalendar = (e?: React.MouseEvent | React.FocusEvent) => {
    // ボタンクリック時にinputからフォーカスが外れないようにしつつ、ピッカーを呼ぶ
    if (dateInputRef.current) {
      try {
        dateInputRef.current.showPicker();
      } catch (error) {
        // 古いブラウザや特定の環境でshowPickerが失敗した場合のフォールバック
        dateInputRef.current.focus();
        console.error("Calendar picker error:", error);
      }
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // クリアボタンが押されて値が空になった場合は、更新を無視する（または今日の日付を再セットする）
    if (!value) {
      // ユーザーが混乱しないよう、空になった瞬間に今日の日付を強制セット
      setTargetDate(getTodayLocalString());
      return;
    }

    setTargetDate(value);
  };

  // 印刷処理
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={styles.container}>
      <div>
        <h1 className={styles.report_title}>
          熊本市立熊本市民病院RI検査室　放射性医薬品使用記録簿
        </h1>

        <p className={styles.use_date}>
          使用日：{formatDateTimeWithDay(targetDate)}
        </p>
      </div>

      <div className={styles.no_print_area}>
        <label htmlFor="date-select" style={{ display: "none" }}>
          表示日:
        </label>
        {/* 手入力を防ぐために readOnly を設定し、クリックでカレンダーが開くようにする */}
        <input
          type="date"
          id="date-select"
          ref={dateInputRef}
          value={targetDate}
          onChange={handleDateChange}
          // 手入力を防ぐための処理
          onKeyDown={(e) => e.preventDefault()}
          onClick={handleOpenCalendar}
          className="date-input"
          style={{ display: "none" }}
        />

        {/* 明示的なカレンダー起動ボタン */}
        <button onClick={handleOpenCalendar} className="calendar-button">
          日付を選択
        </button>

        <button onClick={handlePrint} className="print-button">
          使用記録簿を印刷
        </button>
      </div>

      <div className="order-list-section">
        <h3 className={`${styles.no_print_area}`}>
          {formatDateTimeWithDay(targetDate)} の検査一覧
        </h3>
        {orders.length === 0 ? (
          <p className="no-data">該当するオーダーはありません。</p>
        ) : (
          <ul className={styles.order_list}>
            {orders.map((order) => (
              <li key={order.id} className="order-item">
                <div className={`${styles.for_print}`}>
                  <div className={`${styles.order_content_row_1}`}>
                    <div className={`${styles.order_content_item}`}>
                      <p>予約時間</p>
                      <p>{order.exam_time}</p>
                    </div>

                    <div className={`${styles.order_content_item}`}>
                      <p>氏名</p>
                      <p>
                        <ruby className="name-ruby">
                          {order.last_name_kanji}
                          <rt className="name-rt">
                            {toKatakana(order.last_name_kana)}
                          </rt>
                        </ruby>{" "}
                        <ruby className="name-ruby">
                          {order.first_name_kanji}
                          <rt className="name-rt">
                            {toKatakana(order.first_name_kana)}
                          </rt>
                        </ruby>
                      </p>
                    </div>

                    <div className={`${styles.order_content_item}`}>
                      <p>ID</p>
                      <p>{order.patient_id}</p>
                    </div>

                    <div className={`${styles.order_content_item}`}>
                      <p>性別</p>
                      <p>{order.gender}</p>
                    </div>

                    <div className={`${styles.order_content_item}`}>
                      <p>年齢</p>
                      <p>{calculateAge(order.birth_date)}歳</p>
                    </div>

                    <div className={`${styles.order_content_item}`}>
                      <p>依頼科</p>
                      <p>{order.requesting_department}</p>
                    </div>

                    <div className={`${styles.order_content_item}`}>
                      <p>依頼医</p>
                      <p>{order.requesting_physician}</p>
                    </div>
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

                      <div className={`${styles.record_area_time}`}>
                        <p>投与時刻</p>
                        <p></p>
                      </div>

                      <div
                        className={`${styles.activity_volume} ${styles.administered}`}
                      >
                        <div>
                          <p>投与量</p>
                        </div>
                        <div className={styles.volume_values}>
                          <p> MBq</p>
                          <p> mL</p>
                        </div>
                      </div>

                      <div
                        className={`${styles.activity_volume} ${styles.residual}`}
                      >
                        <div>
                          <p>残量</p>
                        </div>
                        <div className={styles.volume_values}>
                          <p> MBq</p>
                          <p> mL</p>
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
                </div>

                <div className={`${styles.no_print_area}`}>
                  <p className="order-time">{order.exam_time}</p>
                  <p>{order.patient_id}</p>
                  <p className="order-patient">
                    <ruby className="name-ruby">
                      {order.last_name_kanji}
                      <rt className="name-rt">
                        {toKatakana(order.last_name_kana)}
                      </rt>
                    </ruby>{" "}
                    <ruby className="name-ruby">
                      {order.first_name_kanji}
                      <rt className="name-rt">
                        {toKatakana(order.first_name_kana)}
                      </rt>
                    </ruby>
                  </p>
                  <p>{calculateAge(order.birth_date)}歳</p>
                  <p>身長：{order.height ? `${order.height} cm` : "未登録"}</p>
                  <p>体重：{order.weight ? `${order.weight} kg` : "未登録"}</p>
                  <p className="order-name">{order.exam_item}</p>
                  <p className="order-dept">
                    依頼科：{order.requesting_department}
                  </p>
                  <p>依頼医：{order.requesting_physician}</p>

                  <DeleteOrderButton
                    orderId={order.id}
                    onSuccess={() => fetchOrders(targetDate)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
