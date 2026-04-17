// src/components/react/detail.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import { toKatakana } from "@lib/utils";

interface Props {
  patientId: string | undefined;
}

export const PatientDetail: React.FC<Props> = ({ patientId }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!patientId) return;

      try {
        // search_patients_cmd を呼び出し、キーワードに患者IDを渡す
        // この関数は Vec<Patient> (配列) を返します
        const results = await invoke<Patient[]>("search_patients_cmd", {
          keyword: patientId,
          sortDesc: false,
        });

        if (results.length > 0) {
          // 該当する患者が見つかった場合、最初の1件をセット
          setPatient(results[0]);
          setError(null);
        } else {
          setError("該当する患者が見つかりませんでした。");
        }
      } catch (err) {
        console.error("データ取得エラー:", err);
        setError("データの取得に失敗しました。");
      }
    };

    fetchPatientData();
  }, [patientId]);

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
  } = patient;

  const formatValue = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "string" ? parseFloat(val) : val;
    return isNaN(num) ? null : num.toFixed(1);
  };

  return (
    <div>
      <h2>患者詳細情報</h2>

      <div className="detail-info-group">
        <p className="detail-item">
          患者ID: <span className="detail-value">{patient_id}</span>
        </p>
        <p className="detail-item">
          区分: <span className="detail-value">{patient_type}</span>
        </p>
        {/* ルビ（ふりがな）付きの氏名表示 */}
        <div className="detail-item name-display">
          氏名:
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
    </div>
  );
};
