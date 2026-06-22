// src/components/react/patient/detail.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Patient } from "@/types/patient";
import {
  calculateAge,
  cn,
  DEPARTMENTS,
  EXAM_ITEMS,
  examTimeSlots,
  formatDateString,
  formatDateTimeWithDay,
  normalizeToDbDateFormat,
  normalizeToDisplayDateFormat,
  scrollToTop,
  toKatakana,
  validateHiragana,
  validateKanjiName,
  validatePatientId,
} from "@lib/utils";
import { PHYSICIAN } from "@/lib/secret-utils";
import type { ExamOrder } from "@/types/exam_order";
import { DatalistInput } from "../datalist-input";
import { DeleteOrderButton } from "@components/react/exam_order/delete-order-button";
import { PatientName } from "../patient-name";
import { Card } from "@components/react/card";
import { MyButton } from "@components/react/my-button";
import { MyInput } from "../my-input";
import { GenderSelect } from "../gender-select";
import { FadeIn } from "@components/react/fade-in";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format, isFuture, isValid, parse } from "date-fns";
import { DatePickerTime } from "../date-picker-time";

export const PatientDetail: React.FC = () => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [orders, setOrders] = useState<ExamOrder[]>([]);
  const [newExamDate, setNewExamDate] = useState(() => {
    // 既存のフォーマット "yyyy / MM / dd" に合わせて今日の文字列を生成
    return format(new Date(), "yyyy/MM/dd");
  });
  const [newExamTime, setNewExamTime] = useState("10:30");
  const [dept, setDept] = useState("");
  const [pys, setPys] = useState("");
  const [examItem, setExamItem] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // --- インライン編集用のStateを追加 ---
  const [isEditing, setIsEditing] = useState(false);
  const [editPatientId, setEditPatientId] = useState<string>("");
  const [editPatientIdError, setEditPatientIdError] = useState<string | null>(
    null,
  );
  const [editFirstNameKanji, setEditFirstNameKanji] = useState<string>("");
  const [editLastNameKanji, setEditLastNameKanji] = useState<string>("");
  const [editKanjiError, setEditKanjiError] = useState<string | null>(null);
  const [editFirstNameKana, setEditFirstNameKana] = useState<string>("");
  const [editLastNameKana, setEditLastNameKana] = useState<string>("");
  const [editKanaError, setEditKanaError] = useState<string | null>(null);
  const [editBirthDate, setEditBirthDate] = useState<string>("");
  const [editBirthDateError, setEditBirthDateError] = useState<string | null>(
    null,
  );
  const [editGender, setEditGender] = useState<Patient["gender"]>("");
  const [editHeight, setEditHeight] = useState<string>("");
  const [editWeight, setEditWeight] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // 1. URLのクエリパラメータからIDを取得する関数
  const getPatientIdFromUrl = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("id");
    }
    return null;
  };

  // 2. データロード処理（患者情報 + 検査履歴）
  const loadAllData = async (patientIdStr: string) => {
    try {
      // 1. 患者情報の取得
      // Rust側の引数名は 'keyword'。第二引数の 'sortDesc' も必須です。
      const patients = await invoke<Patient[]>("search_patients_cmd", {
        keyword: patientIdStr,
        sortDesc: false,
      });

      if (patients && patients.length > 0) {
        const p = patients[0];
        setPatient(p);

        try {
          const orderResults = await invoke<ExamOrder[]>("get_exam_orders", {
            patientDbId: p.id,
          });
          setOrders(orderResults || []);
        } catch (e) {
          console.error("検査履歴の取得失敗:", e);
        }
      } else {
        setError(`患者ID: ${patientIdStr} が見つかりませんでした。`);
      }
    } catch (err) {
      console.error("Invoke Error:", err);
      setError(
        "データベース接続エラーが発生しました。詳細はコンソールを確認してください。",
      );
    }
  };

  useEffect(() => {
    const id = getPatientIdFromUrl();
    if (id) {
      loadAllData(id);
    } else {
      setError("患者IDが指定されていません。");
    }
  }, []);

  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setEditBirthDateError(null);

    // 前回の値より短ければ、削除中と判断してそのままの状態を受け入れる
    if (inputValue.length < editBirthDate.length) {
      setEditBirthDate(inputValue);
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

    setEditBirthDate(formatted);

    if (formatted.length === 14) {
      // スペースを取り除いて "YYYY/MM/DD" にする
      const cleanStr = formatted.replace(/\s+/g, "");
      const parsedDate = parse(cleanStr, "yyyy/MM/dd", new Date());

      if (!isValid(parsedDate)) {
        setEditBirthDateError("存在しない日付です");
      } else if (isFuture(parsedDate)) {
        // プロジェクトの既存の仕様（未来日制限）に合わせる場合
        setEditBirthDateError("未来の日付は入力できません");
      } else {
        setEditBirthDateError(null); // 正しければエラーをクリア
      }
    } else {
      // 入力途中（14文字未満）はエラーをクリアしておく
      setEditBirthDateError(null);
    }
  };

  const startEditing = () => {
    if (patient) {
      setEditBirthDate(normalizeToDisplayDateFormat(patient.birth_date));

      // 他の項目も編集開始時に最新の patient の状態と同期させる
      setEditPatientId(patient.patient_id);
      setEditFirstNameKanji(patient.first_name_kanji);
      setEditFirstNameKana(patient.first_name_kana);
      setEditLastNameKanji(patient.last_name_kanji);
      setEditLastNameKana(patient.last_name_kana);
      setEditGender(patient.gender);
      setEditHeight(patient.height != null ? patient.height.toString() : "");
      setEditWeight(patient.weight != null ? patient.weight.toString() : "");
    }
    setEditBirthDateError(null);
    setEditError(null);
    setIsEditing(true);
  };

  // --- 編集内容をバックエンドに保存する関数 ---
  const handleSavePatient = async () => {
    if (!patient) return;
    setEditPatientIdError(null);
    setEditKanjiError(null);
    setEditKanaError(null);
    setEditError(null);

    const patientIdResult = validatePatientId(editPatientId);
    if (!patientIdResult.isValid) {
      setEditPatientIdError(
        patientIdResult.errorMessage || "患者IDの入力が正しくありません。",
      );

      return;
    }
    const finalPatientId = patientIdResult.normalizedId;

    const firstNameKanjiResult = validateKanjiName(editFirstNameKanji);
    if (!firstNameKanjiResult.isValid) {
      return setEditKanjiError(
        firstNameKanjiResult.errorMessage ||
          "患者名（漢字）の入力が正しくありません。",
      );
    }
    const lastNameKanjiResult = validateKanjiName(editLastNameKanji);
    if (!lastNameKanjiResult.isValid) {
      return setEditKanjiError(
        lastNameKanjiResult.errorMessage ||
          "患者名（漢字）の入力が正しくありません。",
      );
    }

    const firstNameKanaResult = validateHiragana(editFirstNameKana);
    const kanaErrorMessage = "患者名（ふりがな）の入力が正しくありません。";
    if (!firstNameKanaResult.isValid) {
      return setEditKanaError(
        firstNameKanaResult.errorMessage || kanaErrorMessage,
      );
    }
    const lastNameKanaResult = validateHiragana(editLastNameKana);
    if (!lastNameKanaResult.isValid) {
      return setEditKanaError(
        lastNameKanaResult.errorMessage || kanaErrorMessage,
      );
    }

    // 数値への変換処理（空文字の場合は None として扱うため null にする）
    const heightNum = editHeight.trim() !== "" ? parseFloat(editHeight) : null;
    const weightNum = editWeight.trim() !== "" ? parseFloat(editWeight) : null;

    if (
      (editHeight.trim() !== "" && isNaN(heightNum!)) ||
      (editWeight.trim() !== "" && isNaN(weightNum!))
    ) {
      setEditError("身長・体重には半角数字を入力してください。");
      return;
    }

    const dbBirthDate = normalizeToDbDateFormat(editBirthDate);
    if (!dbBirthDate) {
      setEditError("生年月日の日付が正しくありません。");
      return;
    }

    try {
      // lib.rs の edit_patient が要求するすべての引数を渡す
      await invoke("edit_patient", {
        id: patient.id,
        patientId: finalPatientId,
        patientType: patient.patient_type,
        lastNameKanji: editLastNameKanji,
        firstNameKanji: editFirstNameKanji,
        lastNameKana: editLastNameKana,
        firstNameKana: editFirstNameKana,
        birthDate: dbBirthDate,
        gender: editGender,
        height: heightNum,
        weight: weightNum,
        createdAt: patient.created_at, // 元の作成日時をそのまま維持
      });

      // ローカルの患者情報を更新して編集モードを閉じる
      setPatient({
        ...patient,
        patient_id: finalPatientId,
        last_name_kanji: editLastNameKanji,
        first_name_kanji: editFirstNameKanji,
        last_name_kana: editLastNameKana,
        first_name_kana: editFirstNameKana,
        birth_date: editBirthDate,
        gender: editGender,
        height: heightNum,
        weight: weightNum,
      });
      setEditPatientId(finalPatientId);
      setEditLastNameKanji(editLastNameKanji);
      setEditFirstNameKanji(editFirstNameKanji);
      setEditLastNameKana(editLastNameKana);
      setEditFirstNameKana(editFirstNameKana);
      setEditBirthDate(editBirthDate);
      setIsEditing(false);
      scrollToTop("main-scroll-area");

      if (finalPatientId) {
        await loadAllData(finalPatientId);
      }
    } catch (err) {
      setEditError(`更新に失敗しました: ${err}`);
    }
  };

  const handleAddOrder = async () => {
    setIsSubmittingOrder(true);

    if (!patient) return;

    if (!newExamDate || !newExamTime || !examItem || !dept || !pys) {
      alert("検査日、予約時間、検査項目、依頼科、依頼医を入力してください。");
      return setIsSubmittingOrder(false);
    }

    const dbExamDate = normalizeToDbDateFormat(newExamDate);
    if (!dbExamDate) {
      alert("検査日の日付が正しくありません。");
      return setIsSubmittingOrder(false);
    }

    try {
      // Rust側は 'add_exam_order' で、引数は 'patientDbId' (数値)
      await invoke("add_exam_order", {
        patientDbId: patient.id,
        examDate: dbExamDate,
        examTime: newExamTime,
        examItem: examItem,
        requestingDepartment: dept,
        requestingPhysician: pys,
      });

      setNewExamDate(() => format(new Date(), "yyyy/MM/dd"));
      setNewExamTime("10:30");
      setExamItem("");
      setDept("");
      setPys("");

      setIsOrderModalOpen(false);
      setIsSubmittingOrder(false);

      const id = getPatientIdFromUrl();
      if (id) loadAllData(id);
    } catch (err) {
      alert("検査登録に失敗しました。");
      setIsSubmittingOrder(false);
    }
  };

  // 実際の削除実行
  const executeDelete = async () => {
    if (!patient) return;

    setIsDeleting(true);
    try {
      await invoke("remove_patient", { id: patient.id });
      window.location.href = "/patient/list/";
    } catch (err) {
      console.error("削除エラー:", err);
      alert("削除に失敗しました。");
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const successfetchData = () => {
    const id = getPatientIdFromUrl();
    if (id) loadAllData(id);
  };

  const formatValue = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "string" ? parseFloat(val) : val;
    return isNaN(num) ? null : num.toFixed(1);
  };

  if (error) return <div>{error}</div>;
  if (!patient) return;

  const {
    patient_id,
    last_name_kanji,
    last_name_kana,
    first_name_kanji,
    first_name_kana,
    height,
    weight,
    birth_date,
    gender,
    created_at,
    updated_at,
  } = patient;

  return (
    <div className={cn("grid gap-8 content-start", "@container")}>
      {/* 患者基本情報セクション */}
      <div
        className={cn(
          "grid w-full gap-2",
          "@lg:max-w-lg  @lg:justify-self-center",
        )}
      >
        <h2 className="text-2xl">患者情報</h2>

        <FadeIn>
          <Card className={cn("grid min-w-71.75 overflow-x-hidden")}>
            {isEditing ? (
              <div className={cn("grid grid-rows-[auto_1rem]")}>
                <MyInput
                  id="patient_id"
                  label="患者ID"
                  type="text"
                  value={editPatientId}
                  onChange={(e) => {
                    setEditPatientId(e.target.value);
                    setEditPatientIdError(null);
                  }}
                  placeholder="患者IDを入力"
                  required
                />
                {editPatientIdError && (
                  <p className={cn("text-red-700")}>{editPatientIdError}</p>
                )}
              </div>
            ) : (
              <p>{patient_id}</p>
            )}

            {/* 患者名 */}
            {isEditing ? (
              <div className={cn("grid gap-2 content-start")}>
                <div className={cn("grid grid-rows-[auto_1rem]")}>
                  <div className={cn("grid grid-flow-col gap-2 justify-start")}>
                    <MyInput
                      id="last_name_kanji"
                      label="姓（漢字）"
                      type="text"
                      value={editLastNameKanji}
                      placeholder="例: 山田"
                      required
                      onChange={(e) => {
                        setEditLastNameKanji(e.target.value);
                        setEditKanjiError(null);
                      }}
                    />
                    <MyInput
                      id="first_name_kanji"
                      label="名（漢字）"
                      type="text"
                      value={editFirstNameKanji}
                      placeholder="例: 太郎"
                      required
                      onChange={(e) => {
                        setEditFirstNameKanji(e.target.value);
                        setEditKanjiError(null);
                      }}
                    />
                  </div>
                  {editKanjiError && (
                    <p className={cn("text-red-700")}>
                      【漢字】{editKanjiError}
                    </p>
                  )}
                </div>
                <div className={cn("grid grid-rows-[auto_1rem]")}>
                  <div className={cn("grid grid-flow-col gap-2 justify-start")}>
                    <MyInput
                      id="last_name_kana"
                      label="姓（ふりがな）"
                      type="text"
                      value={editLastNameKana}
                      placeholder="例: やまだ"
                      required
                      onChange={(e) => {
                        setEditLastNameKana(e.target.value);
                        setEditKanaError(null);
                      }}
                    />
                    <MyInput
                      id="first_name_kana"
                      label="名（ふりがな）"
                      type="text"
                      value={editFirstNameKana}
                      placeholder="例: たろう"
                      required
                      onChange={(e) => {
                        setEditFirstNameKana(e.target.value);
                        setEditKanaError(null);
                      }}
                    />
                  </div>
                  {editKanaError && (
                    <p className={cn("text-red-700")}>
                      【ふりがな】{editKanaError}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <PatientName
                last_name_kanji={last_name_kanji}
                last_name_kana={toKatakana(last_name_kana)}
                first_name_kanji={first_name_kanji}
                first_name_kana={toKatakana(first_name_kana)}
                className={cn("text-xl font-bold", "@md:text-2xl")}
              />
            )}

            {/* 生年月日 */}
            {isEditing ? (
              <div className={cn("grid grid-rows-[auto_1rem]")}>
                <MyInput
                  id="birth_date"
                  label="生年月日"
                  placeholder="1989 / 09 / 11"
                  required
                  value={editBirthDate}
                  onChange={handleBirthDateChange}
                  maxLength={14}
                  inputClassName={cn(
                    editBirthDateError && "text-white bg-red-500",
                  )}
                />
                {editBirthDateError && (
                  <p className={cn("text-red-700 justify-self-end")}>
                    {editBirthDateError}
                  </p>
                )}
              </div>
            ) : (
              <div className={cn("@md:mt-4")}>
                生年月日：
                <span className="detail-value">
                  {formatDateString(birth_date)}
                </span>
              </div>
            )}

            {/* 年齢 */}
            {!isEditing && (
              <div>
                年齢：
                <span className="detail-value">
                  {calculateAge(birth_date) !== null
                    ? `${calculateAge(birth_date)}歳`
                    : "---"}
                </span>
              </div>
            )}

            {/* 性別（SelectGenderコンポーネント作る予定） */}
            {isEditing ? (
              <GenderSelect
                value={editGender}
                onChange={(newValue) => setEditGender(newValue)}
              />
            ) : (
              <div>
                性別：<span className="detail-value">{gender}</span>
              </div>
            )}

            {/* 身長・体重 */}
            {isEditing ? (
              <div className={cn("grid gap-2 grid-rows-[auto_auto_1rem] mt-4")}>
                <div
                  className={cn(
                    "grid grid-flow-col justify-start items-end gap-2",
                  )}
                >
                  <MyInput
                    id="height"
                    label="身長"
                    type="text"
                    value={editHeight}
                    onChange={(e) => setEditHeight(e.target.value)}
                    placeholder="例: 165.5"
                  />
                  <span>cm</span>
                </div>
                <div
                  className={cn(
                    "grid grid-flow-col justify-start items-end gap-2",
                  )}
                >
                  <MyInput
                    id="weight"
                    label="体重"
                    type="text"
                    value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)}
                    placeholder="例: 50.5"
                  />
                  <span>kg</span>
                </div>
                {editError && <p className={cn("text-red-700")}>{editError}</p>}
              </div>
            ) : (
              <div>
                <div>
                  身長：
                  <span>
                    {formatValue(height)
                      ? `${formatValue(height)} cm`
                      : "未登録"}
                  </span>
                </div>
                <div>
                  体重：
                  <span>
                    {formatValue(weight)
                      ? `${formatValue(weight)} kg`
                      : "未登録"}
                  </span>
                </div>
              </div>
            )}

            {/* 登録日 */}
            {!isEditing && (
              <div>
                登録日：
                <span className={cn("text-sm", "@md:text-base")}>
                  {formatDateTimeWithDay(created_at)}
                </span>
              </div>
            )}

            {/* 更新日 */}
            {!isEditing && created_at !== updated_at && (
              <div>
                更新日：
                <span className={cn("text-sm", "@md:text-base")}>
                  {formatDateTimeWithDay(updated_at)}
                </span>
              </div>
            )}

            {/* ボタン集 */}
            <div className={cn("grid gap-2 content-start mt-2")}>
              <div
                className={cn(
                  "grid gap-2 content-start",
                  "@md:grid-flow-col @md:justify-end",
                )}
              >
                {/* 患者を編集する */}
                {!isEditing ? (
                  <MyButton
                    onClick={startEditing}
                    className={cn("justify-self-end")}
                  >
                    患者情報を編集する
                  </MyButton>
                ) : (
                  <div
                    className={cn(
                      "grid grid-flow-col justify-start gap-2 justify-self-end",
                    )}
                  >
                    <MyButton onClick={handleSavePatient}>保存</MyButton>
                    <MyButton
                      onClick={() => {
                        setEditPatientId(patient.patient_id);
                        setEditFirstNameKanji(patient.first_name_kanji);
                        setEditLastNameKanji(patient.last_name_kanji);
                        setEditFirstNameKana(patient.first_name_kana);
                        setEditLastNameKana(patient.last_name_kana);
                        setEditBirthDate(patient.birth_date);
                        setEditHeight(
                          patient.height != null
                            ? patient.height.toString()
                            : "",
                        );
                        setEditWeight(
                          patient.weight != null
                            ? patient.weight.toString()
                            : "",
                        );
                        setEditPatientIdError(null);
                        setEditKanjiError(null);
                        setEditKanaError(null);
                        setEditError(null);
                        setIsEditing(false);
                        scrollToTop("main-scroll-area");
                      }}
                      className={cn("bg-red-500")}
                    >
                      キャンセル
                    </MyButton>
                  </div>
                )}

                {/* 検査登録フォーム（モーダル） */}
                {!isEditing && (
                  <Dialog
                    open={isOrderModalOpen}
                    onOpenChange={setIsOrderModalOpen}
                  >
                    <DialogTrigger asChild className={cn("justify-self-end")}>
                      <MyButton>検査オーダーを登録</MyButton>
                    </DialogTrigger>
                    <DialogContent
                      className={cn(
                        "font-(family-name:--font-family)! text-(--text)!",
                        "duration-0 animate-none",
                      )}
                    >
                      <DialogHeader>
                        <DialogTitle>新規検査オーダー登録</DialogTitle>
                      </DialogHeader>

                      <DialogDescription className="sr-only">
                        新しく患者の検査オーダーを入力して登録するためのフォームです
                      </DialogDescription>

                      <div className={cn("grid gap-4")}>
                        <DatePickerTime
                          valueString={newExamDate}
                          timeString={newExamTime}
                          onChange={setNewExamDate}
                          onChangeTime={(e) => setNewExamTime(e.target.value)}
                        />
                        <DatalistInput
                          id="modal_requesting_department_name"
                          label="依頼科"
                          list="modal_requesting_department_list"
                          placeholder="依頼科を入力..."
                          value={dept}
                          onChange={(e) => setDept(e.target.value)}
                          options={DEPARTMENTS}
                          inputClassName={cn("h-10 cursor-pointer")}
                        />
                        <DatalistInput
                          id="modal_requesting_physician"
                          label="依頼医"
                          list="modal_requesting_physician_list"
                          placeholder="依頼医を入力..."
                          value={pys}
                          onChange={(e) => setPys(e.target.value)}
                          options={PHYSICIAN}
                          inputClassName={cn("h-10 cursor-pointer")}
                        />

                        <DatalistInput
                          id="modal_exam_item"
                          label="検査項目"
                          list="modal_exam_item_list"
                          placeholder="検査項目を入力..."
                          value={examItem}
                          onChange={(e) => setExamItem(e.target.value)}
                          options={EXAM_ITEMS}
                          inputClassName={cn("h-10 cursor-pointer")}
                        />
                      </div>

                      <DialogFooter className={cn("grid")}>
                        <MyButton
                          onClick={handleAddOrder}
                          disabled={isSubmittingOrder}
                        >
                          {isSubmittingOrder ? "登録中..." : "登録する"}
                        </MyButton>
                        <DialogClose asChild>
                          <MyButton className={cn("bg-red-500")}>
                            キャンセル
                          </MyButton>
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {/* 患者削除ボタン */}
              {!isEditing && (
                <div
                  className={cn(
                    "grid justify-self-end grid-rows-[1.5rem_2.5rem]",
                  )}
                >
                  {!showConfirm ? (
                    <MyButton
                      className="bg-red-500 row-span-full self-end"
                      onClick={() => setShowConfirm(true)}
                    >
                      この患者を削除する
                    </MyButton>
                  ) : (
                    <>
                      <p className="confirm-text">
                        本当に削除してもよろしいですか？
                      </p>
                      <div className={cn("grid grid-flow-col gap-2")}>
                        <MyButton
                          onClick={executeDelete}
                          disabled={isDeleting}
                          className={cn("bg-red-500")}
                        >
                          {isDeleting ? "削除中..." : "はい"}
                        </MyButton>
                        <MyButton
                          onClick={() => setShowConfirm(false)}
                          disabled={isDeleting}
                        >
                          いいえ
                        </MyButton>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        </FadeIn>
      </div>

      {/* 検査履歴一覧 */}
      <div className={cn("grid gap-2 content-start")}>
        <h2 className="text-2xl">検査一覧</h2>

        {orders.length === 0 ? (
          <p className="text-gray-500">登録された検査はありません。</p>
        ) : (
          <div className={cn("grid gap-4 content-start", "@lg:grid-cols-2")}>
            {orders.map((order) => (
              <Card key={order.id} className={cn("grid gap-2 content-start")}>
                <div className={cn("grid grid-flow-col gap-2 justify-start")}>
                  <div>{formatDateTimeWithDay(order.exam_date)}</div>
                  <div>{order.exam_time}</div>
                </div>

                <div className={cn("text-lg font-bold", "md:text-2xl")}>
                  {order.exam_item}
                </div>

                <div className={cn("text-right justify-self-end")}>
                  <div>{order.requesting_department}</div>
                  <div>{order.requesting_physician}</div>
                </div>

                <div
                  className={cn("text-sm justify-self-end", "@md:text-base")}
                >
                  登録日：{formatDateTimeWithDay(order.created_at)}
                </div>

                <DeleteOrderButton
                  orderId={order.id}
                  onSuccess={successfetchData}
                  className={cn("justify-self-end")}
                />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
