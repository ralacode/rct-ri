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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

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
    // 印刷時は帳票だけを出す（ページの余白や見出しは印刷しない）
    <PageContainer className="max-w-5xl print:mx-0 print:block print:max-w-none print:pt-0">
      <PageHeader
        className="print:hidden"
        title="ジェネレータ溶出記録"
        description="年と月を選んで、1 か月分の溶出記録の用紙を印刷します"
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
            <FieldLabel htmlFor="elution-year">西暦</FieldLabel>
            <InputGroup className="w-32">
              <InputGroupInput
                id="elution-year"
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
          <Field className="w-auto">
            <FieldLabel htmlFor="elution-month">月</FieldLabel>
            <Select
              value={String(month)}
              onValueChange={(value) => setMonth(Number(value))}
            >
              <SelectTrigger id="elution-month" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} 月
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <p className="ml-auto self-center text-sm text-muted-foreground">
            下の用紙がそのまま印刷されます
          </p>
        </div>
        {!isValidYear ? (
          <FieldError className="px-4 pb-4">
            西暦は {MIN_YEAR}〜{MAX_YEAR} の 4 桁で入力してください。
          </FieldError>
        ) : null}
      </Card>

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
    </PageContainer>
  );
};
