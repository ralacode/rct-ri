import { useEffect, useState } from "react";
import { format, getISODay } from "date-fns";
import { TriangleAlertIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { DatePickerTime } from "@/components/react/date-picker-time";
import { DatalistField } from "@/components/react/form/datalist-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { onDataChanged } from "@/lib/live";
import {
  closureMessages,
  DAY_CLOSURE,
  getTreatmentSchedule,
  listTreatmentClosures,
  TREATMENT_SLOTS,
} from "@/lib/treatment";
import type { SlotClosure, TreatmentRequestInput } from "@/lib/treatment";
import { useRequesterOptions } from "@/lib/requesters";
import {
  errorMessage,
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
  const { departments, physicians } = useRequesterOptions();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>(TREATMENT_SLOTS[0].value);
  const [department, setDepartment] = useState("");
  const [physician, setPhysician] = useState("");
  const [openWeekdays, setOpenWeekdays] = useState<number[]>([1, 3, 4]);
  const [closures, setClosures] = useState<SlotClosure[]>([]);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setDate("");
      setClosures([]);
      setClosureError(null);
      return;
    }
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

  useEffect(() => {
    if (!open) return;
    const requestDate = normalizeToDbDateFormat(date);
    if (!requestDate) {
      setClosures([]);
      setClosureError(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void listTreatmentClosures(requestDate)
        .then((rows) => {
          if (cancelled) return;
          setClosures(rows);
          setClosureError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setClosures([]);
          setClosureError("閉じ枠を確認できませんでした");
        });
    };
    load();
    const stop = onDataChanged(load);
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, date]);

  const keptDate = initial?.requestDate ?? "";
  const notices = closureMessages(closures);
  const dayClosed = closures.some(
    (closure) => closure.slotTime === DAY_CLOSURE,
  );
  const closedSlots = new Set(
    closures
      .filter((closure) => closure.slotTime !== DAY_CLOSURE)
      .map((closure) => closure.slotTime),
  );

  /** 臨時枠（15:30）に新しく入れるときと、削除するときは確認する */
  const [confirming, setConfirming] = useState<"temporary" | "delete" | null>(
    null,
  );

  const submit = async (temporaryConfirmed = false) => {
    const requestDate = normalizeToDbDateFormat(date);
    if (!requestDate || !slot || !department.trim() || !physician.trim()) {
      setError("日付、時間枠、依頼科、依頼医を入力してください。");
      return;
    }
    if (
      slot === "15:30" &&
      initial?.slotTime !== "15:30" &&
      !temporaryConfirmed
    ) {
      setConfirming("temporary");
      return;
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
      toast.success("治療依頼を保存しました");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました。"));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setPending(true);
    setError(null);
    try {
      await onDelete();
      toast.success("治療依頼を削除しました");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "削除に失敗しました。"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                診療曜日の枠に登録できます。15:30 は臨時枠です。
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="gap-5">
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
              {notices.length > 0 && (
                <div
                  role="status"
                  className="flex gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="grid gap-0.5">
                    {notices.map((notice) => (
                      <p key={notice}>{notice}</p>
                    ))}
                  </div>
                </div>
              )}
              {closureError && (
                <p className="text-sm text-destructive">{closureError}</p>
              )}

              <Field>
                <FieldLabel htmlFor={`${idPrefix}-slot`}>時間枠</FieldLabel>
                <Select value={slot} onValueChange={setSlot}>
                  <SelectTrigger id={`${idPrefix}-slot`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TREATMENT_SLOTS.map((item) => {
                      const closed = dayClosed || closedSlots.has(item.value);
                      return (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                          {closed ? "（閉じています）" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <DatalistField
                  id={`${idPrefix}-department`}
                  label="依頼科"
                  value={department}
                  onChange={setDepartment}
                  options={departments}
                />
                <DatalistField
                  id={`${idPrefix}-physician`}
                  label="依頼医"
                  value={physician}
                  onChange={setPhysician}
                  options={physicians}
                />
              </div>
            </FieldGroup>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter className="sm:justify-between">
              {onDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setConfirming("delete")}
                >
                  <Trash2Icon />
                  削除
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    キャンセル
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "保存中…" : "保存する"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => !next && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "delete"
                ? "この治療依頼を削除しますか？"
                : "15:30 の臨時枠に入れますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "delete"
                ? "削除すると元に戻せません。"
                : "15:30 は臨時枠です。通常は 13:30 か 14:30 の枠に入れます。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "delete" ? "destructive" : "default"}
              onClick={() => {
                const kind = confirming;
                setConfirming(null);
                if (kind === "delete") void remove();
                else void submit(true);
              }}
            >
              {confirming === "delete" ? "削除する" : "臨時枠に入れる"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
