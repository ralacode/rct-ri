import { cn } from "@/lib/utils";
import React from "react";

interface Props {
  last_name_kanji: string;
  last_name_kana: string;
  first_name_kanji: string;
  first_name_kana: string;
  className?: string;
}

export const PatientName: React.FC<Props> = ({
  last_name_kanji,
  last_name_kana,
  first_name_kanji,
  first_name_kana,
  className,
}) => {
  return (
    <div className={cn(className)}>
      <ruby>
        {last_name_kanji}
        <rt>{last_name_kana}</rt>
      </ruby>{" "}
      <ruby>
        {first_name_kanji}
        <rt>{first_name_kana}</rt>
      </ruby>
    </div>
  );
};
