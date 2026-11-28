// src/components/react/ultratechnekow-calculator.tsx
//
// ウルトラテクネカウ（99Mo-99mTc ジェネレータ）の減衰計算。
// 検定日時と検定時放射能から、翌日以降の 12:00 の推定放射能を出す。

import { useId, useMemo, useState } from "react";
import { format, isValid, parse } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { formatDateJapanese } from "@/lib/utils";
import { DateField } from "@components/react/form/date-field";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

const ACTIVITY_OPTIONS = [
  { label: "925 MBq", value: "925" },
  { label: "1.85 GBq", value: "1850" },
  { label: "3.7 GBq", value: "3700" },
];

export function UltraTechnekowCalculator() {
  const id = useId();
  const [calibrationDate, setCalibrationDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [calibrationTime, setCalibrationTime] = useState("12:00");
  const [calibrationActivity, setCalibrationActivity] = useState("925");

  const results = useMemo(() => {
    const date = parse(calibrationDate, "yyyy-MM-dd", new Date());
    if (!isValid(date) || !calibrationTime) return [];
    // 計算は "yyyy/MM/dd" で受け取る
    return calculateMo99Decay(
      format(date, "yyyy/MM/dd"),
      calibrationTime,
      Number(calibrationActivity),
    );
  }, [calibrationDate, calibrationTime, calibrationActivity]);

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader
        title="ウルトラテクネカウ減衰計算"
        description="検定日時と検定時放射能から、各日 12:00 の推定放射能を計算します"
      />

      <Card className="py-0">
        <CardContent className="py-6">
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
              <Field>
                <FieldLabel htmlFor={`${id}-date`}>検定日</FieldLabel>
                <DateField
                  id={`${id}-date`}
                  value={calibrationDate}
                  onChange={setCalibrationDate}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-time`}>検定時刻</FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="time"
                  value={calibrationTime}
                  onChange={(e) => setCalibrationTime(e.target.value)}
                  className="w-32 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${id}-activity`}>検定時放射能</FieldLabel>
              <Select
                value={calibrationActivity}
                onValueChange={setCalibrationActivity}
              >
                <SelectTrigger id={`${id}-activity`} className="w-full sm:w-48">
                  <SelectValue placeholder="放射能を選択" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">推定放射能（各日 12:00）</h2>
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">経過日数</TableHead>
                <TableHead>日付</TableHead>
                <TableHead className="pr-4 text-right">放射能</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-muted-foreground"
                  >
                    検定日と検定時刻を入力してください
                  </TableCell>
                </TableRow>
              ) : (
                results.map((result) => (
                  <TableRow key={result.date}>
                    <TableCell className="pl-4 tabular-nums">
                      +{result.day}日
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateJapanese(
                        parse(result.date, "yyyy/MM/dd", new Date()),
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">
                      {result.activity}{" "}
                      <span className="font-normal text-muted-foreground">
                        MBq
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </PageContainer>
  );
}
