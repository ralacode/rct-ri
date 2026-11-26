// src/components/react/exam_order/daily-list/injection-record-dialog.tsx
//
// 投与記録（投与時刻・投与量・残量）の入力ダイアログ。
// 空欄は「未入力」として保存する（数値は null、投与時刻は空文字）。

import { useEffect, useId, useState, type FormEvent } from "react";
import { ClockIcon } from "lucide-react";
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
import { invoke } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExamOrderWithPatient } from "@/types/exam_order";
import { PediatricDoseNote } from "./pediatric-dose-note";

type FieldKey = "dosageMbq" | "dosageMl" | "remainMbq" | "remainMl";

type FormValues = Record<FieldKey, string> & { injectionTime: string };

const EMPTY: FormValues = {
  injectionTime: "",
  dosageMbq: "",
  dosageMl: "",
  remainMbq: "",
  remainMl: "",
};

const toText = (value: number | null) => (value === null ? "" : String(value));

function toFormValues(order: ExamOrderWithPatient): FormValues {
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
function parseNumber(value: string): number | null {
  const text = normalizeNumber(value);
  if (text === "") return null;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

function currentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function validate(values: FormValues): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
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

interface Props {
  /** 入力する検査オーダー。null のときは閉じている */
  order: ExamOrderWithPatient | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function InjectionRecordDialog({ order, onOpenChange, onSaved }: Props) {
  const id = useId();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 開くたびに、そのオーダーの値で初期化する
  useEffect(() => {
    if (!order) return;
    setValues(toFormValues(order));
    setShowErrors(false);
    setSubmitError(null);
  }, [order]);

  const errors = validate(values);
  const hasErrors = Object.keys(errors).length > 0;
  const actualMbq = difference(values.dosageMbq, values.remainMbq);
  const actualMl = difference(values.dosageMl, values.remainMl);

  const set = (key: keyof FormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await invoke("edit_exam_order_fields", {
        id: order.id,
        dosageMbq: parseNumber(values.dosageMbq),
        dosageMl: parseNumber(values.dosageMl),
        remainMbq: parseNumber(values.remainMbq),
        remainMl: parseNumber(values.remainMl),
        injectionTime: values.injectionTime,
      });
      toast.success("投与記録を保存しました", {
        description: `${order.exam_time} ${order.exam_item}（${order.last_name_kanji} ${order.first_name_kanji} 様）`,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setSubmitError(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "保存に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorFor = (key: FieldKey) => (showErrors ? errors[key] : undefined);

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>投与記録</DialogTitle>
            {order && (
              <DialogDescription>
                {order.exam_time}　{order.exam_item}
                <br />
                {order.last_name_kanji} {order.first_name_kanji} 様（ID{" "}
                {order.patient_id}）
              </DialogDescription>
            )}
          </DialogHeader>

          {order && (
            <PediatricDoseNote
              examItem={order.exam_item}
              weight={order.weight}
            />
          )}

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
