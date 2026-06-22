import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, isValid, parse } from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";

interface Props {
  valueString: string; // 親が管理している日付文字列 (例: "2026 / 06 / 17")
  timeString?: string;
  onChange: (dateStr: string) => void; // 値が変更されたときに親に通知する関数
  onChangeTime: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

function formatDateJapanese(date: Date | undefined) {
  if (!date) return "";
  // 'eeeeee' で「月」「火」「水」のような一文字の曜日になります
  return format(date, "yyyy年MM月dd日(eeeeee)", { locale: ja });
}

export const DatePickerTime: React.FC<Props> = ({
  valueString,
  timeString,
  onChange,
  onChangeTime,
  className,
}) => {
  const [open, setOpen] = React.useState(false);

  const dateValue = React.useMemo(() => {
    if (!valueString) return new Date(); // 親が空文字なら「今日」をデフォルトに
    const cleanStr = valueString.replace(/\s+/g, ""); // スペースを除去して解析
    const parsed = parse(cleanStr, "yyyy/MM/dd", new Date());
    return isValid(parsed) ? parsed : new Date();
  }, [valueString]);

  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [month, setMonth] = React.useState<Date | undefined>(date);

  React.useEffect(() => {
    setMonth(dateValue);
  }, [dateValue]);

  const displayValue = formatDateJapanese(valueString ? dateValue : undefined);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      // 既存のスマート入力に合わせて "yyyy / MM / dd" 形式で親に返す
      const formattedStr = format(selectedDate, "yyyy/MM/dd");
      onChange(formattedStr);
    } else {
      onChange("");
    }
    setOpen(false); // モーダルを閉じる
  };

  return (
    <FieldGroup className={className}>
      {/* 日にち */}
      <Field className="w-full">
        <FieldLabel htmlFor="date-required">検査日</FieldLabel>
        <InputGroup className="h-10">
          <InputGroupInput
            id="date-required"
            value={displayValue}
            placeholder="日付を選択"
            readOnly
          />
          <InputGroupAddon align="inline-end">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <InputGroupButton
                  id="date-picker"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="日付を選択"
                  className={cn("cursor-pointer")}
                >
                  <CalendarIcon />
                  <span className="sr-only">日付を選択</span>
                </InputGroupButton>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto overflow-hidden p-0"
                align="end"
                // alignOffset={-8}
                sideOffset={10}
              >
                <Calendar
                  mode="single"
                  locale={ja}
                  selected={valueString ? dateValue : undefined}
                  month={month}
                  onMonthChange={setMonth}
                  onSelect={handleSelect}
                />
              </PopoverContent>
            </Popover>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      {/* 時間 */}
      {timeString && (
        <Field className="w-full">
          <FieldLabel htmlFor="time-picker-optional">予約時間</FieldLabel>
          <Input
            type="time"
            id="time-picker-optional"
            value={timeString}
            onChange={onChangeTime}
            className="h-10 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
        </Field>
      )}
    </FieldGroup>
  );
};
