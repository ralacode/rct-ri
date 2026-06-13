// src/components/react/exam_order/daily-order-list.tsx

import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  cn,
  deleteOrder,
  formatDateTimeWithDay,
  getTodayLocalString,
  NEEDS_PROCEDURE_ITEMS,
  toKatakana,
} from "@lib/utils";
import styles from "@styles/daily-order-list.module.css";
import { DeleteOrderButton } from "@components/react/exam_order/delete-order-button";
import { MyButton } from "@components/react/my-button";
import { PatientName } from "@components/react/patient-name";
import { ProcedurePage } from "@components/react/exam_order/procedure_page/procedure-page";
import { ChevronLeft } from "lucide-react";
import { HOSPITAL_NAME } from "@lib/secret-utils";

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

  // 使用記録簿印刷
  const handlePrint = (mode: "summary" | "procedure") => {
    // bodyにモードを刻む
    document.body.setAttribute("data-print-mode", mode);

    // 属性が反映されるのを僅かに待ってから印刷（念のため）
    setTimeout(() => {
      window.print();
      // 印刷ダイアログが閉じた後、属性をクリアしておくと安全
      document.body.removeAttribute("data-print-mode");
    }, 50);
  };

  // 標識手順書印刷
  const handlePrintIndividual = (mode: "procedure", orderId: number) => {
    // 1. まず全ての印刷対象外クラスをリセット
    const pages = document.querySelectorAll(`.${styles.procedure_page}`);
    pages.forEach((page) => page.classList.remove(styles.no_print));

    // 2. 対象のID以外に非表示クラスを付与
    pages.forEach((page) => {
      // idは `print-target-${order.id}` としているので、それと比較
      if (page.id !== `print-target-${orderId}`) {
        page.classList.add(styles.no_print);
      }
    });

    // 3. bodyにモードをセット
    document.body.setAttribute("data-print-mode", mode);

    // 4. 少し待機して印刷を実行
    setTimeout(() => {
      window.print();

      // 5. 印刷ダイアログを閉じた後の後片付け
      document.body.removeAttribute("data-print-mode");
      pages.forEach((page) => page.classList.remove(styles.no_print));
    }, 100); // 念のため100msに伸ばしています
  };

  return (
    <div className={cn("relative print:h-[297mm]", styles.container)}>
      <ChevronLeft className="hidden absolute left-0 top-1/2  print:block" />

      <div className={styles.no_print_area}>
        <label htmlFor="date-select" className={cn("hidden")}>
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

        <p className={cn("md:hidden")}>
          使用記録簿を印刷する場合は「Ctrl + 2」を押してください
        </p>

        <MyButton
          onClick={() => handlePrint("summary")}
          className={styles.print_button}
        >
          使用記録簿を印刷
        </MyButton>
      </div>

      <div className={`${styles.order_list_section} ${styles.no_print_area}`}>
        <div className={styles.no_print_area}>
          <h3>{formatDateTimeWithDay(targetDate)}</h3>
          <MyButton onClick={handleOpenCalendar}>日付を選択</MyButton>
        </div>
        {orders.length === 0 ? (
          <p className="no-data">該当するオーダーはありません。</p>
        ) : (
          <ul className={styles.order_list}>
            {orders.map((order) => (
              <li key={order.id} className={styles.order_item}>
                <div
                  className={cn(
                    "md:items-center",
                    styles.no_print_area,
                    styles.order_item_inner,
                  )}
                >
                  <p className={styles.order_time}>{order.exam_time}</p>
                  <div
                    className={cn(
                      "[grid-area:name]",
                      "lg:grid gap-4 grid-flow-col justify-start items-center",
                    )}
                  >
                    <p>{order.patient_id}</p>
                    <p className={cn("lg:text-2xl")}>
                      <PatientName
                        last_name_kanji={order.last_name_kanji}
                        last_name_kana={toKatakana(order.last_name_kana)}
                        first_name_kanji={order.first_name_kanji}
                        first_name_kana={toKatakana(order.first_name_kana)}
                      />
                    </p>
                  </div>
                  <p className={styles.order_year}>
                    {calculateAge(order.birth_date)}歳
                  </p>
                  <div className={styles.order_body}>
                    <p>
                      身長：{order.height ? `${order.height} cm` : "未登録"}
                    </p>
                    <p>
                      体重：{order.weight ? `${order.weight} kg` : "未登録"}
                    </p>
                  </div>
                  <p className={styles.order_name}>{order.exam_item}</p>
                  <div
                    className={cn(
                      "[grid-area:physician] justify-self-end",
                      styles.order_physician,
                    )}
                  >
                    <p>{order.requesting_department}</p>
                    <p>{order.requesting_physician}</p>
                  </div>

                  {(order.dosage_mbq ||
                    order.dosage_ml ||
                    order.remain_mbq ||
                    order.remain_ml) && <div>dosage</div>}

                  {NEEDS_PROCEDURE_ITEMS.includes(order.exam_item) && (
                    <>
                      <p className={styles.procedure_print_message}>
                        「標識手順書」を印刷するには「Ctrl + 2」を押してください
                      </p>

                      <MyButton
                        onClick={() =>
                          handlePrintIndividual("procedure", order.id)
                        }
                        className={styles.individual_print_button}
                      >
                        標識手順書を印刷
                      </MyButton>
                    </>
                  )}

                  <DeleteOrderButton
                    orderId={order.id}
                    onSuccess={() => fetchOrders(targetDate)}
                    className={styles.delete_button}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cn(styles.for_print)}>
        <div className={styles.report_title_area}>
          <h1 className={styles.report_title}>
            {HOSPITAL_NAME}　放射性医薬品使用記録簿
          </h1>

          <p className={styles.use_date}>
            使用日：{formatDateTimeWithDay(targetDate)}
          </p>
        </div>

        <ul className={cn("space-y-2")}>
          {orders.map((order) => {
            return (
              <li className={cn(styles.order_item)} key={order.patient_id}>
                <div className={`${styles.order_content_row_1}`}>
                  <div className={`${styles.order_content_item}`}>
                    <p>予約時間</p>
                    <p>{order.exam_time}</p>
                  </div>

                  <div className={`${styles.order_content_item}`}>
                    <p>氏名</p>
                    <p>
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
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.procedure_for_print}>
        {orders.map((order) => (
          <ProcedurePage
            key={`proc-${order.id}`}
            order={order}
            targetDate={targetDate}
          />
        ))}
      </div>
    </div>
  );
};
