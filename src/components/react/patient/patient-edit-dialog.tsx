// src/components/react/patient/patient-edit-dialog.tsx
//
// 患者情報の編集ダイアログ。入力チェックと保存の内容は以前の画面内編集と同じ。

import { useEffect, useId, useState, type FormEvent } from "react";
import { isFuture, isValid, parse } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { invoke } from "@/lib/api";
import {
  errorMessage,
  normalizeToDbDateFormat,
  normalizeToDisplayDateFormat,
  validateHiragana,
  validateKanjiName,
  validatePatientId,
} from "@/lib/utils";
import type { Patient } from "@/types/patient";
import {
  formatBirthDateInput,
  GenderToggle,
  NamePair,
  UnitInput,
} from "./patient-fields";

interface Values {
  patientId: string;
  lastNameKanji: string;
  firstNameKanji: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string; // "yyyy / MM / dd"
  gender: Patient["gender"];
  height: string;
  weight: string;
}

type ErrorKey = "patientId" | "kanji" | "kana" | "birthDate" | "body";

function toValues(patient: Patient): Values {
  return {
    patientId: patient.patient_id,
    lastNameKanji: patient.last_name_kanji,
    firstNameKanji: patient.first_name_kanji,
    lastNameKana: patient.last_name_kana,
    firstNameKana: patient.first_name_kana,
    birthDate: normalizeToDisplayDateFormat(patient.birth_date),
    gender: patient.gender,
    height: patient.height != null ? String(patient.height) : "",
    weight: patient.weight != null ? String(patient.weight) : "",
  };
}

function birthDateError(value: string): string | undefined {
  if (value.length < 14)
    return "生年月日を「1989 / 09 / 11」の形で入力してください";
  const date = parse(value.replace(/\s+/g, ""), "yyyy/MM/dd", new Date());
  if (!isValid(date)) return "存在しない日付です";
  if (isFuture(date)) return "未来の日付は入力できません";
  return undefined;
}

function validate(values: Values): Partial<Record<ErrorKey, string>> {
  const errors: Partial<Record<ErrorKey, string>> = {};

  const id = validatePatientId(values.patientId);
  if (!id.isValid) {
    errors.patientId = id.errorMessage || "患者IDの入力が正しくありません。";
  }

  for (const name of [values.lastNameKanji, values.firstNameKanji]) {
    const result = validateKanjiName(name);
    if (!result.isValid) {
      errors.kanji =
        result.errorMessage || "患者名（漢字）の入力が正しくありません。";
    }
  }
  for (const name of [values.lastNameKana, values.firstNameKana]) {
    const result = validateHiragana(name);
    if (!result.isValid) {
      errors.kana =
        result.errorMessage || "患者名（ふりがな）の入力が正しくありません。";
    }
  }

  const birth = birthDateError(values.birthDate);
  if (birth) errors.birthDate = birth;

  const isBadNumber = (text: string) =>
    text.trim() !== "" && Number.isNaN(parseFloat(text));
  if (isBadNumber(values.height) || isBadNumber(values.weight)) {
    errors.body = "身長・体重には半角数字を入力してください。";
  }
  return errors;
}

const toNumber = (text: string) =>
  text.trim() !== "" ? parseFloat(text) : null;

interface Props {
  patient: Patient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存後に呼ぶ。患者IDが変わったときは新しい患者IDを渡す */
  onSaved: (patientId: string) => void;
}

export function PatientEditDialog({
  patient,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const id = useId();
  const [values, setValues] = useState<Values>(() => toValues(patient));
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 開いたときの患者情報で初期化する（開いている間に届いた更新では上書きしない）
  useEffect(() => {
    if (!open) return;
    setValues(toValues(patient));
    setShowErrors(false);
    setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errors = validate(values);
  const errorFor = (key: ErrorKey) => (showErrors ? errors[key] : undefined);
  const set = (key: keyof Values) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    const patientId = validatePatientId(values.patientId).normalizedId;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await invoke("edit_patient", {
        id: patient.id,
        patientId,
        lastNameKanji: values.lastNameKanji,
        firstNameKanji: values.firstNameKanji,
        lastNameKana: values.lastNameKana,
        firstNameKana: values.firstNameKana,
        birthDate: normalizeToDbDateFormat(values.birthDate),
        gender: values.gender,
        height: toNumber(values.height),
        weight: toNumber(values.weight),
        createdAt: patient.created_at, // 元の作成日時をそのまま残す
      });
      toast.success("患者情報を保存しました");
      onSaved(patientId);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setSubmitError(`更新に失敗しました: ${errorMessage(err, "")}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>患者情報を編集</DialogTitle>
            <DialogDescription>
              患者IDを変えると、この患者のページのURLも変わります。
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-5">
            <Field data-invalid={errorFor("patientId") ? true : undefined}>
              <FieldLabel htmlFor={`${id}-pid`}>患者ID</FieldLabel>
              <Input
                id={`${id}-pid`}
                inputMode="numeric"
                autoComplete="off"
                value={values.patientId}
                onChange={(e) => set("patientId")(e.target.value)}
                aria-invalid={errorFor("patientId") ? true : undefined}
                className="w-48 tabular-nums"
              />
              {errorFor("patientId") && (
                <FieldError>{errorFor("patientId")}</FieldError>
              )}
            </Field>

            <NamePair
              legend="氏名（漢字）"
              id={`${id}-kanji`}
              last={values.lastNameKanji}
              first={values.firstNameKanji}
              onLastChange={set("lastNameKanji")}
              onFirstChange={set("firstNameKanji")}
              lastPlaceholder="山田"
              firstPlaceholder="太郎"
              error={errorFor("kanji")}
            />
            <NamePair
              legend="氏名（ふりがな）"
              id={`${id}-kana`}
              last={values.lastNameKana}
              first={values.firstNameKana}
              onLastChange={set("lastNameKana")}
              onFirstChange={set("firstNameKana")}
              lastPlaceholder="やまだ"
              firstPlaceholder="たろう"
              error={errorFor("kana")}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={errorFor("birthDate") ? true : undefined}>
                <FieldLabel htmlFor={`${id}-birth`}>生年月日</FieldLabel>
                <Input
                  id={`${id}-birth`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="1989 / 09 / 11"
                  maxLength={14}
                  value={values.birthDate}
                  onChange={(e) =>
                    set("birthDate")(
                      formatBirthDateInput(e.target.value, values.birthDate),
                    )
                  }
                  aria-invalid={errorFor("birthDate") ? true : undefined}
                  className="tabular-nums"
                />
                {errorFor("birthDate") ? (
                  <FieldError>{errorFor("birthDate")}</FieldError>
                ) : (
                  <FieldDescription>数字 8 桁で入力できます</FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel id={`${id}-gender`}>性別</FieldLabel>
                <GenderToggle
                  labelledBy={`${id}-gender`}
                  value={values.gender}
                  onChange={(gender) => setValues((v) => ({ ...v, gender }))}
                />
              </Field>
            </div>

            <Field data-invalid={errorFor("body") ? true : undefined}>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`${id}-height`}>身長</FieldLabel>
                  <UnitInput
                    id={`${id}-height`}
                    unit="cm"
                    value={values.height}
                    onChange={set("height")}
                    invalid={Boolean(errorFor("body"))}
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`${id}-weight`}>体重</FieldLabel>
                  <UnitInput
                    id={`${id}-weight`}
                    unit="kg"
                    value={values.weight}
                    onChange={set("weight")}
                    invalid={Boolean(errorFor("body"))}
                  />
                </div>
              </div>
              {errorFor("body") && <FieldError>{errorFor("body")}</FieldError>}
            </Field>
          </FieldGroup>

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                キャンセル
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "保存中…" : "保存する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
