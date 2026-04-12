// src/components/PatientRegisterForm.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { validatePatientId } from "@lib/utils";
import { MyInput } from "@components/react/my-input";

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

    const validation = validatePatientId(patientId);
    if (!validation.isValid) {
      setIsError(true);
      setMessage(validation.errorMessage);
      return;
    }

    try {
      // lib.rs の add_patient コマンドを呼び出し
      await invoke("add_patient", {
        patientId: validation.normalizedId,
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
        <MyInput
          id="patientId"
          label="患者ID (10桁以内・数字のみ)"
          placeholder="例: 12345"
          required
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        />

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
