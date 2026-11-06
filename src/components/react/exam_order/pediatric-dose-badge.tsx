// src/components/react/exam_order/pediatric-dose-badge.tsx
//
// 検査項目が DMSA / DTPA のとき、体重から 99mTc の推奨投与量を表示する

import type { FC } from "react";
import { cn } from "@/lib/utils";
import {
  calcPediatricTc99mDose,
  detectPediatricDoseDrug,
  PEDIATRIC_DOSE_SOURCE,
} from "@/lib/pediatric-dose";

interface Props {
  examItem: string | null | undefined;
  weight: number | null | undefined;
  className?: string;
}

export const PediatricDoseBadge: FC<Props> = ({
  examItem,
  weight,
  className,
}) => {
  const drug = detectPediatricDoseDrug(examItem);
  if (!drug) return null;

  const result = calcPediatricTc99mDose(drug, weight);

  return (
    <div
      className={cn(
        "grid gap-1 content-start rounded-md border border-sky-300 bg-sky-50 p-2 text-sky-950",
        className,
      )}
    >
      <div
        className={cn(
          "grid grid-flow-col gap-2 justify-between items-baseline",
        )}
      >
        <span className="text-sm">99mTc-{drug} 推奨量</span>
        <span className="text-xs text-sky-800">{PEDIATRIC_DOSE_SOURCE}</span>
      </div>

      {result ? (
        <>
          <div className="text-xl font-bold justify-self-end tracking-wide">
            {result.recommendedMbq.toFixed(1)} MBq
          </div>
          <div className="text-xs justify-self-end text-sky-900">
            体重 {result.weightKg} kg（表 {result.tableWeightLabel} kg）：
            {result.baseMbq.toFixed(1)} × {result.coefficient.toFixed(2)}
            {result.minApplied &&
              `＝${result.calculatedMbq.toFixed(1)} → 最小量 ${result.minMbq} MBq`}
          </div>
          {result.belowTable && (
            <div className="text-xs justify-self-end text-amber-700">
              体重が表の範囲外（3 kg 未満）のため 3 kg の係数で算出
            </div>
          )}
          {result.aboveTable && (
            <div className="text-xs justify-self-end text-amber-700">
              体重が表の範囲外（68 kg 超）のため 68 kg の係数で算出
            </div>
          )}
        </>
      ) : (
        <div className="text-sm justify-self-end text-amber-700">
          体重未登録のため算出できません
        </div>
      )}
    </div>
  );
};
