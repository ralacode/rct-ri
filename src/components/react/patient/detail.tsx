// src/components/react/patient/detail.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import {
  calculateAge,
  DEPARTMENTS,
  examTimeSlots,
  formatDateString,
  formatDateTimeWithDay,
  toKatakana,
} from "@lib/utils";
import type { ExamOrder } from "@/types/exam_order";
import { DatalistInput } from "../datalist-input";

export const PatientDetail: React.FC = () => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [orders, setOrders] = useState<ExamOrder[]>([]);
  const [newExamDate, setNewExamDate] = useState("");
  const [newExamTime, setNewExamTime] = useState("8:30");
  const [dept, setDept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // 1. URLのクエリパラメータからIDを取得する関数
  const getPatientIdFromUrl = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("id");
    }
    return null;
  };

  // 2. データロード処理（患者情報 + 検査履歴）
  const loadAllData = async (patientIdStr: string) => {
    try {
      // 1. 患者情報の取得
      // Rust側の引数名は 'keyword'。第二引数の 'sortDesc' も必須です。
      const patients = await invoke<Patient[]>("search_patients_cmd", {
        keyword: patientIdStr,
        sortDesc: false,
      });

      if (patients && patients.length > 0) {
        const p = patients[0];
        setPatient(p);

        // 2. 検査履歴の取得
        // Rust側のコマンド名は 'get_exam_orders'
        // 引数名は 'patientDbId' で、型は数値(i32)が必要です。
        try {
          const orderResults = await invoke<ExamOrder[]>("get_exam_orders", {
            patientDbId: p.id,
          });
          setOrders(orderResults || []);
        } catch (e) {
          console.error("検査履歴の取得失敗:", e);
        }
      } else {
        setError(`患者ID: ${patientIdStr} が見つかりませんでした。`);
      }
    } catch (err) {
      console.error("Invoke Error:", err);
      setError(
        "データベース接続エラーが発生しました。詳細はコンソールを確認してください。",
      );
    }
  };

  useEffect(() => {
    const id = getPatientIdFromUrl();
    if (id) {
      loadAllData(id);
    } else {
      setError("患者IDが指定されていません。");
    }
  }, []);

  const handleAddOrder = async () => {
    if (!patient) return;
    if (!newExamDate || !dept) {
      alert("検査日と依頼科を選択してください。");
      return;
    }

    try {
      // Rust側は 'add_exam_order' で、引数は 'patientDbId' (数値)
      await invoke("add_exam_order", {
        patientDbId: patient.id,
        examDate: newExamDate,
        examTime: newExamTime,
        requestingDepartment: dept,
      });

      setNewExamDate("");
      setNewExamTime("8:30");
      setDept("");

      const id = getPatientIdFromUrl();
      if (id) loadAllData(id);
    } catch (err) {
      alert("検査登録に失敗しました。");
    }
  };

  // 実際の削除実行
  const executeDelete = async () => {
    if (!patient) return;

    setIsDeleting(true);
    try {
      await invoke("remove_patient", { id: patient.id });
      window.location.href = "/patient/list/";
    } catch (err) {
      console.error("削除エラー:", err);
      alert("削除に失敗しました。");
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  if (error) return <div>{error}</div>;
  if (!patient) return <div>読み込み中...</div>;

  const {
    patient_id,
    patient_type,
    last_name_kanji,
    last_name_kana,
    first_name_kanji,
    first_name_kana,
    height,
    weight,
    birth_date,
    gender,
    created_at,
  } = patient;

  const formatValue = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "string" ? parseFloat(val) : val;
    return isNaN(num) ? null : num.toFixed(1);
  };

  return (
    <div>
      {/* 患者基本情報セクション */}
      <div className="detail-info-group">
        <p>{patient_id}</p>

        {/* ルビ（ふりがな）付きの氏名表示 */}
        <div className="detail-item name-display">
          <span className="detail-value">
            <ruby className="name-ruby">
              {last_name_kanji}
              <rt className="name-rt">{toKatakana(last_name_kana)}</rt>
            </ruby>{" "}
            <ruby className="name-ruby">
              {first_name_kanji}
              <rt className="name-rt">{toKatakana(first_name_kana)}</rt>
            </ruby>
          </span>
        </div>

        <div className="detail-item">
          生年月日：
          <span className="detail-value">{formatDateString(birth_date)}</span>
        </div>

        <div className="detail-item">
          登録日：
          <span className="detail-value">
            {formatDateTimeWithDay(created_at)}
          </span>
        </div>

        <div className="detail-item">
          年齢：
          <span className="detail-value">
            {calculateAge(birth_date) !== null
              ? `${calculateAge(birth_date)}歳`
              : "---"}
          </span>
        </div>

        <div className="detail-item">
          性別：<span className="detail-value">{gender}</span>
        </div>

        <div className="detail-item">
          身長：
          <span className="detail-value">
            {formatValue(height) ? `${formatValue(height)} cm` : "未登録"}
          </span>
        </div>

        <div className="detail-item">
          体重：
          <span className="detail-value">
            {formatValue(weight) ? `${formatValue(weight)} kg` : "未登録"}
          </span>
        </div>
      </div>

      {/* 患者削除ボタン */}
      <div className="action-area">
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="delete-init-button"
          >
            この患者を削除する
          </button>
        ) : (
          <div className="delete-confirmation">
            <p className="confirm-text">本当に削除してもよろしいですか？</p>
            <button
              onClick={executeDelete}
              disabled={isDeleting}
              className="delete-confirm-button"
            >
              {isDeleting ? "削除中..." : "はい"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}
              className="delete-cancel-button"
            >
              いいえ
            </button>
          </div>
        )}
      </div>

      {/* 検査登録フォーム */}
      <div>
        <h3>新規検査登録</h3>

        <div>
          <div>
            <input
              type="date"
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
              className="exam-date-input"
            />

            <select
              value={newExamTime}
              onChange={(e) => setNewExamTime(e.target.value)}
              className="exam-time-select"
            >
              {examTimeSlots.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          <DatalistInput
            id="requesting_department"
            label="依頼科："
            list="requesting_department_list"
            placeholder="依頼科を入力..."
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            options={DEPARTMENTS}
          />

          {/* <div>
            <label htmlFor="requesting_department">依頼科検索:</label>
            <input
              id="requesting_department"
              name="requesting_department"
              type="text"
              list="requesting_department_list"
              placeholder="依頼科を入力..."
              value={dept}
              onChange={(e) => setDept(e.target.value)}
            />
            <datalist id="requesting_department_list">
              {DEPARTMENTS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div> */}

          <button onClick={handleAddOrder}>登録する</button>
        </div>
      </div>

      {/* 検査履歴一覧 */}
      <div>
        <h3>検査一覧</h3>

        {orders.length === 0 ? (
          <p className="text-gray-500">登録された検査はありません。</p>
        ) : (
          <div style={{ display: "grid", gap: "16px", justifyItems: "start" }}>
            {orders.map((order) => (
              <div key={order.id} style={{ border: "solid 1px #ddd" }}>
                <p>検査日：{formatDateTimeWithDay(order.exam_date)}</p>
                <p>
                  <span className="exam-label">予約時間：</span>
                  {order.exam_time}
                </p>
                <p>登録日：{formatDateTimeWithDay(order.created_at)}</p>
                <p>依頼科：{order.requesting_department}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <a href="/patient/list/">患者一覧</a>
      </div>
    </div>
  );
};
