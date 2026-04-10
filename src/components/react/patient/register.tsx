// src/components/PatientRegisterForm.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export const PatientRegisterForm = () => {
  const [patientId, setPatientId] = useState("");
  const [patientType, setPatientType] = useState("ri"); // 初期値
  const [message, setMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setMessage("");
    setSaveMessage("");
    setIsError(false);

    const normalized = patientId
      .trim() // 前後の空白削除
      .replace(/[０-９]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0xfee0),
      );

    if (!/^\d+$/.test(normalized)) {
      setMessage("数字のみ入力してください");
      return;
    }

    if (normalized.length > 10) {
      setMessage("10桁以内で入力してください");
      return;
    }

    try {
      // lib.rs の add_patient コマンドを呼び出し
      await invoke("add_patient", {
        patientId: normalized,
        patientType,
      });

      setSaveMessage(`${patientId}を登録しました`);
      setPatientId(""); // 入力欄をクリア
    } catch (err) {
      setIsError(true);
      setMessage(typeof err === "string" ? err : "エラーが発生しました");
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium mb-1">
            患者ID (10桁以内・数字のみ)
          </label>
          <input
            type="text"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="例: 12345"
            required
          />
        </div>

        <div>
          <label>区分</label>
          <select
            value={patientType}
            onChange={(e) => setPatientType(e.target.value)}
          >
            <option value="ri">ri</option>
            <option value="rt">rt</option>
          </select>
        </div>

        <button type="submit">登録する</button>
      </form>

      {saveMessage && <p>{saveMessage}</p>}

      {message && (
        <div
          className={`mt-4 p-2 rounded ${isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
        >
          {message}
        </div>
      )}
    </div>
  );
};
