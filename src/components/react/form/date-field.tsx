// src/components/react/form/date-field.tsx
//
// カレンダーで日付を選ぶボタン。値は "yyyy-MM-dd" の文字列で受け渡す（空文字は未選択）。

import { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { ja } from "react-day-picker/locale";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDateTimeWithDay } from "@/lib/utils";

const DATE_FORMAT = "yyyy-MM-dd";

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
}

export function DateField({ id, value, onChange, invalid, className }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parse(value, DATE_FORMAT, new Date());
  const hasDate = value !== "" && isValid(selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "justify-start font-normal tabular-nums",
            !hasDate && "text-muted-foreground",
            className,
          )}
          aria-invalid={invalid ? true : undefined}
        >
          <CalendarIcon className="text-muted-foreground" />
          {hasDate ? formatDateTimeWithDay(value) : "日付を選択"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ja}
          selected={hasDate ? selected : undefined}
          defaultMonth={hasDate ? selected : undefined}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, DATE_FORMAT));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
