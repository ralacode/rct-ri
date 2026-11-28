// src/components/react/exam_order/daily-list/date-navigator.tsx
//
// 表示日の切り替え（前日・翌日・カレンダー・今日）。
// 日付は "YYYY-MM-DD" の文字列で受け渡す。

import { useState } from "react";
import { addDays, format, parse } from "date-fns";
import { ja } from "react-day-picker/locale";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTimeWithDay, getTodayLocalString } from "@/lib/utils";

const DATE_FORMAT = "yyyy-MM-dd";

const toDate = (value: string) => parse(value, DATE_FORMAT, new Date());
const toValue = (date: Date) => format(date, DATE_FORMAT);

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function DateNavigator({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const today = getTodayLocalString();
  const selected = toDate(value);

  const shift = (days: number) => onChange(toValue(addDays(selected, days)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ButtonGroup>
        <Button
          variant="outline"
          size="icon"
          aria-label="前の日"
          onClick={() => shift(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-48 font-medium">
              <CalendarIcon className="text-muted-foreground" />
              {formatDateTimeWithDay(value)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={ja}
              selected={selected}
              defaultMonth={selected}
              required
              onSelect={(date) => {
                if (!date) return;
                onChange(toValue(date));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="icon"
          aria-label="次の日"
          onClick={() => shift(1)}
        >
          <ChevronRightIcon />
        </Button>
      </ButtonGroup>
      <Button
        variant="ghost"
        disabled={value === today}
        onClick={() => onChange(today)}
      >
        今日
      </Button>
    </div>
  );
}
