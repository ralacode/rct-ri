import { Printer } from "lucide-react";
import { useState, type FC } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

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
    // 印刷時は帳票だけを出す（ページの余白や見出しは印刷しない）
    <PageContainer className="max-w-5xl print:mx-0 print:block print:max-w-none print:pt-0">
      <PageHeader
        className="print:hidden"
        title="放射性同位元素使用室作業内容記録"
        description="1 年分の作業内容記録の用紙を印刷します"
        actions={
          <Button onClick={handlePrint} disabled={!isValidYear}>
            <Printer />
            印刷
          </Button>
        }
      />

      <Card className="gap-0 py-0 print:hidden">
        <div className="flex flex-wrap items-end gap-4 p-4">
          <Field className="w-auto">
            <FieldLabel htmlFor="ri-room-record-year">西暦</FieldLabel>
            <InputGroup className="w-32">
              <InputGroupInput
                id="ri-room-record-year"
                type="number"
                inputMode="numeric"
                min={MIN_YEAR}
                max={MAX_YEAR}
                value={yearText}
                onChange={(e) => setYearText(e.target.value)}
                aria-invalid={!isValidYear}
                className="tabular-nums"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>年</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <p className="ml-auto self-center text-sm text-muted-foreground">
            下の用紙がそのまま印刷されます
          </p>
        </div>
        <p
          className={cn(
            "px-4 pb-4 text-sm",
            isValidYear ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {isValidYear
            ? "西暦を空欄にすると、年を手書きできる空欄のまま印刷します。"
            : `西暦は ${MIN_YEAR}〜${MAX_YEAR} の 4 桁で入力してください。`}
        </p>
      </Card>

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
    </PageContainer>
  );
};
