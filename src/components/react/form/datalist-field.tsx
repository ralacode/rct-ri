// src/components/react/form/datalist-field.tsx
//
// 候補（datalist）付きの入力欄。依頼科・依頼医・検査項目の入力で使う。

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export /** 候補（datalist）付きの入力欄。候補にない値もそのまま入力できる */
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
