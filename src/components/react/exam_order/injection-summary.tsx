import { cn } from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";
import type { FC } from "react";
import {
  InjectionDetails,
  InjectionDetailsContent,
} from "@components/react/exam_order/injection-details";

type InjectionSummaryFields = Pick<
  ExamOrder,
  | "dosage_mbq"
  | "dosage_ml"
  | "remain_mbq"
  | "remain_ml"
  | "injection_time"
>;

interface Props {
  order: InjectionSummaryFields;
  className?: string;
}

function hasInjectionSummary(order: InjectionSummaryFields): boolean {
  return (
    order.dosage_mbq !== null ||
    order.dosage_ml !== null ||
    order.remain_mbq !== null ||
    order.remain_ml !== null ||
    Boolean(order.injection_time)
  );
}

export const InjectionSummary: FC<Props> = ({ order, className }) => {
  if (!hasInjectionSummary(order)) return null;

  return (
    <div
      className={cn(
        "grid gap-2 content-start grid-flow-row",
        "[grid-template-areas:'one_two''three_four']",
        "lg:justify-end",
        className,
      )}
    >
      <InjectionDetails className={cn("[grid-area:three]")}>
        <div>投与時刻</div>
        {order.injection_time ? (
          <div className="justify-self-end tracking-widest">
            {order.injection_time}
          </div>
        ) : (
          <div className="justify-self-end tracking-widest">--:--</div>
        )}
      </InjectionDetails>

      <InjectionDetails className={cn("[grid-area:one]")}>
        <div>投与量</div>
        <InjectionDetailsContent>
          {order.dosage_mbq !== null ? (
            <div>{order.dosage_mbq} MBq</div>
          ) : (
            <div>- MBq</div>
          )}
          {order.dosage_ml !== null ? (
            <div>{order.dosage_ml} mL</div>
          ) : (
            <div>- mL</div>
          )}
        </InjectionDetailsContent>
      </InjectionDetails>

      <InjectionDetails className={cn("[grid-area:two]")}>
        <div>残量</div>
        <InjectionDetailsContent>
          {order.remain_mbq !== null ? (
            <div>{order.remain_mbq} MBq</div>
          ) : (
            <div>- MBq</div>
          )}
          {order.remain_ml !== null ? (
            <div>{order.remain_ml} mL</div>
          ) : (
            <div>- mL</div>
          )}
        </InjectionDetailsContent>
      </InjectionDetails>

      <InjectionDetails className={cn("[grid-area:four]")}>
        <div>実投与量</div>
        <InjectionDetailsContent>
          {order.dosage_mbq !== null && order.remain_mbq !== null ? (
            <div>{(order.dosage_mbq - order.remain_mbq).toFixed(1)} MBq</div>
          ) : (
            <div>- MBq</div>
          )}
          {order.dosage_ml !== null && order.remain_ml !== null ? (
            <div>{(order.dosage_ml - order.remain_ml).toFixed(1)} mL</div>
          ) : (
            <div>- mL</div>
          )}
        </InjectionDetailsContent>
      </InjectionDetails>
    </div>
  );
};
