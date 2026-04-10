// src/components/PatientList.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Patient {
  id: number;
  patient_id: string;
  patient_type: string;
}

export const PatientList = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = async () => {
    try {
      // lib.rsのget_patientsを呼び出し
      const data = await invoke<Patient[]>("get_patients");
      setPatients(data);
    } catch (err) {
      setError(err as string);
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  if (error) return <div className="text-red-500">エラー: {error}</div>;

  return (
    <>
      {patients.map((p) => (
        <div key={p.id}>
          <div>
            <a href={`/patient/${p.patient_id}/`}>{p.patient_id}</a>
          </div>
          <p>{p.patient_type}</p>
        </div>
      ))}
      {patients.length === 0 && (
        <div>
          <p>患者が登録されていません。</p>
        </div>
      )}
    </>
  );
};
