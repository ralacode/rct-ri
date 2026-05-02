// src/components/react/exam_order/daily-list.tsx

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import {
  calculateAge,
  formatDateTimeWithDay,
  getTodayLocalString,
  toKatakana,
} from "@lib/utils";

export const DailyOrderList: React.FC = () => {
  // 初期値は今日の日付 (YYYY-MM-DD)
  const [targetDate, setTargetDate] = useState(getTodayLocalString());
  const [orders, setOrders] = useState<ExamOrderWithPatient[]>([]);

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

  // const {id, exam_time, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, requesting_department, requesting_physician} = order

  return (
    <div className="daily-order-container">
      <div className="order-filter">
        <label htmlFor="date-select">表示日:</label>
        <input
          type="date"
          id="date-select"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="date-input"
        />
      </div>

      <div className="order-list-section">
        <h3>{formatDateTimeWithDay(targetDate)} の検査一覧</h3>
        {orders.length === 0 ? (
          <p className="no-data">該当するオーダーはありません。</p>
        ) : (
          <ul className="order-list">
            {orders.map((order) => (
              <li key={order.id} className="order-item">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
