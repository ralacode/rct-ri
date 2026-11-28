// src/components/react/patient/patient-fields.tsx
//
// 患者の入力欄（氏名・性別・身長体重・生年月日の整形）。患者登録と患者情報の編集で使う。

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import type { Patient } from "@/types/patient";

/** 数字だけを取り出して "yyyy / MM / dd" の形に区切る（入力しながら整形する） */
export function formatBirthDateInput(input: string, previous: string): string {
  // 文字を消しているときは、そのまま受け入れる
  if (input.length < previous.length) return input;
  const digits = input.replace(/\D/g, "").slice(0, 8);
  let formatted = digits.slice(0, 4);
  if (digits.length >= 4) formatted += " / " + digits.slice(4, 6);
  if (digits.length >= 6) formatted += " / " + digits.slice(6, 8);
  return formatted;
}

/** 性別（男・女）の切り替えボタン */
export function GenderToggle({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: Patient["gender"];
  onChange: (value: "男" | "女") => void;
}) {
  return (
    <ButtonGroup aria-labelledby={labelledBy}>
      {(["男", "女"] as const).map((gender) => (
        <Button
          key={gender}
          type="button"
          variant={value === gender ? "default" : "outline"}
          aria-pressed={value === gender}
          onClick={() => onChange(gender)}
          className="w-16"
        >
          {gender}
        </Button>
      ))}
    </ButtonGroup>
  );
}

export function NamePair({
  legend,
  id,
  last,
  first,
  onLastChange,
  onFirstChange,
  lastPlaceholder,
  firstPlaceholder,
  error,
}: {
  legend: string;
  id: string;
  last: string;
  first: string;
  onLastChange: (value: string) => void;
  onFirstChange: (value: string) => void;
  lastPlaceholder: string;
  firstPlaceholder: string;
  error?: string;
}) {
  return (
    <FieldSet className="gap-2" data-invalid={error ? true : undefined}>
      <FieldLegend variant="label" className="mb-0">
        {legend}
      </FieldLegend>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${id}-last`} className="sr-only">
            姓
          </FieldLabel>
          <Input
            id={`${id}-last`}
            autoComplete="off"
            placeholder={`姓（例：${lastPlaceholder}）`}
            value={last}
            onChange={(e) => onLastChange(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-first`} className="sr-only">
            名
          </FieldLabel>
          <Input
            id={`${id}-first`}
            autoComplete="off"
            placeholder={`名（例：${firstPlaceholder}）`}
            value={first}
            onChange={(e) => onFirstChange(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </Field>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  );
}

export function UnitInput({
  id,
  unit,
  value,
  onChange,
  invalid,
}: {
  id: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        className="text-right tabular-nums"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
