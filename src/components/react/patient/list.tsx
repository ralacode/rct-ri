// src/components/react/patient/list.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import { Card } from "../card";
import { FadeIn } from "../fade-in";
import { calculateAge, cn, toKatakana } from "@/lib/utils";
import { PatientName } from "../patient-name";
import { PulseAnimation } from "../pulse-animation";
import { PatientCard } from "./patient-card";

// interface Patient {
//   id: number;
//   patient_id: string;
//   patient_type: string;
// }

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
    <div className="@container">
      {patients ? (
        <ul
          className={cn(
            "grid gap-4 content-start",
            "@md:grid-cols-2",
            "@xl:grid-cols-3",
          )}
        >
          {patients.slice(0, 6).map((p) => (
            <li key={p.id}>
              <a
                href={`/patient/detail?id=${p.patient_id}`}
                className={cn(
                  "block hover:bg-gray-200 transition-colors duration-300 rounded-md",
                )}
              >
                <FadeIn>
                  {/* <Card className={cn("grid grid-flow-col justify-between")}>
                    <div>
                      <div>{p.patient_id}</div>
                      <div>
                        <PatientName
                          last_name_kanji={p.last_name_kanji}
                          last_name_kana={toKatakana(p.last_name_kana)}
                          first_name_kanji={p.first_name_kanji}
                          first_name_kana={toKatakana(p.first_name_kana)}
                        />
                      </div>
                    </div>
                    <div className={cn("grid content-between")}>
                      <div className={cn("justify-self-end")}>{p.gender}</div>
                      <div>{calculateAge(p.birth_date)} 歳</div>
                    </div>
                  </Card> */}
                  <PatientCard patient={p} />
                </FadeIn>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className={cn("grid gap-4 content-start", "md:grid-cols-2")}>
          <PulseAnimation />
          <PulseAnimation />
          <PulseAnimation />
          <PulseAnimation />
        </div>
      )}
    </div>
  );
};
