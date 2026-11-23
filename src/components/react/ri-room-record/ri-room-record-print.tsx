import { Printer } from "lucide-react";
import { useState, type FC } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { RiRoomRecordSheet } from "./ri-room-record-sheet";

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export const RiRoomRecordPrint: FC = () => {
  const [yearText, setYearText] = useState(() =>
    String(new Date().getFullYear()),
  );

  // 空欄なら年を手書きできるよう空欄のまま印刷する
  const isBlank = yearText.trim() === "";
  const year = Number(yearText);
  const isValidYear =
    isBlank ||
    (/^\d{4}$/.test(yearText) && year >= MIN_YEAR && year <= MAX_YEAR);

  const handlePrint = () => {
    if (!isValidYear) return;
    // PDF 保存時の既定ファイル名になるため、印刷中だけタイトルを差し替える
    const originalTitle = document.title;
    document.title = isBlank
      ? "放射性同位元素使用室作業内容記録"
      : `放射性同位元素使用室作業内容記録_${year}年`;
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
          <Label htmlFor="ri-room-record-year">西暦</Label>
          <div className="flex items-center gap-2">
            <Input
              id="ri-room-record-year"
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

      <p
        className={cn(
          "text-center text-sm print:hidden",
          isValidYear ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {isValidYear
          ? "西暦を空欄にすると、年を手書きできる空欄のまま印刷します。"
          : `西暦は ${MIN_YEAR}〜${MAX_YEAR} の 4 桁で入力してください。`}
      </p>

      {/* 印刷プレビュー（画面では用紙風に表示し、印刷時は帳票だけを出力する） */}
      <div className="overflow-x-auto print:overflow-visible">
        <div
          className={cn(
            "mx-auto w-fit bg-white p-[12mm] shadow-md ring-1 ring-black/10",
            "print:p-0 print:shadow-none print:ring-0",
          )}
        >
          <RiRoomRecordSheet
            year={isBlank || !isValidYear ? undefined : year}
          />
        </div>
      </div>
    </div>
  );
};
