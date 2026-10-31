import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@lib/utils";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  id: string;
  label: string;
}

export const MyInput = ({
  className = "",
  labelClassName = "",
  inputClassName = "",
  id,
  label,
  type = "text",
  placeholder = "",
  required = false,
  value,
  onChange,
  ...rest
}: Props) => {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        type={type}
        id={id}
        name={id}
        className={cn("h-10 text-base", inputClassName)}
        required={required}
        value={value}
        autoComplete="off"
        onChange={onChange}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  );
};
