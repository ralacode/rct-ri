// src/components/react/patient/register.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  toKatakana,
  validateHiragana,
  validateKanjiName,
  validatePatientId,
} from "@lib/utils";
import { MyInput } from "@components/react/my-input";

export const PatientRegisterForm = () => {
  const [formData, setFormData] = useState({
    patient_id: "",
    patient_type: "ri",
    last_name_kanji: "",
    first_name_kanji: "",
    last_name_kana: "",
    first_name_kana: "",
    birth_date: "",
    height: "",
    weight: "",
  });

  const [message, setMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const [lastRegistered, setLastRegistered] = useState<any>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    setMessage("");
    setSaveMessage("");
    setLastRegistered(null);
  };

  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    // 前回の値より短ければ、削除中と判断してそのままの状態を受け入れる
    if (inputValue.length < formData.birth_date.length) {
      setFormData((prev) => ({ ...prev, birth_date: inputValue }));
      return;
    }

    // 1. 数字以外を除去
    let value = inputValue.replace(/\D/g, "");
    let formatted = "";

    // 2. 入力された数値の長さに応じて「 / 」を動的に挿入
    if (value.length > 0) {
      formatted = value.substring(0, 4);

      if (value.length >= 4) {
        formatted += " / ";
        if (value.length > 4) {
          formatted += value.substring(4, 6);
        }
        if (value.length >= 6) {
          formatted += " / ";
          if (value.length > 6) {
            formatted += value.substring(6, 8);
          }
        }
      }
    }

    setFormData((prev) => ({ ...prev, birth_date: formatted }));
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setMessage("");
    setSaveMessage("");
    setIsError(false);
    setLastRegistered(null);

    // 生年月日のバリデーション（スペースを許容する正規表現に変更）
    const birthDatePattern = /^\d{4} \/ \d{2} \/ \d{2}$/;
    if (!birthDatePattern.test(formData.birth_date)) {
      return setMessage("生年月日は YYYY / MM / DD 形式で入力してください");
    }

    // 日付として妥当かチェック
    // スペースを除去してから分割する
    const rawDate = formData.birth_date.replace(/\s+/g, "");
    const [y, m, d] = rawDate.split("/").map(Number);

    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return setMessage("有効な日付を入力してください");
    }

    // 1. バリデーション実行
    // utils.ts の戻り値が { isValid, errorMessage } なので、.isValid をチェックする
    const idRes = validatePatientId(formData.patient_id);
    if (!idRes.isValid) return setMessage(`患者ID: ${idRes.errorMessage}`);

    const lnkRes = validateKanjiName(formData.last_name_kanji);
    if (!lnkRes.isValid)
      return setMessage(`名字（漢字）: ${lnkRes.errorMessage}`);

    const fnkRes = validateKanjiName(formData.first_name_kanji);
    if (!fnkRes.isValid)
      return setMessage(`名前（漢字）: ${fnkRes.errorMessage}`);

    const lnaRes = validateHiragana(formData.last_name_kana);
    if (!lnaRes.isValid)
      return setMessage(`名字（かな）: ${lnaRes.errorMessage}`);

    const fnaRes = validateHiragana(formData.first_name_kana);
    if (!fnaRes.isValid)
      return setMessage(`名前（かな）: ${fnaRes.errorMessage}`);

    try {
      // 2. Rustコマンド呼び出し
      await invoke("add_patient", {
        patientId: idRes.normalizedId,
        patientType: formData.patient_type,
        lastNameKanji: formData.last_name_kanji,
        firstNameKanji: formData.first_name_kanji,
        lastNameKana: formData.last_name_kana,
        firstNameKana: formData.first_name_kana,
        birthDate: rawDate,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
      });

      setLastRegistered({ ...formData });
      setSaveMessage("success");

      // 登録成功時にフォームをリセット
      setFormData({
        patient_id: "",
        patient_type: "ri",
        last_name_kanji: "",
        first_name_kanji: "",
        last_name_kana: "",
        first_name_kana: "",
        birth_date: "",
        height: "",
        weight: "",
      });
    } catch (err) {
      setIsError(true);
      setMessage(String(err));
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <MyInput
          id="patient_id"
          label="患者ID"
          placeholder="例: 0000000123"
          required
          value={formData.patient_id}
          onChange={handleChange}
        />

        <div>
          <MyInput
            id="last_name_kanji"
            label="姓（漢字）"
            placeholder="例: 山田"
            required
            value={formData.last_name_kanji}
            onChange={handleChange}
          />
          <MyInput
            id="first_name_kanji"
            label="名（漢字）"
            placeholder="例: 太郎"
            required
            value={formData.first_name_kanji}
            onChange={handleChange}
          />
        </div>

        <div>
          <MyInput
            id="last_name_kana"
            label="姓（ふりがな）"
            placeholder="例: やまだ"
            required
            value={formData.last_name_kana}
            onChange={handleChange}
          />
          <MyInput
            id="first_name_kana"
            label="名（ふりがな）"
            placeholder="例: たろう"
            required
            value={formData.first_name_kana}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="patient_type">区分</label>
          <select
            id="patient_type"
            value={formData.patient_type}
            onChange={handleChange}
          >
            <option value="ri">ri</option>
            <option value="rt">rt</option>
          </select>
        </div>

        <MyInput
          id="birth_date"
          label="生年月日"
          placeholder="1989 / 09 / 11"
          required
          value={formData.birth_date}
          onChange={handleBirthDateChange}
          maxLength={14} // "YYYY / MM / DD" は最大14文字
        />

        <MyInput
          id="height"
          label="身長 (cm)"
          type="text"
          placeholder="170.5"
          value={formData.height}
          onChange={handleChange}
        />

        <MyInput
          id="weight"
          label="体重 (kg)"
          type="text"
          placeholder="50.5"
          value={formData.weight}
          onChange={handleChange}
        />

        <button type="submit">登録する</button>
      </form>

      {saveMessage === "success" && lastRegistered && (
        <p>
          <span>
            <ruby>
              {lastRegistered.last_name_kanji}
              <rt>{toKatakana(lastRegistered.last_name_kana)}</rt>
            </ruby>{" "}
            <ruby>
              {lastRegistered.first_name_kanji}
              <rt>{toKatakana(lastRegistered.first_name_kana)}</rt>
            </ruby>
          </span>{" "}
          様を登録しました
        </p>
      )}

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
