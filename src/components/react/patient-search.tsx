import { useEffect, useState, type FC } from "react";
import { MyInput } from "./my-input";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import { PatientCard } from "./patient/patient-card";
import { PulseAnimation } from "./pulse-animation";
import { cn } from "@/lib/utils";

export const PatientSearch: FC = () => {
  const [keyword, setKeyword] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 入力値が空の場合は、検索を行わず結果をクリアする
    if (!keyword.trim()) {
      setPatients([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // タイピングごとの連続APIコールを防ぐデバウンス処理（300ms）
    const delayDebounceFn = setTimeout(async () => {
      try {
        // Rustの search_patients_cmd を呼び出し
        // 引数名は lib.rs の記述（keyword, sort_desc）に合わせる
        const result: Patient[] = await invoke("search_patients_cmd", {
          keyword: keyword,
          sortDesc: true, // 降順ソート（必要に応じて変更してください）
        });
        setPatients(result);
        setError(null);
      } catch (err) {
        console.error("検索エラー:", err);
        setError("患者データの取得に失敗しました。");
      } finally {
        setIsLoading(false);
      }
    }, 300);

    // クリーンアップ処理
    return () => clearTimeout(delayDebounceFn);
  }, [keyword]);

  return (
    <div className={cn("grid gap-4 content-start")}>
      <div className={cn("grid gap-4", "@2xl:grid-cols-3")}>
        <MyInput
          label="検索入力エリア"
          labelClassName="sr-only"
          id="search-patient"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="患者ID、患者名などを入力..."
          className={cn("@2xl:col-start-2")}
        />
      </div>

      {/* ローディング表示 */}
      {isLoading && (
        <div className={cn("grid gap-4 content-start", "@md:grid-cols-2")}>
          <PulseAnimation />
        </div>
      )}

      {/* エラー表示 */}
      {error && <div className="error-message">{error}</div>}

      {keyword.trim() && !isLoading && (
        <>
          {patients.length === 0 ? (
            <p className="no-results">該当する患者が見つかりません。</p>
          ) : (
            <ul
              className={cn(
                "grid gap-4 content-start",
                "@md:grid-cols-2",
                "@3xl:grid-cols-3",
              )}
            >
              {patients.map((patient) => (
                <li key={patient.id}>
                  <a
                    href={`/patient/detail?id=${patient.patient_id}`}
                    className={cn(
                      "block hover:bg-gray-200 transition-colors duration-300 rounded-md",
                    )}
                  >
                    <PatientCard patient={patient} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
