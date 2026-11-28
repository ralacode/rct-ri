// src/components/react/exam_order/pediatric-dose-note.tsx
//
// 検査項目が DMSA / DTPA のとき、体重から 99mTc の推奨投与量を表示する（画面用）。

import { BabyIcon, TriangleAlertIcon } from "lucide-react";
import {
  calcPediatricTc99mDose,
  detectPediatricDoseDrug,
  PEDIATRIC_DOSE_SOURCE,
} from "@/lib/pediatric-dose";
import { cn } from "@/lib/utils";

interface Props {
  examItem: string | null | undefined;
  weight: number | null | undefined;
  className?: string;
}

export function PediatricDoseNote({ examItem, weight, className }: Props) {
  const drug = detectPediatricDoseDrug(examItem);
  if (!drug) return null;

  const result = calcPediatricTc99mDose(drug, weight);

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm",
        className,
      )}
    >
      <BabyIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-muted-foreground">99mTc-{drug} 小児推奨量</span>
          {result ? (
            <span className="text-base font-semibold tabular-nums">
              {result.recommendedMbq.toFixed(1)} MBq
            </span>
          ) : (
            <span className="flex items-center gap-1 font-medium text-destructive">
              <TriangleAlertIcon className="size-3.5" />
              体重未登録のため算出できません
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {PEDIATRIC_DOSE_SOURCE}
          </span>
        </div>
        {result && (
          <p className="text-xs text-muted-foreground tabular-nums">
            体重 {result.weightKg} kg（表 {result.tableWeightLabel} kg）：
            {result.baseMbq.toFixed(1)} × {result.coefficient.toFixed(2)}
            {result.minApplied &&
              ` ＝ ${result.calculatedMbq.toFixed(1)} → 最小量 ${result.minMbq} MBq`}
            {result.belowTable && "　※3 kg 未満のため 3 kg の係数で算出"}
            {result.aboveTable && "　※68 kg 超のため 68 kg の係数で算出"}
          </p>
        )}
      </div>
    </div>
  );
}
