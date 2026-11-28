// src/components/react/exam_order/injection-fields.tsx
//
// 投与記録（投与時刻・投与量・残量）の入力欄と入力チェック。
// 検査一覧の投与記録ダイアログと、患者詳細の検査オーダー編集ダイアログで使う。
// 空欄は「未入力」として扱う（数値は null、投与時刻は空文字）。

import { ClockIcon } from "lucide-react";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";

type InjectionSource = Pick<
  ExamOrder,
  "dosage_mbq" | "dosage_ml" | "remain_mbq" | "remain_ml" | "injection_time"
>;

export type InjectionFieldKey =
  "dosageMbq" | "dosageMl" | "remainMbq" | "remainMl";

/** 投与記録の入力値（入力欄の文字列のまま持つ） */
export type InjectionValues = Record<InjectionFieldKey, string> & {
  injectionTime: string;
};

export const EMPTY_INJECTION: InjectionValues = {
  injectionTime: "",
  dosageMbq: "",
  dosageMl: "",
  remainMbq: "",
  remainMl: "",
};

const toText = (value: number | null) => (value === null ? "" : String(value));

export function toInjectionValues(order: InjectionSource): InjectionValues {
  return {
    injectionTime: order.injection_time ?? "",
    dosageMbq: toText(order.dosage_mbq),
    dosageMl: toText(order.dosage_ml),
    remainMbq: toText(order.remain_mbq),
    remainMl: toText(order.remain_ml),
  };
}

/** 全角数字・全角ピリオドを半角にそろえる */
function normalizeNumber(value: string): string {
  return value
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, ".")
    .trim();
}

/** 空欄は null、数値でなければ NaN */
export function parseNumber(value: string): number | null {
  const text = normalizeNumber(value);
  if (text === "") return null;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function validateInjection(
  values: InjectionValues,
): Partial<Record<InjectionFieldKey, string>> {
  const errors: Partial<Record<InjectionFieldKey, string>> = {};
  for (const key of [
    "dosageMbq",
    "dosageMl",
    "remainMbq",
    "remainMl",
  ] as const) {
    if (Number.isNaN(parseNumber(values[key]))) {
      errors[key] = "0 以上の数値を入力してください";
    }
  }
  const pairs = [
    ["remainMbq", "dosageMbq", "MBq"],
    ["remainMl", "dosageMl", "mL"],
  ] as const;
  for (const [remainKey, dosageKey, unit] of pairs) {
    const remain = parseNumber(values[remainKey]);
    const dosage = parseNumber(values[dosageKey]);
    if (
      !errors[remainKey] &&
      remain !== null &&
      dosage !== null &&
      !Number.isNaN(dosage) &&
      remain > dosage
    ) {
      errors[remainKey] = `残量が投与量（${dosage} ${unit}）を超えています`;
    }
  }
  return errors;
}

function difference(dosage: string, remain: string): string | null {
  const a = parseNumber(dosage);
  const b = parseNumber(remain);
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) {
    return null;
  }
  return (a - b).toFixed(1);
}

/** 保存 API（edit_exam_order_fields / edit_exam_order）に渡す投与記録 */
export function toInjectionPayload(values: InjectionValues) {
  return {
    dosageMbq: parseNumber(values.dosageMbq),
    dosageMl: parseNumber(values.dosageMl),
    remainMbq: parseNumber(values.remainMbq),
    remainMl: parseNumber(values.remainMl),
    injectionTime: values.injectionTime,
  };
}

interface InjectionFieldsProps {
  /** 入力欄の id の接頭辞 */
  id: string;
  values: InjectionValues;
  onChange: (values: InjectionValues) => void;
  /** 表示するエラー（保存を押すまでは空にしておく） */
  errors: Partial<Record<InjectionFieldKey, string>>;
}

/** 投与時刻・投与量・残量の入力欄と、実投与量の計算結果 */
export function InjectionFields({
  id,
  values,
  onChange,
  errors,
}: InjectionFieldsProps) {
  const set = (key: keyof InjectionValues) => (value: string) =>
    onChange({ ...values, [key]: value });
  const errorFor = (key: InjectionFieldKey) => errors[key];
  const actualMbq = difference(values.dosageMbq, values.remainMbq);
  const actualMl = difference(values.dosageMl, values.remainMl);

  return (
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel htmlFor={`${id}-time`}>投与時刻</FieldLabel>
        <InputGroup className="w-44">
          <InputGroupInput
            id={`${id}-time`}
            type="time"
            value={values.injectionTime}
            onChange={(e) => set("injectionTime")(e.target.value)}
            className="tabular-nums [&::-webkit-calendar-picker-indicator]:hidden"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="xs"
              onClick={() => set("injectionTime")(currentTime())}
            >
              <ClockIcon />
              現在
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <AmountFieldSet
        legend="投与量"
        idPrefix={`${id}-dosage`}
        mbq={values.dosageMbq}
        ml={values.dosageMl}
        onMbqChange={set("dosageMbq")}
        onMlChange={set("dosageMl")}
        mbqError={errorFor("dosageMbq")}
        mlError={errorFor("dosageMl")}
      />

      <AmountFieldSet
        legend="残量"
        idPrefix={`${id}-remain`}
        mbq={values.remainMbq}
        ml={values.remainMl}
        onMbqChange={set("remainMbq")}
        onMlChange={set("remainMl")}
        mbqError={errorFor("remainMbq")}
        mlError={errorFor("remainMl")}
      />

      {/* 実投与量（投与量 − 残量） */}
      <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2.5">
        <span className="text-sm text-muted-foreground">
          実投与量（投与量 − 残量）
        </span>
        <span className="flex gap-3 text-sm font-semibold tabular-nums">
          <span>
            {actualMbq ?? "-"}{" "}
            <span className="font-normal text-muted-foreground">MBq</span>
          </span>
          <span>
            {actualMl ?? "-"}{" "}
            <span className="font-normal text-muted-foreground">mL</span>
          </span>
        </span>
      </div>
    </FieldGroup>
  );
}

interface AmountFieldSetProps {
  legend: string;
  idPrefix: string;
  mbq: string;
  ml: string;
  onMbqChange: (value: string) => void;
  onMlChange: (value: string) => void;
  mbqError?: string;
  mlError?: string;
}

/** MBq と mL を横に並べた 1 組の入力欄 */
function AmountFieldSet({
  legend,
  idPrefix,
  mbq,
  ml,
  onMbqChange,
  onMlChange,
  mbqError,
  mlError,
}: AmountFieldSetProps) {
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-0">
        {legend}
      </FieldLegend>
      <div className="grid grid-cols-2 gap-3">
        <AmountInput
          id={`${idPrefix}-mbq`}
          label={`${legend}（MBq）`}
          unit="MBq"
          value={mbq}
          onChange={onMbqChange}
          error={mbqError}
        />
        <AmountInput
          id={`${idPrefix}-ml`}
          label={`${legend}（mL）`}
          unit="mL"
          value={ml}
          onChange={onMlChange}
          error={mlError}
        />
      </div>
    </FieldSet>
  );
}

function AmountInput({
  id,
  label,
  unit,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Field data-invalid={error ? true : undefined} className="gap-1.5">
      <FieldLabel htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn("text-right tabular-nums")}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
