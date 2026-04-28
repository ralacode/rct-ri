// src/components/react/patient/detail.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import {
  calculateAge,
  examTimeSlots,
  formatDateString,
  formatDateTimeWithDay,
  toKatakana,
} from "@lib/utils";
import type { ExamOrder } from "@/types/exam_order";

interface Props {
  patientId: string | undefined;
}

export const PatientDetail: React.FC<Props> = ({ patientId }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [orders, setOrders] = useState<ExamOrder[]>([]);
  const [newExamDate, setNewExamDate] = useState("");
  const [newExamTime, setNewExamTime] = useState("8:30");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // useEffect(() => {
  //   const fetchPatientData = async () => {
  //     if (!patientId) return;

  //     try {
  //       // search_patients_cmd を呼び出し、キーワードに患者IDを渡す
  //       // この関数は Vec<Patient> (配列) を返します
  //       const results = await invoke<Patient[]>("search_patients_cmd", {
  //         keyword: patientId,
  //         sortDesc: false,
  //       });

  //       if (results.length > 0) {
  //         // 該当する患者が見つかった場合、最初の1件をセット
  //         setPatient(results[0]);
  //         setError(null);
  //       } else {
  //         setError("該当する患者が見つかりませんでした。");
  //       }
  //     } catch (err) {
  //       console.error("データ取得エラー:", err);
  //       setError("データの取得に失敗しました。");
  //     }
  //   };

  //   fetchPatientData();
  // }, [patientId]);

  useEffect(() => {
    fetchPatientData();
    fetchOrders();
  }, [patientId]);

  const fetchPatientData = async () => {
    if (!patientId) return;
    try {
      const results = await invoke<Patient[]>("search_patients_cmd", {
        keyword: patientId,
        sortDesc: false,
      });
      if (results.length > 0) {
        setPatient(results[0]);
      }
    } catch (err) {
      console.error("患者データ取得失敗:", err);
      setError("患者情報の取得に失敗しました。");
    }
  };

  const fetchOrders = async () => {
    if (!patientId) return;
    try {
      // まずDB上の内部IDを取得する必要があるため、patient state経由で取得
      // (実際の実装では patient.id が確定してから呼ぶなどの考慮が必要)
      const results = await invoke<Patient[]>("search_patients_cmd", {
        keyword: patientId,
        sortDesc: false,
      });
      if (results.length > 0) {
        const orderList = await invoke<ExamOrder[]>("get_exam_orders", {
          patientDbId: results[0].id,
        });
        setOrders(orderList);
      }
    } catch (err) {
      console.error("検査履歴取得失敗:", err);
    }
  };

  // 検査オーダー追加処理
  const handleAddOrder = async () => {
    if (!patient || !newExamDate || !newExamTime) return;

    try {
      await invoke("add_exam_order", {
        patientDbId: patient.id,
        examDate: newExamDate,
        examTime: newExamTime,
      });
      setNewExamDate("");
      setNewExamTime("8:30"); // 登録後にリセット
      fetchOrders(); // 一覧を再取得
    } catch (err) {
      alert("検査登録に失敗しました: " + err);
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

          <button onClick={handleAddOrder}>登録する</button>
        </div>
      </div>

      {/* 検査履歴一覧 */}
      <div>
        <h3>検査一覧</h3>

        {orders.length === 0 ? (
          <p className="text-gray-500">登録された検査はありません。</p>
        ) : (
          <div>
            {orders.map((order) => (
              <div key={order.id}>
                <p>検査日：{formatDateTimeWithDay(order.exam_date)}</p>
                <p>
                  <span className="exam-label">予約時間：</span>
                  {order.exam_time}
                </p>
                <p>登録日：{formatDateTimeWithDay(order.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
