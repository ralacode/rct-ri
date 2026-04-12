// src/components/react/patient/edit.tsx
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import { validatePatientId } from "@lib/utils";
import { MyInput } from "../my-input";

export const PatientEdit = ({ patientId }: { patientId: string }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [newPatientId, setNewPatientId] = useState("");
  const [patientType, setPatientType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // 1. 現在のデータを取得
  useEffect(() => {
    const fetchPatient = async () => {
      try {
        // キーワード検索を利用して対象の患者を特定
        const results: Patient[] = await invoke("search_patients_cmd", {
          keyword: patientId,
          sortDesc: false,
        });

        const target = results.find((p) => p.patient_id === patientId);
        if (target) {
          setPatient(target);
          setNewPatientId(target.patient_id);
          setPatientType(target.patient_type);
        } else {
          setError("患者が見つかりませんでした");
        }
      } catch (err) {
        setError("データ取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [patientId]);

  // 2. 更新処理
  const handleUpdate = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError("");

    if (!patient) return;

    const validation = validatePatientId(newPatientId);
    if (!validation.isValid) {
      setError(validation.errorMessage);
      return;
    }

    try {
      // Rustの edit_patient を呼び出し
      await invoke("edit_patient", {
        id: patient.id,
        patientId: validation.normalizedId,
        patientType,
      });

      // 更新成功後、詳細画面へ戻る
      window.location.href = `/patient/${validation.normalizedId}/`;
    } catch (err) {
      setError(String(err)); // Rust側のResult::Errがここに入る
    }
  };

  if (loading) return <p>読み込み中...</p>;
  if (error && !patient) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div>
      <h2>患者情報の編集</h2>
      <form onSubmit={handleUpdate}>
        <MyInput
          id="patientId"
          label="患者ID: "
          required
          value={newPatientId}
          onChange={(e) => setNewPatientId(e.target.value)}
        />

        <div>
          <label>区分: </label>
          <select
            value={patientType}
            onChange={(e) => setPatientType(e.target.value)}
          >
            <option value="ri">RI</option>
            <option value="rt">RT</option>
          </select>
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit">更新保存</button>
        <button type="button" onClick={() => window.history.back()}>
          キャンセル
        </button>
      </form>
    </div>
  );
};
