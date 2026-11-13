import { useEffect, useState } from "react";
import { format, getISODay } from "date-fns";
import { DatalistInput } from "@/components/react/datalist-input";
import { DatePickerTime } from "@/components/react/date-picker-time";
import { MyButton } from "@/components/react/my-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTreatmentSchedule, TREATMENT_SLOTS } from "@/lib/treatment";
import type { TreatmentRequestInput } from "@/lib/treatment";
import { PHYSICIAN } from "@/lib/secret-utils";
import {
  cn,
  DEPARTMENTS,
  normalizeToDbDateFormat,
  normalizeToDisplayDateFormat,
} from "@/lib/utils";

export type TreatmentRequestDraft = TreatmentRequestInput;

export function TreatmentRequestDialog({
  open,
  title,
  initial,
  idPrefix = "treatment-request",
  onOpenChange,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  title: string;
  initial?: TreatmentRequestDraft;
  idPrefix?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: TreatmentRequestDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>(TREATMENT_SLOTS[0].value);
  const [department, setDepartment] = useState("");
  const [physician, setPhysician] = useState("");
  const [openWeekdays, setOpenWeekdays] = useState<number[]>([1, 3, 4]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(
      initial
        ? normalizeToDisplayDateFormat(initial.requestDate)
        : format(new Date(), "yyyy/MM/dd"),
    );
    setSlot(initial?.slotTime || TREATMENT_SLOTS[0].value);
    setDepartment(initial?.requestingDepartment ?? "");
    setPhysician(initial?.requestingPhysician ?? "");
    setError(null);
    void getTreatmentSchedule()
      .then((schedule) => setOpenWeekdays(schedule.openWeekdays))
      .catch(() => setOpenWeekdays([1, 3, 4]));
  }, [
    open,
    initial?.requestDate,
    initial?.slotTime,
    initial?.requestingDepartment,
    initial?.requestingPhysician,
  ]);

  const keptDate = initial?.requestDate ?? "";

  const submit = async () => {
    const requestDate = normalizeToDbDateFormat(date);
    if (!requestDate || !slot || !department.trim() || !physician.trim()) {
      setError("日付、時間枠、依頼科、依頼医を入力してください。");
      return;
    }
    if (slot === "15:30" && initial?.slotTime !== "15:30") {
      const confirmed = window.confirm(
        "15:30 は臨時枠です。この枠に入れますか？",
      );
      if (!confirmed) return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        requestDate,
        slotTime: slot,
        requestingDepartment: department.trim(),
        requestingPhysician: physician.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    if (!window.confirm("この治療依頼を削除しますか？")) return;
    setPending(true);
    setError(null);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-(family-name:--font-family)! text-my-gray!">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          治療依頼の日付、時間枠、依頼科、依頼医を入力します
        </DialogDescription>
        <div className="grid gap-4">
          <DatePickerTime
            inputId={`${idPrefix}-date`}
            valueString={date}
            onChange={setDate}
            dateText="日付"
            disabledDates={(day) => {
              const iso = format(day, "yyyy-MM-dd");
              if (keptDate && iso === keptDate) return false;
              return !openWeekdays.includes(getISODay(day));
            }}
          />
          <label className="grid gap-2 text-sm">
            時間枠
            <select
              value={slot}
              onChange={(event) => setSlot(event.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-base"
            >
              {TREATMENT_SLOTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <DatalistInput
            id={`${idPrefix}-department`}
            label="依頼科"
            list={`${idPrefix}-department-list`}
            placeholder="依頼科を入力..."
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            options={DEPARTMENTS}
            inputClassName="h-10"
          />
          <DatalistInput
            id={`${idPrefix}-physician`}
            label="依頼医"
            list={`${idPrefix}-physician-list`}
            placeholder="依頼医を入力..."
            value={physician}
            onChange={(event) => setPhysician(event.target.value)}
            options={PHYSICIAN}
            inputClassName="h-10"
          />
          <p className="text-sm text-muted-foreground">
            診療曜日の枠に登録できます。15:30 は臨時枠です。
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className={cn("grid")}>
          <MyButton onClick={() => void submit()} disabled={pending}>
            {pending ? "保存中..." : "保存する"}
          </MyButton>
          {onDelete && (
            <MyButton
              className="bg-red-500"
              onClick={() => void remove()}
              disabled={pending}
            >
              削除する
            </MyButton>
          )}
          <DialogClose asChild>
            <MyButton className="bg-red-500">キャンセル</MyButton>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
