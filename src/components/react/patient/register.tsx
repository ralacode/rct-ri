// src/components/react/patient/register.tsx
//
// 患者登録ページ。患者IDが登録済みかどうかは入力中に確かめる。

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleCheckIcon, TriangleAlertIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { invoke } from "@/lib/api";
import { go } from "@/lib/nav";
import {
  errorMessage,
  normalizeToDbDateFormat,
  toKatakana,
  validateDateString,
  validateHiragana,
  validateKanjiName,
  validatePatientId,
} from "@/lib/utils";
import type { Patient } from "@/types/patient";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

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
  createdAt: string; // "yyyy / MM / dd"
}

type ErrorKey =
  "patientId" | "kanji" | "kana" | "birthDate" | "createdAt" | "body";

function todayFormatted() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()} / ${m} / ${d}`;
}

function emptyValues(): Values {
  return {
    patientId: "",
    lastNameKanji: "",
    firstNameKanji: "",
    lastNameKana: "",
    firstNameKana: "",
    birthDate: "",
    gender: "男",
    height: "",
    weight: "",
    createdAt: todayFormatted(),
  };
}

const isBadNumber = (text: string) =>
  text.trim() !== "" && Number.isNaN(parseFloat(text));

function validate(values: Values): Partial<Record<ErrorKey, string>> {
  const errors: Partial<Record<ErrorKey, string>> = {};

  const id = validatePatientId(values.patientId);
  if (!id.isValid) errors.patientId = id.errorMessage;

  for (const name of [values.lastNameKanji, values.firstNameKanji]) {
    const result = validateKanjiName(name);
    if (!result.isValid) errors.kanji = result.errorMessage;
  }
  for (const name of [values.lastNameKana, values.firstNameKana]) {
    const result = validateHiragana(name);
    if (!result.isValid) errors.kana = result.errorMessage;
  }

  const birth = validateDateString(values.birthDate, "生年月日");
  if (birth) errors.birthDate = birth;
  const created = validateDateString(values.createdAt, "登録日");
  if (created) errors.createdAt = created;

  if (isBadNumber(values.height) || isBadNumber(values.weight)) {
    errors.body = "身長・体重には半角数字を入力してください。";
  }
  return errors;
}

export function PatientRegisterForm() {
  const id = useId();
  const [values, setValues] = useState<Values>(emptyValues);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState<Values | null>(null);
  // 登録済みだった患者ID（入力中の値と同じときだけ「登録済み」と出す）
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const idCheck = validatePatientId(values.patientId);
  const isDuplicate = idCheck.isValid && registeredId === idCheck.normalizedId;

  const lookupRegisteredId = useCallback(async (rawId: string) => {
    const result = validatePatientId(rawId);
    const seq = ++requestSeq.current;
    if (!result.isValid) {
      setRegisteredId(null);
      return false;
    }
    try {
      const { registered } = await invoke<{ registered: boolean }>(
        "check_patient_id",
        { patientId: result.normalizedId },
      );
      if (seq === requestSeq.current) {
        setRegisteredId(registered ? result.normalizedId : null);
      }
      return registered;
    } catch {
      if (seq === requestSeq.current) setRegisteredId(null);
      return false;
    }
  }, []);

  // 患者IDの入力が止まったら、登録済みかどうかを確かめる
  useEffect(() => {
    if (!validatePatientId(values.patientId).isValid) {
      requestSeq.current += 1;
      setRegisteredId(null);
      return;
    }
    const timer = setTimeout(() => {
      void lookupRegisteredId(values.patientId);
    }, 300);
    return () => clearTimeout(timer);
  }, [values.patientId, lookupRegisteredId]);

  const errors = validate(values);
  const errorFor = (key: ErrorKey) => (showErrors ? errors[key] : undefined);
  const set = (key: keyof Values) => (value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (await lookupRegisteredId(values.patientId)) {
        setShowErrors(true);
        return;
      }
      await invoke("add_patient", {
        patientId: idCheck.normalizedId,
        lastNameKanji: values.lastNameKanji,
        firstNameKanji: values.firstNameKanji,
        lastNameKana: values.lastNameKana,
        firstNameKana: values.firstNameKana,
        birthDate: normalizeToDbDateFormat(values.birthDate),
        gender: values.gender,
        height: values.height ? parseFloat(values.height) : null,
        weight: values.weight ? parseFloat(values.weight) : null,
        // 登録日は "yyyy/MM/dd" で送る（以前と同じ）
        created_at: values.createdAt.replace(/\s+/g, ""),
      });
      toast.success("患者を登録しました");
      setRegistered({ ...values, patientId: idCheck.normalizedId });
      setValues(emptyValues());
      setShowErrors(false);
    } catch (err) {
      console.error(err);
      setSubmitError(`登録に失敗しました：${errorMessage(err, "")}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader
        title="患者登録"
        description="患者ID・生年月日・登録日は必ず入力してください"
      />

      {registered ? (
        <RegisteredCard
          patient={registered}
          onContinue={() => setRegistered(null)}
        />
      ) : (
        <Card className="py-0">
          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="py-6">
              <FieldGroup className="gap-5">
                <Field
                  data-invalid={
                    errorFor("patientId") || isDuplicate ? true : undefined
                  }
                >
                  <FieldLabel htmlFor={`${id}-pid`}>患者ID</FieldLabel>
                  <Input
                    id={`${id}-pid`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="例：0000000123"
                    value={values.patientId}
                    onChange={(e) => set("patientId")(e.target.value)}
                    onBlur={() => void lookupRegisteredId(values.patientId)}
                    aria-invalid={
                      errorFor("patientId") || isDuplicate ? true : undefined
                    }
                    className="tabular-nums sm:w-64"
                  />
                  {isDuplicate ? (
                    <FieldError className="flex items-center gap-1">
                      <TriangleAlertIcon className="size-3.5" />
                      この患者IDは登録済みです
                    </FieldError>
                  ) : errorFor("patientId") ? (
                    <FieldError>{errorFor("patientId")}</FieldError>
                  ) : (
                    <FieldDescription>
                      全角数字でも入力できます（10 桁以内）
                    </FieldDescription>
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
                  <Field
                    data-invalid={errorFor("birthDate") ? true : undefined}
                  >
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
                          formatBirthDateInput(
                            e.target.value,
                            values.birthDate,
                          ),
                        )
                      }
                      aria-invalid={errorFor("birthDate") ? true : undefined}
                      className="tabular-nums"
                    />
                    {errorFor("birthDate") ? (
                      <FieldError>{errorFor("birthDate")}</FieldError>
                    ) : (
                      <FieldDescription>
                        数字 8 桁で入力できます
                      </FieldDescription>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel id={`${id}-gender`}>性別</FieldLabel>
                    <GenderToggle
                      labelledBy={`${id}-gender`}
                      value={values.gender}
                      onChange={(gender) =>
                        setValues((prev) => ({ ...prev, gender }))
                      }
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
                  {errorFor("body") ? (
                    <FieldError>{errorFor("body")}</FieldError>
                  ) : (
                    <FieldDescription>
                      分からなければ空欄のままで構いません
                    </FieldDescription>
                  )}
                </Field>

                <FieldSeparator />

                <Field data-invalid={errorFor("createdAt") ? true : undefined}>
                  <FieldLabel htmlFor={`${id}-created`}>登録日</FieldLabel>
                  <Input
                    id={`${id}-created`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={todayFormatted()}
                    maxLength={14}
                    value={values.createdAt}
                    onChange={(e) =>
                      set("createdAt")(
                        formatBirthDateInput(e.target.value, values.createdAt),
                      )
                    }
                    aria-invalid={errorFor("createdAt") ? true : undefined}
                    className="tabular-nums sm:w-64"
                  />
                  {errorFor("createdAt") ? (
                    <FieldError>{errorFor("createdAt")}</FieldError>
                  ) : (
                    <FieldDescription>
                      ふつうは今日のままで構いません
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>

              {submitError && (
                <p className="mt-5 text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              )}
            </CardContent>
            <CardFooter className="justify-end border-t py-4">
              <Button type="submit" disabled={isSubmitting || isDuplicate}>
                <UserPlusIcon />
                {isSubmitting ? "登録中…" : "登録する"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </PageContainer>
  );
}

function RegisteredCard({
  patient,
  onContinue,
}: {
  patient: Values;
  onContinue: () => void;
}) {
  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <CircleCheckIcon className="size-10 text-muted-foreground" />
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          {toKatakana(patient.lastNameKana)} {toKatakana(patient.firstNameKana)}
        </p>
        <p className="text-xl font-semibold">
          {patient.lastNameKanji} {patient.firstNameKanji} 様を登録しました
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          ID {patient.patientId}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => go(`/patient/detail/?id=${patient.patientId}`)}>
          患者情報を見る
        </Button>
        <Button variant="outline" onClick={onContinue}>
          続けて別の患者を登録
        </Button>
      </div>
    </Card>
  );
}
