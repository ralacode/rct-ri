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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = async () => {
    try {
      setIsLoading(true);
      const data = await invoke<Patient[]>("get_patients");
      setPatients(data);
    } catch (err) {
      setError(err as string);
      console.error(err);
    } finally {
      setIsLoading(false); // 🚀 成功・失敗に関わらず読み込み完了
    }
  };

  useEffect(() => {
    fetchPatients();

    // 🚀 150ミリ秒（0.15秒）経ってもロードが終わっていなければ、初めてダミーの表示フラグをtrueにする
    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, 150);

    // クリーンアップ（コンポーネントが消えたらタイマーを解除）
    return () => clearTimeout(timer);
  }, []);

  if (error) return <div className="text-red-500">エラー: {error}</div>;

  // 🚀 1. 読み込み中はダミー（PulseAnimation）を即座に表示する
  if (isLoading && showSkeleton) {
    return (
      <div className={cn("@container")}>
        <div className={cn("grid gap-4 content-start", "@md:grid-cols-2")}>
          <PulseAnimation />
          <PulseAnimation />
          <PulseAnimation />
          <PulseAnimation />
        </div>
      </div>
    );
  }

  if (isLoading && !showSkeleton) {
    return <div className="min-h-50" />; // 高さがガタつかないように最低限の余白だけ確保して静かに待つ
  }

  // 🚀 2. 読み込みが終わり、かつデータが本当に1件もない場合
  if (patients.length === 0) {
    return (
      <div className="text-gray-500 text-center py-4">
        登録されている患者はいません。
      </div>
    );
  }

  return (
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
            href={`/patient/detail/?id=${p.patient_id}`}
            className={cn(
              "block hover:bg-gray-200 transition-colors duration-300 rounded-md",
            )}
          >
            <FadeIn>
              <PatientCard patient={p} />
            </FadeIn>
          </a>
        </li>
      ))}
    </ul>
  );
};
