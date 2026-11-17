import { Printer } from "lucide-react";
import { useState, type FC } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { ElutionRecordSheet } from "./elution-record-sheet";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export const ElutionRecordPrint: FC = () => {
  const [yearText, setYearText] = useState(() =>
    String(new Date().getFullYear()),
  );
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  const year = Number(yearText);
  const isValidYear =
    /^\d{4}$/.test(yearText) && year >= MIN_YEAR && year <= MAX_YEAR;

  const handlePrint = () => {
    if (!isValidYear) return;
    // PDF 保存時の既定ファイル名になるため、印刷中だけタイトルを差し替える
    const originalTitle = document.title;
    document.title = `ジェネレータ溶出記録_${year}年${month}月`;
    try {
      window.print();
    } finally {
      document.title = originalTitle;
    }
  };

  return (
    <div className="grid gap-6">
      <div
        className={cn(
          "flex flex-wrap items-end justify-center gap-4 print:hidden",
        )}
      >
        <div className="grid gap-2">
          <Label htmlFor="elution-year">西暦</Label>
          <div className="flex items-center gap-2">
            <Input
              id="elution-year"
              type="number"
              inputMode="numeric"
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={yearText}
              onChange={(e) => setYearText(e.target.value)}
              aria-invalid={!isValidYear}
              className="h-10 w-28 text-base"
            />
            <span>年</span>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="elution-month">月</Label>
          <div className="flex items-center gap-2">
            <Select
              value={String(month)}
              onValueChange={(value) => setMonth(Number(value))}
            >
              <SelectTrigger id="elution-month" className="h-10 w-20 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>月</span>
          </div>
        </div>

        <Button
          size="lg"
          className="h-10"
          onClick={handlePrint}
          disabled={!isValidYear}
        >
          <Printer />
          印刷
        </Button>
      </div>

      {!isValidYear && (
        <p className="text-center text-sm text-destructive print:hidden">
          西暦は {MIN_YEAR}〜{MAX_YEAR} の 4 桁で入力してください。
        </p>
      )}

      {/* 印刷プレビュー（画面では用紙風に表示し、印刷時は帳票だけを出力する） */}
      <div className="overflow-x-auto print:overflow-visible">
        <div
          className={cn(
            "mx-auto w-fit bg-white p-[12mm] shadow-md ring-1 ring-black/10",
            "print:p-0 print:shadow-none print:ring-0",
          )}
        >
          <ElutionRecordSheet
            year={isValidYear ? year : new Date().getFullYear()}
            month={month}
          />
        </div>
      </div>
    </div>
  );
};
