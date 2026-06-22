import * as React from "react";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  datalistClassName?: string;
  id: string;
  label: string;
  options: string[];
}

export const DatalistInput = ({
  className = "",
  labelClassName = "",
  inputClassName = "",
  datalistClassName = "",
  id,
  label,
  list,
  type = "text",
  placeholder = "",
  required = false,
  value,
  onChange,
  options,
  ...rest
}: Props) => {
  return (
    <div className={cn("grid gap-2")}>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        name={id}
        type={type}
        list={list}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={inputClassName}
        {...rest}
      />
      <datalist id={list}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
};
