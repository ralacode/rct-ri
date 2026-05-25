// src/components/react/exam_order/daily-order-list.tsx

import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  deleteOrder,
  formatDateTimeWithDay,
  getTodayLocalString,
  NEEDS_PROCEDURE_ITEMS,
  toKatakana,
} from "@lib/utils";
import styles from "@styles/daily-order-list.module.css";
import { DeleteOrderButton } from "@components/react/exam_order/delete-order-button";
import { MyButton } from "../my-button";
import { PatientName } from "@components/react/patient-name";

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
    <div className={styles.container}>
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

        <p className={styles.print_button_message}>
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
                  className={`${styles.no_print_area} ${styles.order_item_inner}`}
                >
                  <p className={styles.order_time}>{order.exam_time}</p>
                  <div className={styles.order_patient}>
                    <p>{order.patient_id}</p>
                    <p>
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
                  <div className={styles.order_physician}>
                    <p>{order.requesting_department}</p>
                    <p>{order.requesting_physician}</p>
                  </div>

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

      <div className={`${styles.for_print}`}>
        <div className={styles.report_title_area}>
          <h1 className={styles.report_title}>
            熊本市立熊本市民病院RI検査室　放射性医薬品使用記録簿
          </h1>

          <p className={styles.use_date}>
            使用日：{formatDateTimeWithDay(targetDate)}
          </p>
        </div>

        <ul className={styles.order_list}>
          {orders.map((order) => {
            return (
              <li className={styles.order_item}>
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
          <div
            key={`proc-${order.id}`}
            className={`${styles.procedure_page} grid gap-2`}
            id={`print-target-${order.id}`}
          >
            {order.exam_item === "センチネルリンパ節シンチ" ? (
              <h1 className="text-2xl">テクネフチン酸キットの調整手順と記録</h1>
            ) : (
              <h1>標識手順書</h1>
            )}

            {/* 調整日 */}
            <p className="justify-self-end">
              調整日：{formatDateTimeWithDay(targetDate)}
            </p>

            <div className="grid grid-flow-col gap-16 justify-start">
              <div>
                <p>{order.patient_id}</p>
                <p>
                  <PatientName
                    last_name_kanji={order.last_name_kanji}
                    last_name_kana={toKatakana(order.last_name_kana)}
                    first_name_kanji={order.first_name_kanji}
                    first_name_kana={toKatakana(order.first_name_kana)}
                  />
                </p>
              </div>

              <div style={{ display: "grid", alignContent: "space-between" }}>
                <p>{order.exam_item}</p>

                <div className={styles.p_patient_year}>
                  <p>{calculateAge(order.birth_date)} 歳</p>
                  <p>{order.gender}性</p>
                  {order.weight ? (
                    <p>{order.weight} kg</p>
                  ) : (
                    <div className={styles.white_space_weight}>
                      <span style={{ borderBottom: "solid 2px black" }}></span>
                      <span>kg</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ジェネレータから溶出 */}
            <div className="grid grid-flow-col justify-between">
              <div>
                <h2>【ジェネレータから溶出】</h2>
                <div className="pl-4">
                  <p className="text-sm">
                    ジェネレータ情報は「ジェネレータ溶出記録」参照
                  </p>
                  <ul className="grid gap-1">
                    <li className="grid grid-flow-col gap-4 justify-start">
                      <p className="grid grid-flow-col gap-2">
                        <span>□</span>
                        <span>溶出通番</span>
                      </p>
                      <div className="border-b-2 border-black w-32"></div>
                    </li>
                    <li className="grid grid-flow-col gap-2 justify-start">
                      <span>□</span>
                      <span>針の交換</span>
                    </li>
                    <li className="grid grid-flow-col gap-2 justify-start">
                      <span>□</span>
                      <span>溶出バイアルのゴム栓の消毒</span>
                    </li>
                    <li className="grid grid-flow-col gap-8 justify-start">
                      <p className="grid grid-flow-col gap-2">
                        <span>□</span>
                        <span>溶出量</span>
                      </p>
                      <div className="grid grid-flow-col">
                        <div className="border-b-2 border-black w-24"></div>
                        <p>MBq</p>
                      </div>
                      <div className="grid grid-flow-col">
                        <div className="border-b-2 border-black w-16"></div>
                        <p>mL</p>
                      </div>
                    </li>
                    <li className="grid grid-flow-col gap-4 justify-start">
                      <p className="grid grid-flow-col gap-2">
                        <span>□</span>
                        <span>溶出時刻</span>
                      </p>
                      <div className="border-b-2 border-black w-32 text-center">
                        :
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-gray-200 pl-4 pr-4 pb-4 grid">
                <h3 className="text-lg">【テクネチウム注射液】</h3>
                <div className="border border-black bg-white pt-2 pl-4 pr-4 pb-4 grid content-between">
                  <p className="text-sm">テクネシンチまたはテクネゾール</p>
                  <p>製造番号：</p>
                  <p>放射能　：</p>
                  <p>検定日時：</p>
                </div>
              </div>
            </div>

            {/* 希釈・濃度調整 */}
            <div>
              <div className="grid grid-flow-col justify-start items-end">
                <h2>【希釈・濃度調整】</h2>
                <p>
                  （手順書や添付文書に基づいた目標量　18.5～111 MBq / 2～8 mL）
                </p>
              </div>
              <ul className="grid gap-1 pl-4">
                <li className="grid grid-flow-col gap-4 justify-start">
                  <p className="grid grid-flow-col gap-2">
                    <span>□</span>
                    <span>（溶出）バイアルのゴム栓の消毒</span>
                  </p>
                </li>
                <li className="grid grid-flow-col gap-8 justify-start">
                  <p className="grid grid-flow-col gap-2">
                    <span>□</span>
                    <span>（溶出）バイアルからの抜き取り量</span>
                  </p>
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-24"></div>
                    <p>MBq</p>
                  </div>
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-16"></div>
                    <p>mL</p>
                  </div>
                </li>
                <li className="grid grid-flow-col gap-44 justify-start">
                  <p className="grid grid-flow-col gap-2">
                    <span>□</span>
                    <span>希釈・濃度調整に用いる生理食塩液量</span>
                  </p>
                  <div className="grid grid-flow-col">
                    <div className="border-b-2 border-black w-16"></div>
                    <p>mL</p>
                  </div>
                </li>
                <li className="grid grid-flow-col gap-24 justify-start">
                  <p className="grid grid-flow-col gap-2">
                    <span>□</span>
                    <span>調整済テクネチウム溶液量</span>
                  </p>
                  <div className="grid gap gap-8 grid-flow-col justify-start">
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-24"></div>
                      <p>MBq</p>
                    </div>
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-16"></div>
                      <p>mL ・・・(a)</p>
                    </div>
                  </div>
                </li>
                <li>
                  <p className="grid grid-flow-col gap-4 justify-start">
                    <span></span>
                    <span className="font-bold">
                      （希釈・濃度調整終了時刻　　　:　　　）
                    </span>
                  </p>
                </li>
              </ul>
            </div>

            {/* 標識 */}
            <div className="grid grid-flow-col justify-between items-start">
              <div>
                <h2>【標識】</h2>
                <ul className="grid gap-1 pl-4">
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>常温戻し時刻 (　　　：　　　)</span>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>キットバイアルゴム栓の消毒</span>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>内容物の確認</span>
                  </li>
                  <li>
                    <div className="grid grid-flow-col gap-2 justify-start">
                      <span>□</span>
                      <p>未使用注射針筒で(a)をキットバイアルに</p>
                    </div>
                    <div className="grid grid-flow-col justify-start pl-6">
                      <div className="grid grid-flow-col">
                        <div className="border-b-2 border-black w-16"></div>
                        <p>mL</p>
                      </div>
                      <p>追加</p>
                    </div>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>振とう</span>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>内容物の溶解と異物・異常着色の確認</span>
                  </li>
                  <li className="pl-5 font-bold">
                    （標識終了時刻　　　：　　　）
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>標識後静置不要 ・・・(b)</span>
                  </li>
                </ul>
              </div>

              <div className="border border-black pl-4 pr-4 pb-8 pt-8 grid gap-2">
                <h3 className="text-lg">キットバイアル情報</h3>
                <ul>
                  <li>製品名　：テクネフチン酸キット</li>
                  <li>製造番号：</li>
                  <li>有効期限：</li>
                </ul>
              </div>
            </div>

            {/* 分注 */}
            <div>
              <div className="grid grid-flow-col justify-start items-end">
                <h2>【分注】</h2>
                <p>　　(目標：　　　　MBq)</p>
              </div>
              <ul className="grid gap-1 pl-4">
                <li className="grid grid-flow-col gap-2 justify-start">
                  <span>□</span>
                  <span>未使用の注射針、注射筒を用意する</span>
                </li>
                <li className="grid grid-flow-col gap-28 justify-start">
                  <p className="grid grid-flow-col gap-2">
                    <span>□</span>
                    <span>(b)から抜き取った標識薬</span>
                  </p>
                  <div className="grid grid-flow-col gap-8 justify-start">
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-24"></div>
                      <p>MBq</p>
                    </div>
                    <div className="grid grid-flow-col">
                      <div className="border-b-2 border-black w-16"></div>
                      <p>mL ・・・(c)</p>
                    </div>
                  </div>
                </li>
                <li className="font-bold pl-5">
                  （分注終了時刻　　　：　　　）
                </li>
              </ul>
            </div>

            {/* 投与準備 */}
            <div className="grid grid-flow-col justify-between items-end">
              {/* 投与準備（左側） */}
              <div>
                <h2>【投与準備】</h2>
                <ul className="grid gap-1 pl-4">
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>誤投与防止対策（注射筒(c)へのラベル貼付）</span>
                  </li>
                  <li className="grid grid-flow-col gap-2 justify-start">
                    <span>□</span>
                    <span>貯蔵（保管）箱内にて整頓と保管</span>
                  </li>
                  <li className="font-bold pl-5">
                    （調製終了時刻　　　：　　　）
                  </li>
                  <li className="border-b border-black justify-self-start pl-4 pr-4">
                    標識後できるだけ早く投与
                  </li>
                </ul>
              </div>

              {/* 投与準備（右側） */}
              <div className="grid grid-cols-[repeat(3,80px)] gap-6 text-center">
                <div className="border border-black">
                  <p className="border-b border-black text-sm">調製担当者</p>
                  <div className="h-16"></div>
                </div>
                <div className="border border-black">
                  <p className="border-b border-black text-sm">施用者</p>
                  <div className="h-16"></div>
                </div>
                <div className="border border-black">
                  <p className="border-b border-black text-sm">管理者</p>
                  <div className="h-16"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
