// src/components/react/patient/register.tsx
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  toKatakana,
  validateDateString,
  validateHiragana,
  validateKanjiName,
  validatePatientId,
} from "@lib/utils";
import { MyInput } from "@components/react/my-input";
import { Input } from "@/components/ui/input";
import { MyButton } from "../my-button";

const getTodayFormatted = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y} / ${m} / ${d}`;
};

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
    gender: "男",
    created_at: getTodayFormatted(),
  });

  const [message, setMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [lastRegistered, setLastRegistered] = useState<any>(null);

  const formatDatePicker = (value: string, prevValue: string) => {
    const numbers = value.replace(/\D/g, "");
    if (value.length < prevValue.length) return value; // 削除時はそのまま

    if (numbers.length <= 4) return numbers;
    if (numbers.length <= 6)
      return `${numbers.slice(0, 4)} / ${numbers.slice(4)}`;
    return `${numbers.slice(0, 4)} / ${numbers.slice(4, 6)} / ${numbers.slice(6, 8)}`;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { id, value, name } = e.target;
    // ラジオボタンの場合は name 属性をキーにする
    const key = id || name;
    setFormData((prev) => ({ ...prev, [key]: value }));
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

  const handleRegistrationDateChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    // const formatted = formatDatePicker(e.target.value, formData.created_at);
    const inputValue = e.target.value;

    // 前回の値より短ければ、削除中と判断してそのままの状態を受け入れる
    if (inputValue.length < formData.created_at.length) {
      setFormData((prev) => ({ ...prev, created_at: inputValue }));
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

    setFormData((prev) => ({ ...prev, created_at: formatted }));
  };

  const isFutureDate = (dateStr: string): boolean => {
    if (!dateStr) return false;

    // スペースを除去して Date オブジェクトを作成
    const inputDate = new Date(dateStr.replace(/\s+/g, ""));
    if (isNaN(inputDate.getTime())) return false;

    const today = new Date();
    // 時刻を 00:00:00 にリセットして日付のみで比較
    today.setHours(0, 0, 0, 0);

    return inputDate > today;
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setMessage("保存中...");
    setSaveMessage("");
    setIsError(false);
    setLastRegistered(null);

    // 日付チェック用の設定
    // const datePattern = /^\d{4} \/ \d{2} \/ \d{2}$/;
    // const dateFields = [
    //   { key: "birth_date", label: "生年月日" },
    //   { key: "created_at", label: "登録日" },
    // ] as const;

    // const today = new Date();
    // today.setHours(0, 0, 0, 0);

    // for (const field of dateFields) {
    //   const rawValue = formData[field.key];

    //   // ① 形式チェック (YYYY / MM / DD)
    //   if (!datePattern.test(rawValue)) {
    //     setIsError(true);
    //     return setMessage(
    //       `${field.label}は YYYY / MM / DD 形式で入力してください`,
    //     );
    //   }

    //   // ② 実在チェック (2月30日などの判定)
    //   const cleanDateStr = rawValue.replace(/\s+/g, "");
    //   const [y, m, d] = cleanDateStr.split("/").map(Number);
    //   const dateObj = new Date(y, m - 1, d);

    //   if (
    //     dateObj.getFullYear() !== y ||
    //     dateObj.getMonth() !== m - 1 ||
    //     dateObj.getDate() !== d
    //   ) {
    //     setIsError(true);
    //     return setMessage(`${field.label}の日付が変です`);
    //   }

    //   // ③ 未来日チェック
    //   if (dateObj > today) {
    //     setIsError(true);
    //     return setMessage(`${field.label}に未来の日付は入力できません`);
    //   }
    // }

    const dateFields = [
      { key: "birth_date", label: "生年月日" },
      { key: "created_at", label: "登録日" },
    ] as const;

    for (const field of dateFields) {
      const error = validateDateString(formData[field.key], field.label);
      if (error) {
        setIsError(true);
        return setMessage(error);
      }
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

    const cleanBirthDate = formData.birth_date.replace(/\s+/g, "");
    const cleanCreatedAt = formData.created_at.replace(/\s+/g, "");

    try {
      // 2. Rustコマンド呼び出し
      await invoke("add_patient", {
        patientId: idRes.normalizedId,
        patientType: formData.patient_type,
        lastNameKanji: formData.last_name_kanji,
        firstNameKanji: formData.first_name_kanji,
        lastNameKana: formData.last_name_kana,
        firstNameKana: formData.first_name_kana,
        birthDate: cleanBirthDate,
        gender: formData.gender,
        height: formData.height ? parseFloat(formData.height) : null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        created_at: cleanCreatedAt,
      });

      setLastRegistered({ ...formData });
      setSaveMessage("success");
      setMessage("");

      // 登録成功時にフォームをリセット
      setFormData({
        patient_id: "",
        patient_type: "ri",
        last_name_kanji: "",
        first_name_kanji: "",
        last_name_kana: "",
        first_name_kana: "",
        birth_date: "",
        gender: "男",
        height: "",
        weight: "",
        created_at: getTodayFormatted(),
      });
    } catch (err) {
      setIsError(true);
      setMessage(`エラー: ${err}`);
      setSaveMessage("error");
    }
  };

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <MyInput
          id="patient_id"
          label="患者ID"
          placeholder="例: 0000000123"
          required
          value={formData.patient_id}
          onChange={handleChange}
        />

        <div className="grid grid-flow-col gap-2 justify-start">
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

        <div className="grid grid-flow-col gap-2 justify-start">
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

        <div className="hidden">
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

        <div className="gender-field grid gap-1">
          <label>性別</label>
          {/* <div className="gender-options">
            <label>
              <input
                type="radio"
                name="gender"
                value="男"
                checked={formData.gender === "男"}
                onChange={handleChange}
              />
              男
            </label>
            <label>
              <input
                type="radio"
                name="gender"
                value="女"
                checked={formData.gender === "女"}
                onChange={handleChange}
              />
              女
            </label>
          </div> */}

          {/* ボタンの並び（横並びで隙間を空ける） */}
          <div className="flex gap-3">
            {/* 「男」ボタン */}
            <label
              className={`
                flex-1 flex items-center justify-center h-10 px-4 rounded-md border text-sm font-medium cursor-pointer transition-colors select-none
                ${
                  formData.gender === "男"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold ring-2 ring-emerald-500/20" // 選択時に明るい緑色系
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400" // 未選択時
                }
              `}
            >
              <input
                type="radio"
                name="gender"
                value="男"
                checked={formData.gender === "男"}
                onChange={handleChange}
                className="sr-only"
              />
              男
            </label>

            {/* 「女」ボタン */}
            <label
              className={`
                flex-1 flex items-center justify-center h-10 px-4 rounded-md border text-sm font-medium cursor-pointer transition-colors select-none
                ${
                  formData.gender === "女"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold ring-2 ring-emerald-500/20" // 選択時に明るい緑色系
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400" // 未選択時
                }
              `}
            >
              <input
                type="radio"
                name="gender"
                value="女"
                checked={formData.gender === "女"}
                onChange={handleChange}
                className="sr-only"
              />
              女
            </label>
          </div>
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

        <MyInput
          id="created_at"
          label="登録日"
          placeholder={getTodayFormatted()}
          required
          value={formData.created_at}
          onChange={handleRegistrationDateChange}
          maxLength={14}
        />

        <MyButton type="submit" className="justify-self-center">
          登録する
        </MyButton>
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
