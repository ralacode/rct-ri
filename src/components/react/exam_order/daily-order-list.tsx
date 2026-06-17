// src/components/react/exam_order/daily-order-list.tsx

import React, { useState, useEffect, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExamOrder, ExamOrderWithPatient } from "@/types/exam_order";
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
import { EditExamOrderModal } from "@components/react/exam_order/edit-exam-order-modal";
import { Card } from "@components/react/card";
import { BorderInGrid } from "@components/react/exam_order/border_in_grid/border-in-grid";
import { BorderInGridItem1 } from "@components/react/exam_order/border_in_grid/border-in-grid-item1";
import { BorderInGridContent1 } from "@components/react/exam_order/border_in_grid/border-in-grid-content1";
import { GridTemplate, GridTemplateItem } from "../grid-template";
import {
  InjectionDetails,
  InjectionDetailsContent,
} from "@components/react/exam_order/injection-details";

interface EditableOrder {
  id: number;
  dosage_mbq: number | null;
  dosage_ml: number | null;
  remain_mbq: number | null;
  remain_ml: number | null;
  injection_time: string;
}

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

const MemoizedProcedurePage = memo(ProcedurePage);

export const DailyOrderList: React.FC = () => {
  const [targetDate, setTargetDate] = useState(getTodayLocalString());
  const [orders, setOrders] = useState<ExamOrderWithPatient[]>([]);

  const [isEditDosage, setIsEditDosage] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<EditableOrder | null>(
    null,
  );

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

  const handleEditDosage = (order: EditableOrder) => {
    setSelectedOrder(order);
    setIsEditDosage(true);
  };

  const handleCloseEditDosage = () => {
    setIsEditDosage(false);
    setSelectedOrder(null);
  };

  const handleRefresh = () => {
    fetchOrders(targetDate); // 一覧データを再取得して画面を最新状態にする
  };

  return (
    <div className={cn("relative", styles.container)}>
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
              <li key={order.id}>
                <Card
                  className={cn(
                    "grid gap-4 content-start grid-cols-[minmax(0,auto)]",
                    styles.no_print_area,
                    // styles.order_item_inner,
                  )}
                >
                  <GridTemplate
                    className={cn(
                      "gap-y-4",
                      "grid-cols-[auto_1fr_auto] grid-rows-[repeat(4,minmax(0,auto))] [grid-template-areas:'time_time_time''examItem_examItem_examItem''name_._year''heightWeight_._physician']",
                      "md:grid-cols-[auto_1rem_auto_2rem_auto_2rem_auto_1fr_auto] md:grid-rows-[auto_auto] md:[grid-template-areas:'time_._examItem_examItem_examItem_examItem_examItem_examItem_examItem_''name_name_name_._year_._heightWeight_._physician']",
                    )}
                  >
                    <GridTemplateItem area="time" className={cn("self-center")}>
                      {order.exam_time}
                    </GridTemplateItem>

                    {/* 名前 */}
                    <GridTemplateItem
                      area="name"
                      className={cn(
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
                    </GridTemplateItem>

                    {/* 年齢 */}
                    <GridTemplateItem
                      area="year"
                      className={cn("self-center justify-self-end")}
                    >
                      {calculateAge(order.birth_date)}歳
                    </GridTemplateItem>

                    {/* 身長・体重 */}
                    <GridTemplateItem
                      area="heightWeight"
                      className={cn("md:self-center")}
                    >
                      <p>
                        身長：{order.height ? `${order.height} cm` : "未登録"}
                      </p>
                      <p>
                        体重：{order.weight ? `${order.weight} kg` : "未登録"}
                      </p>
                    </GridTemplateItem>

                    {/* オーダー名 */}
                    <GridTemplateItem
                      area="examItem"
                      className={cn(
                        "font-bold text",
                        "md:text-xl",
                        "lg:text-2xl",
                      )}
                    >
                      {order.exam_item}
                    </GridTemplateItem>
                    <GridTemplateItem
                      area="physician"
                      className={cn("justify-self-end", "md:self-center")}
                    >
                      <p>{order.requesting_department}</p>
                      <p>{order.requesting_physician}</p>
                    </GridTemplateItem>
                  </GridTemplate>

                  {(order.dosage_mbq !== null ||
                    order.dosage_ml !== null ||
                    order.remain_mbq !== null ||
                    order.remain_ml !== null ||
                    order.injection_time) && (
                    <div
                      className={cn(
                        "grid gap-2 content-start grid-flow-row",
                        "[grid-template-areas:'one_two''three_four']",
                        "lg:justify-end",
                      )}
                    >
                      {/* 投与時刻 */}
                      {(order.dosage_mbq !== null ||
                        order.dosage_ml !== null ||
                        order.injection_time) && (
                        <InjectionDetails className={cn("[grid-area:three]")}>
                          <div>投与時刻</div>
                          {order.injection_time ? (
                            <div className="justify-self-end tracking-widest">
                              {order.injection_time}
                            </div>
                          ) : (
                            <div className="justify-self-end tracking-widest">
                              --:--
                            </div>
                          )}
                        </InjectionDetails>
                      )}

                      {/* 投与量 */}
                      {(order.dosage_mbq !== null ||
                        order.dosage_ml !== null ||
                        order.injection_time) && (
                        <InjectionDetails className={cn("[grid-area:one]")}>
                          <div>投与量</div>
                          <InjectionDetailsContent>
                            {order.dosage_mbq !== null ? (
                              <div>{order.dosage_mbq} MBq</div>
                            ) : (
                              <div>- MBq</div>
                            )}
                            {order.dosage_ml !== null ? (
                              <div>{order.dosage_ml} mL</div>
                            ) : (
                              <div>- mL</div>
                            )}
                          </InjectionDetailsContent>
                        </InjectionDetails>
                      )}

                      {/* 残量 */}
                      {(order.dosage_mbq !== null ||
                        order.dosage_ml !== null ||
                        order.injection_time) && (
                        <InjectionDetails className={cn("[grid-area:two]")}>
                          <div>残量</div>
                          <InjectionDetailsContent>
                            {order.remain_mbq !== null ? (
                              <div>{order.remain_mbq} MBq</div>
                            ) : (
                              <div>- MBq</div>
                            )}
                            {order.remain_ml !== null ? (
                              <div>{order.remain_ml} mL</div>
                            ) : (
                              <div>- mL</div>
                            )}
                          </InjectionDetailsContent>
                        </InjectionDetails>
                      )}

                      {/* 実投与量 */}
                      {(order.dosage_mbq !== null ||
                        order.dosage_ml !== null ||
                        order.injection_time) && (
                        <InjectionDetails className={cn("[grid-area:four]")}>
                          <div>実投与量</div>
                          <InjectionDetailsContent>
                            {order.dosage_mbq !== null &&
                            order.remain_mbq !== null ? (
                              <div>
                                {(order.dosage_mbq - order.remain_mbq).toFixed(
                                  1,
                                )}{" "}
                                MBq
                              </div>
                            ) : (
                              <div>- MBq</div>
                            )}
                            {order.dosage_ml !== null &&
                            order.remain_ml !== null ? (
                              <div>
                                {(order.dosage_ml - order.remain_ml).toFixed(1)}{" "}
                                mL
                              </div>
                            ) : (
                              <div>- mL</div>
                            )}
                          </InjectionDetailsContent>
                        </InjectionDetails>
                      )}
                    </div>
                  )}

                  <div className={cn("grid gap-4 justify-items-end")}>
                    <div
                      className={cn(
                        "grid gap-4 content-start",
                        "md:grid-flow-col md:gap-2",
                      )}
                    >
                      {NEEDS_PROCEDURE_ITEMS.includes(order.exam_item) && (
                        <div>
                          <p className={cn("text-sm", "md:hidden")}>
                            「標識手順書」を印刷するには
                            <br />
                            「Ctrl + 2」を押してください
                          </p>

                          <MyButton
                            onClick={() =>
                              handlePrintIndividual("procedure", order.id)
                            }
                            className={cn("hidden", "md:block")}
                          >
                            標識手順書を印刷
                          </MyButton>
                        </div>
                      )}

                      {order.dosage_mbq ||
                      order.dosage_ml ||
                      order.remain_mbq ||
                      order.remain_ml ? (
                        <MyButton
                          onClick={() => handleEditDosage(order)}
                          className={cn("bg-blue-500 justify-self-end")}
                        >
                          投与量を編集
                        </MyButton>
                      ) : (
                        <MyButton
                          onClick={() => handleEditDosage(order)}
                          className={cn("justify-self-end")}
                        >
                          投与量を入力
                        </MyButton>
                      )}

                      <EditExamOrderModal
                        isOpen={isEditDosage}
                        onClose={handleCloseEditDosage}
                        onSuccess={handleRefresh}
                        order={selectedOrder}
                      />
                    </div>

                    <DeleteOrderButton
                      orderId={order.id}
                      onSuccess={() => fetchOrders(targetDate)}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isEditDosage && (
        <div
          className={cn(
            "hidden text-black",
            "print:grid",
            "[...[data-print-mode='summary']_&]:grid gap-4",
            styles.for_print,
          )}
        >
          <div className={cn("[...[data-print-mode='summary']_&]:block")}>
            <h1 className={"text-xl"}>
              {HOSPITAL_NAME}　放射性医薬品使用記録簿
            </h1>

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
                      <BorderInGridContent1>
                        {order.exam_time}
                      </BorderInGridContent1>
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
                      <BorderInGridContent1>
                        {order.gender}
                      </BorderInGridContent1>
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
                        className={cn(
                          styles.activity_volume,
                          styles.administered,
                        )}
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
      )}

      {!isEditDosage && (
        <div className={styles.procedure_for_print}>
          {orders.map((order) => (
            <MemoizedProcedurePage
              key={`proc-${order.id}`}
              order={order}
              targetDate={targetDate}
            />
          ))}
        </div>
      )}
    </div>
  );
};
