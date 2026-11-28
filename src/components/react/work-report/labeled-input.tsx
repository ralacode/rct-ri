// 作業報告書の画面で使う、ラベル付きの入力欄（ui の Field・Input を組み合わせたもの）。
import type { ComponentProps } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = ComponentProps<typeof Input> & {
  id: string;
  label: string;
};

export function LabeledInput({ id, label, required, ...rest }: Props) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </FieldLabel>
      <Input
        id={id}
        name={id}
        required={required}
        autoComplete="off"
        {...rest}
      />
    </Field>
  );
}
