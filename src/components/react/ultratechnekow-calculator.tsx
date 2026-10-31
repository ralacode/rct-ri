// src/components/react/ultratechnekow-calculator.tsx

import { useMemo, useState, type FC } from "react";
import { Card } from "@components/react/card";
import { DatePickerTime } from "@components/react/date-picker-time";
import { format, parse } from "date-fns";
import { cn, formatDateJapanese } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculateMo99Decay } from "@/lib/mo99-decay";

export const UltraTechnekowCalculator: FC = () => {
  const [calibrationDate, setCalibrationDate] = useState(() => {
    // 既存のフォーマット "yyyy / MM / dd" に合わせて今日の文字列を生成
    return format(new Date(), "yyyy/MM/dd");
  });
  const [calibrationTime, setCalibrationTime] = useState<string>("12:00");
  const [calibrationActivity, setCalibrationActivity] = useState<string>("925");

  const activityOptions = [
    { label: "925 MBq", value: "925" },
    { label: "1.85 GBq", value: "1850" },
    { label: "3.7 GBq", value: "3700" },
  ];

  // const results = [
  //   { day: "+1日", date: "2026/08/02", activity: "902 MBq" },
  //   { day: "+2日", date: "2026/08/03", activity: "879 MBq" },
  //   { day: "+3日", date: "2026/08/04", activity: "856 MBq" },
  // ];

  const results = useMemo(() => {
    return calculateMo99Decay(
      calibrationDate,
      calibrationTime,
      Number(calibrationActivity),
    );
  }, [calibrationDate, calibrationTime, calibrationActivity]);

  return (
    <div className={cn("@container")}>
      <Card className={cn("grid gap-4", "@lg:mx-auto @lg:max-w-md")}>
        <DatePickerTime
          valueString={calibrationDate}
          timeString={calibrationTime}
          onChange={setCalibrationDate}
          onChangeTime={(e) => setCalibrationTime(e.target.value)}
          dateText="検定日"
          timeText="時間"
          className={cn("@md:grid @md:grid-flow-col")}
        />

        {/* 検定時放射能 */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">検定時放射能</label>

          <Select
            value={calibrationActivity}
            onValueChange={setCalibrationActivity}
          >
            <SelectTrigger
              className={cn("h-auto min-h-10 px-3 py-3 text-base")}
            >
              <SelectValue placeholder="放射能を選択" />
            </SelectTrigger>

            <SelectContent>
              {activityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">
            推定放射能（12:00の放射能）
          </label>

          <div className={cn("rounded-md border")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>経過日数</TableHead>
                  <TableHead>日付</TableHead>
                  <TableHead className="text-right">放射能</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {results.map((result) => (
                  <TableRow key={result.date}>
                    <TableCell className="text-base">+{result.day}日</TableCell>
                    <TableCell className="text-base">
                      {formatDateJapanese(
                        parse(result.date, "yyyy/MM/dd", new Date()),
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-right text-base">
                      {result.activity} MBq
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    </div>
  );
};
