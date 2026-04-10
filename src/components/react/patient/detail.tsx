// src/components/PatientDetail.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";

interface Props {
  patientId: string | undefined;
}

export const PatientDetail: React.FC<Props> = ({ patientId }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <div>{error}</div>;
  if (!patient) return <div>読み込み中...</div>;

  return (
    <div>
      <h2>患者詳細情報</h2>
      <p>
        表示中の患者ID: <span>{patient?.patient_id}</span>
      </p>
    </div>
  );
};
