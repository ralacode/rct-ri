// src/components/PatientRegisterForm.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  validateHiragana,
  validateKanjiName,
  validatePatientId,
} from "@lib/utils";
import { MyInput } from "@components/react/my-input";

export const PatientRegisterForm = () => {
  const [patientId, setPatientId] = useState("");
  const [patientType, setPatientType] = useState("ri"); // 初期値
  const [lastNameKanji, setLastNameKanji] = useState("");
  const [firstNameKanji, setFirstNameKanji] = useState("");
  const [lastNameKana, setLastNameKana] = useState("");
  const [firstNameKana, setFirstNameKana] = useState("");
  const [message, setMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setMessage("");
    setSaveMessage("");
    setIsError(false);

    // 1. 患者IDバリデーション
    const idValidation = validatePatientId(patientId);
    if (!idValidation.isValid) {
      setIsError(true);
      setMessage(idValidation.errorMessage);
      return;
    }

    // 2. 名字（漢字）バリデーション - スペースチェック
    const lnKanjiValidation = validateKanjiName(lastNameKanji);
    if (!lnKanjiValidation.isValid) {
      setIsError(true);
      setMessage(`名字（漢字）: ${lnKanjiValidation.errorMessage}`);
      return;
    }

    // 3. 名前（漢字）バリデーション - スペースチェック
    const fnKanjiValidation = validateKanjiName(firstNameKanji);
    if (!fnKanjiValidation.isValid) {
      setIsError(true);
      setMessage(`名前（漢字）: ${fnKanjiValidation.errorMessage}`);
      return;
    }

    // 4. 名字（かな）バリデーション - スペース/ひらがなチェック
    const lnKanaValidation = validateHiragana(lastNameKana);
    if (!lnKanaValidation.isValid) {
      setIsError(true);
      setMessage(`名字（かな）: ${lnKanaValidation.errorMessage}`);
      return;
    }

    // 5. 名前（かな）バリデーション - スペース/ひらがなチェック
    const fnKanaValidation = validateHiragana(firstNameKana);
    if (!fnKanaValidation.isValid) {
      setIsError(true);
      setMessage(`名前（かな）: ${fnKanaValidation.errorMessage}`);
      return;
    }

    try {
      // lib.rs の add_patient コマンドを呼び出し
      await invoke("add_patient", {
        patientId: idValidation.normalizedId,
        patientType,
        lastNameKanji,
        firstNameKanji,
        lastNameKana,
        firstNameKana,
      });

      setSaveMessage(`${lastNameKanji} ${firstNameKanji} 様を登録しました`);

      // 入力欄をクリア
      setPatientId("");
      setLastNameKanji("");
      setFirstNameKanji("");
      setLastNameKana("");
      setFirstNameKana("");
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
          onChange={(e) => {
            setPatientId(e.target.value);
            setMessage("");
          }}
        />

        <div className="name-fields">
          <MyInput
            id="lastNameKanji"
            label="姓"
            placeholder="例: 山田"
            required
            value={lastNameKanji}
            onChange={(e) => {
              setLastNameKanji(e.target.value);
              setMessage("");
            }}
          />
          <MyInput
            id="firstNameKanji"
            label="名"
            placeholder="例: 太郎"
            required
            value={firstNameKanji}
            onChange={(e) => {
              setFirstNameKanji(e.target.value);
              setMessage("");
            }}
          />
        </div>

        <div className="name-fields">
          <MyInput
            id="lastNameKana"
            label="姓（ふりがな）"
            placeholder="例: やまだ"
            required
            value={lastNameKana}
            onChange={(e) => {
              setLastNameKana(e.target.value);
              setMessage("");
            }}
          />
          <MyInput
            id="firstNameKana"
            label="名（ふりがな）"
            placeholder="例: たろう"
            required
            value={firstNameKana}
            onChange={(e) => {
              setFirstNameKana(e.target.value);
              setMessage("");
            }}
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
