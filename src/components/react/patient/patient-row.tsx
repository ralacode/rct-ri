// src/components/react/patient/patient-row.tsx
//
// 患者 1 人分の行（押すと患者詳細へ移る）。患者一覧と患者検索で使う。

import { ChevronRightIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { calculateAge, formatDateTimeWithDay, toKatakana } from "@/lib/utils";
import type { Patient } from "@/types/patient";

export function PatientRow({ patient }: { patient: Patient }) {
  const age = calculateAge(patient.birth_date);
  return (
    <a
      href={`/patient/detail/?id=${patient.patient_id}`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="@container/patient flex-row items-center gap-4 px-4 py-3 transition-colors group-hover:bg-muted/50">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-lg font-medium">
              {patient.last_name_kanji} {patient.first_name_kanji}
            </span>
            <span className="text-sm text-muted-foreground">
              {toKatakana(patient.last_name_kana)}{" "}
              {toKatakana(patient.first_name_kana)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            <span className="tabular-nums">
              ID <span className="text-foreground">{patient.patient_id}</span>
            </span>
            <span>
              {age !== null ? `${age}歳` : "年齢不明"}・{patient.gender}
            </span>
            <span className="hidden tabular-nums @md/patient:inline">
              登録日 {formatDateTimeWithDay(patient.created_at)}
            </span>
          </div>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Card>
    </a>
  );
}

export function PatientRowSkeleton() {
  return (
    <div className="grid gap-2 rounded-xl border px-4 py-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
