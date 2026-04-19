import * as React from "react";
import styles from "@styles/my-input.module.css";

// interface Props {
//   className?: string;
//   labelClassName?: string;
//   inputClassName?: string;
//   id: string;
//   label: string;
//   type?: "text" | "email" | "tel" | "url";
//   placeholder?: string;
//   required?: boolean;
//   value: string;
//   onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
// }

// React.InputHTMLAttributes を継承することで、maxLength や min, max などの標準属性を網羅します
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
    <div className={`${styles.formField} ${className}`}>
      <label className={`${styles.fieldLabel} ${labelClassName}`} htmlFor={id}>
        {label}
      </label>
      <input
        className={`${styles.fieldControl} ${inputClassName}`}
        type={type}
        id={id}
        name={id}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={onChange}
        {...rest}
      />
    </div>
  );
};
