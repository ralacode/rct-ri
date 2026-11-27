// src/components/react/exam_order/exam-order-dialog.tsx
//
// 患者詳細の検査オーダー登録・編集ダイアログ。
// 編集のときは投与記録（投与時刻・投与量・残量）も一緒に直せる。

import { useEffect, useId, useState, type FormEvent } from "react";
import { format, isValid, parse } from "date-fns";
import { ja } from "react-day-picker/locale";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { invoke } from "@/lib/api";
import { useRequesterOptions } from "@/lib/requesters";
import {
  cn,
  errorMessage,
  EXAM_ITEMS,
  formatDateTimeWithDay,
} from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";
import {
  EMPTY_INJECTION,
  InjectionFields,
  toInjectionPayload,
  toInjectionValues,
  validateInjection,
  type InjectionValues,
} from "@components/react/exam_order/injection-fields";
import { PediatricDoseNote } from "@components/react/exam_order/pediatric-dose-note";

const DATE_FORMAT = "yyyy-MM-dd";
const DEFAULT_TIME = "10:30";

interface OrderValues {
  examDate: string; // yyyy-MM-dd
  examTime: string;
  examItem: string;
  department: string;
  physician: string;
}

type OrderFieldKey = keyof OrderValues;

const REQUIRED_MESSAGES: Record<OrderFieldKey, string> = {
  examDate: "検査日を選んでください",
  examTime: "予約時間を入力してください",
  examItem: "検査項目を入力してください",
  department: "依頼科を入力してください",
  physician: "依頼医を入力してください",
};

function emptyOrder(): OrderValues {
  return {
    examDate: format(new Date(), DATE_FORMAT),
    examTime: DEFAULT_TIME,
    examItem: "",
    department: "",
    physician: "",
  };
}

/** DB の検査日（"2026-11-27" や "2026/11/27"）を yyyy-MM-dd にそろえる */
function toDateValue(value: string): string {
  const nums = value.match(/\d+/g);
  if (!nums || nums.length < 3) return "";
  const [y, m, d] = nums;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function validateOrder(values: OrderValues) {
  const errors: Partial<Record<OrderFieldKey, string>> = {};
  for (const key of Object.keys(REQUIRED_MESSAGES) as OrderFieldKey[]) {
    if (!values[key].trim()) errors[key] = REQUIRED_MESSAGES[key];
  }
  return errors;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 編集する検査オーダー。省略すると新規登録 */
  order?: ExamOrder | null;
  /** 新規登録で使う患者の DB 上の id */
  patientDbId: number;
  /** 小児推奨量の計算に使う体重 */
  weight: number | null;
  onSaved: () => void;
}

export function ExamOrderDialog({
  open,
  onOpenChange,
  order,
  patientDbId,
  weight,
  onSaved,
}: Props) {
  const id = useId();
  const isEdit = Boolean(order);
  const { departments, physicians } = useRequesterOptions();
  const [values, setValues] = useState<OrderValues>(emptyOrder);
  const [injection, setInjection] = useState<InjectionValues>(EMPTY_INJECTION);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // 開くたびに初期化する（編集はそのオーダーの値、新規は今日の日付）
  useEffect(() => {
    if (!open) return;
    if (order) {
      setValues({
        examDate: toDateValue(order.exam_date),
        examTime: order.exam_time || DEFAULT_TIME,
        examItem: order.exam_item ?? "",
        department: order.requesting_department ?? "",
        physician: order.requesting_physician ?? "",
      });
      setInjection(toInjectionValues(order));
    } else {
      setValues(emptyOrder());
      setInjection(EMPTY_INJECTION);
    }
    setShowErrors(false);
    setSubmitError(null);
  }, [open, order]);

  const orderErrors = validateOrder(values);
  const injectionErrors = isEdit ? validateInjection(injection) : {};
  const set = (key: OrderFieldKey) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));
  const errorFor = (key: OrderFieldKey) =>
    showErrors ? orderErrors[key] : undefined;

  const selectedDate = parse(values.examDate, DATE_FORMAT, new Date());
  const hasDate = values.examDate !== "" && isValid(selectedDate);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      Object.keys(orderErrors).length > 0 ||
      Object.keys(injectionErrors).length > 0
    ) {
      setShowErrors(true);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    // DB には "yyyy-MM-dd" で保存する
    const fields = {
      examDate: values.examDate,
      examTime: values.examTime,
      examItem: values.examItem.trim(),
      requestingDepartment: values.department.trim(),
      requestingPhysician: values.physician.trim(),
    };
    try {
      if (order) {
        const payload = toInjectionPayload(injection);
        await invoke("edit_exam_order", {
          id: order.id,
          ...fields,
          ...payload,
          injectionTime:
            payload.injectionTime.trim() === "" ? null : payload.injectionTime,
        });
      } else {
        await invoke("add_exam_order", { patientDbId, ...fields });
      }
      toast.success(
        isEdit ? "検査オーダーを保存しました" : "検査オーダーを登録しました",
        {
          description: `${formatDateTimeWithDay(values.examDate)} ${values.examTime} ${fields.examItem}`,
        },
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      setSubmitError(
        errorMessage(
          err,
          isEdit
            ? "検査オーダーの保存に失敗しました。"
            : "検査オーダーの登録に失敗しました。",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "検査オーダーを編集" : "検査オーダーを登録"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "検査の内容と投与記録を直せます。"
                : "検査日・予約時間・検査項目と依頼元を入力してください。"}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-5">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field data-invalid={errorFor("examDate") ? true : undefined}>
                <FieldLabel htmlFor={`${id}-date`}>検査日</FieldLabel>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id={`${id}-date`}
                      type="button"
                      variant="outline"
                      className={cn(
                        "justify-start font-normal",
                        !hasDate && "text-muted-foreground",
                      )}
                      aria-invalid={errorFor("examDate") ? true : undefined}
                    >
                      <CalendarIcon className="text-muted-foreground" />
                      {hasDate
                        ? formatDateTimeWithDay(values.examDate)
                        : "日付を選択"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={ja}
                      selected={hasDate ? selectedDate : undefined}
                      defaultMonth={hasDate ? selectedDate : undefined}
                      onSelect={(date) => {
                        if (!date) return;
                        set("examDate")(format(date, DATE_FORMAT));
                        setCalendarOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {errorFor("examDate") && (
                  <FieldError>{errorFor("examDate")}</FieldError>
                )}
              </Field>
              <Field data-invalid={errorFor("examTime") ? true : undefined}>
                <FieldLabel htmlFor={`${id}-time`}>予約時間</FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="time"
                  value={values.examTime}
                  onChange={(e) => set("examTime")(e.target.value)}
                  aria-invalid={errorFor("examTime") ? true : undefined}
                  className="w-32 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden"
                />
                {errorFor("examTime") && (
                  <FieldError>{errorFor("examTime")}</FieldError>
                )}
              </Field>
            </div>

            <DatalistField
              id={`${id}-item`}
              label="検査項目"
              value={values.examItem}
              onChange={set("examItem")}
              options={EXAM_ITEMS}
              error={errorFor("examItem")}
            />

            <PediatricDoseNote examItem={values.examItem} weight={weight} />

            <div className="grid gap-3 sm:grid-cols-2">
              <DatalistField
                id={`${id}-department`}
                label="依頼科"
                value={values.department}
                onChange={set("department")}
                options={departments}
                error={errorFor("department")}
              />
              <DatalistField
                id={`${id}-physician`}
                label="依頼医"
                value={values.physician}
                onChange={set("physician")}
                options={physicians}
                error={errorFor("physician")}
              />
            </div>

            {isEdit && (
              <>
                <FieldSeparator>投与記録</FieldSeparator>
                <InjectionFields
                  id={`${id}-injection`}
                  values={injection}
                  onChange={setInjection}
                  errors={showErrors ? injectionErrors : {}}
                />
              </>
            )}
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
              {isSubmitting
                ? isEdit
                  ? "保存中…"
                  : "登録中…"
                : isEdit
                  ? "保存する"
                  : "登録する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 候補（datalist）付きの入力欄。候補にない値もそのまま入力できる */
function DatalistField({
  id,
  label,
  value,
  onChange,
  options,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  error?: string;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        list={`${id}-options`}
        value={value}
        autoComplete="off"
        placeholder="入力すると候補が出ます"
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${id}-options`}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
