import { useEffect, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  getISODay,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { onDataChanged } from "@/lib/live";
import {
  closeTreatmentSlot,
  DAY_CLOSURE,
  deleteTreatmentRequest,
  getTreatmentBoard,
  openTreatmentSlot,
  saveTreatmentRemark,
  saveTreatmentSchedule,
  updateTreatmentRequest,
  WEEKDAYS,
  weekdayLabel,
  type SlotClosure,
  type TreatmentBoard,
  type TreatmentRequest,
} from "@/lib/treatment";
import { cn, toKatakana } from "@/lib/utils";
import { PatientName } from "@/components/react/patient-name";
import {
  TreatmentRequestDialog,
  type TreatmentRequestDraft,
} from "@/components/react/treatment/request-dialog";

type DayColumn = {
  iso: string;
  weekday: number;
  label: string;
  day: number;
  month: number;
};

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function buildWeeks(
  month: string,
  openWeekdays: number[],
  extraDates: Set<string>,
) {
  const start = startOfMonth(parse(`${month}-01`, "yyyy-MM-dd", new Date()));
  const end = endOfMonth(start);
  let cursor = startOfWeek(start, { weekStartsOn: 1 });
  const weeks: DayColumn[][] = [];
  while (cursor <= end) {
    const days: DayColumn[] = [];
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(cursor, index);
      if (date < start || date > end) continue;
      const iso = format(date, "yyyy-MM-dd");
      const weekday = getISODay(date);
      if (openWeekdays.includes(weekday) || extraDates.has(iso)) {
        days.push({
          iso,
          weekday,
          label: weekdayLabel(weekday),
          day: date.getDate(),
          month: date.getMonth() + 1,
        });
      }
    }
    if (days.length > 0) weeks.push(days);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function extraDates(board: TreatmentBoard) {
  const dates = new Set<string>();
  const consider = (iso: string) => {
    const weekday = getISODay(parse(iso, "yyyy-MM-dd", new Date()));
    if (!board.openWeekdays.includes(weekday)) dates.add(iso);
  };
  board.requests.forEach((request) => consider(request.requestDate));
  board.closures.forEach((closure) => consider(closure.closureDate));
  board.remarks.forEach((remark) => consider(remark.remarkDate));
  return dates;
}

const closedStyle = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent, transparent 7px, rgba(100,100,100,0.18) 7px, rgba(100,100,100,0.18) 8px)",
};

export function TreatmentBoard() {
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [board, setBoard] = useState<TreatmentBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekdayDraft, setWeekdayDraft] = useState<number[] | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<TreatmentRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getTreatmentBoard(month);
        if (cancelled) return;
        setBoard(next);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
    };
    void load();
    const stop = onDataChanged(() => {
      void load();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [month]);

  useEffect(() => {
    if (board && weekdayDraft === null) {
      setWeekdayDraft(board.openWeekdays);
    }
  }, [board, weekdayDraft]);

  const requestAt = (date: string, slot: string) =>
    board?.requests.find(
      (request) => request.requestDate === date && request.slotTime === slot,
    );

  const closureAt = (date: string, slot: string) =>
    board?.closures.find(
      (closure) => closure.closureDate === date && closure.slotTime === slot,
    );

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const remarkValue = (date: string) => {
    if (Object.prototype.hasOwnProperty.call(remarkDrafts, date)) {
      return remarkDrafts[date];
    }
    return (
      board?.remarks.find((remark) => remark.remarkDate === date)?.body ?? ""
    );
  };

  const commitRemark = (date: string) => {
    const next = remarkValue(date).trim();
    const saved =
      board?.remarks.find((remark) => remark.remarkDate === date)?.body ?? "";
    if (next === saved) return;
    void run(async () => {
      await saveTreatmentRemark(date, next);
      setRemarkDrafts((prev) => {
        const copy = { ...prev };
        delete copy[date];
        return copy;
      });
    });
  };

  const saveWeekdays = () => {
    if (!weekdayDraft || weekdayDraft.length === 0) {
      setError("診療曜日は1つ以上選んでください。");
      return;
    }
    void run(async () => {
      const saved = await saveTreatmentSchedule(weekdayDraft);
      setWeekdayDraft(saved.openWeekdays);
    });
  };

  const saveExisting = async (input: TreatmentRequestDraft) => {
    if (!editing) return;
    await updateTreatmentRequest(editing.id, input);
  };

  const removeEditing = async () => {
    if (!editing) return;
    await deleteTreatmentRequest(editing.id);
  };

  const monthDate = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  const weeks = board
    ? buildWeeks(board.month, board.openWeekdays, extraDates(board))
    : [];
  const canEdit = board?.canEdit ?? false;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">治療依頼表</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setMonth(format(addMonths(monthDate, -1), "yyyy-MM"))
            }
          >
            前月
          </Button>
          <div className="min-w-28 text-center font-medium">
            {format(monthDate, "yyyy年M月")}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth(format(addMonths(monthDate, 1), "yyyy-MM"))}
          >
            次月
          </Button>
        </div>
      </div>

      {board && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="text-sm font-medium">診療曜日</div>
          {canEdit && weekdayDraft ? (
            <div className="flex flex-wrap items-center gap-3">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="flex items-center gap-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={weekdayDraft.includes(day.value)}
                    onChange={() =>
                      setWeekdayDraft((current) => {
                        const values = current ?? [];
                        return values.includes(day.value)
                          ? values.filter((value) => value !== day.value)
                          : [...values, day.value].sort((a, b) => a - b);
                      })
                    }
                  />
                  {day.label}
                </label>
              ))}
              <Button type="button" size="sm" onClick={saveWeekdays}>
                保存
              </Button>
            </div>
          ) : (
            <p className="text-sm">
              {board.openWeekdays.map(weekdayLabel).join("・")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            13:30 と 14:30 が通常枠、15:30
            は臨時枠です。曜日を変えても、入っている依頼は残ります。
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!board && !error && (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      )}

      {board &&
        weeks.map((week) => (
          <div key={week[0]?.iso} className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-24 border bg-muted/40 p-2" />
                  {week.map((day) => {
                    const closed = closureAt(day.iso, DAY_CLOSURE);
                    const occupied = board.requests.some(
                      (request) => request.requestDate === day.iso,
                    );
                    return (
                      <th
                        key={day.iso}
                        className="border bg-muted/40 p-2 font-medium"
                      >
                        <div>
                          {day.label} {day.month}/{day.day}
                        </div>
                        {closed && <div className="mt-1 text-xs">休診</div>}
                        {canEdit && !closed && !occupied && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-1"
                            onClick={() =>
                              void run(() =>
                                closeTreatmentSlot(day.iso, DAY_CLOSURE),
                              )
                            }
                          >
                            休診にする
                          </Button>
                        )}
                        {canEdit && closed && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-1"
                            onClick={() =>
                              void run(() => openTreatmentSlot(closed.id))
                            }
                          >
                            休診を解除
                          </Button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {board.slots.map((slot) => (
                  <tr key={slot}>
                    <th className="border bg-muted/20 p-2 text-left font-medium">
                      {slot}
                      {slot === "15:30" ? " 臨時" : ""}
                    </th>
                    {week.map((day) => (
                      <SlotCell
                        key={`${day.iso}-${slot}`}
                        request={requestAt(day.iso, slot)}
                        closure={closureAt(day.iso, slot)}
                        dayClosed={Boolean(closureAt(day.iso, DAY_CLOSURE))}
                        canEdit={canEdit}
                        onEdit={setEditing}
                        onClose={() =>
                          void run(() => closeTreatmentSlot(day.iso, slot))
                        }
                        onOpen={(id) => void run(() => openTreatmentSlot(id))}
                      />
                    ))}
                  </tr>
                ))}
                <tr>
                  <th className="border bg-muted/20 p-2 text-left align-top font-medium">
                    備考
                  </th>
                  {week.map((day) => (
                    <td
                      key={`${day.iso}-remark`}
                      className="border p-2 align-top"
                    >
                      {canEdit ? (
                        <Textarea
                          value={remarkValue(day.iso)}
                          rows={3}
                          aria-label={`${day.month}/${day.day} の備考`}
                          onChange={(event) =>
                            setRemarkDrafts((prev) => ({
                              ...prev,
                              [day.iso]: event.target.value,
                            }))
                          }
                          onBlur={() => commitRemark(day.iso)}
                        />
                      ) : (
                        <p className="min-h-16 whitespace-pre-wrap text-sm">
                          {remarkValue(day.iso) || "—"}
                        </p>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))}

      <TreatmentRequestDialog
        open={editing !== null}
        title="治療依頼の変更"
        initial={
          editing
            ? {
                requestDate: editing.requestDate,
                slotTime: editing.slotTime,
                requestingDepartment: editing.requestingDepartment,
                requestingPhysician: editing.requestingPhysician,
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={saveExisting}
        onDelete={removeEditing}
      />
    </div>
  );
}

function SlotCell({
  request,
  closure,
  dayClosed,
  canEdit,
  onEdit,
  onClose,
  onOpen,
}: {
  request?: TreatmentRequest;
  closure?: SlotClosure;
  dayClosed: boolean;
  canEdit: boolean;
  onEdit: (request: TreatmentRequest) => void;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const closed = dayClosed || Boolean(closure);
  return (
    <td
      className={cn(
        "relative min-h-28 border p-1 align-middle",
        closed && "text-muted-foreground",
      )}
      style={closed ? closedStyle : undefined}
    >
      {request && (
        <>
          <div className="absolute inset-x-1 top-0.5 text-[11px] leading-tight text-muted-foreground">
            {request.requestingDepartment}
          </div>
          <a
            href={`/patient/detail/?id=${request.patientId}`}
            className="flex h-full items-center justify-center px-1 pt-4 text-center text-foreground"
          >
            <PatientName
              last_name_kanji={request.lastNameKanji}
              first_name_kanji={request.firstNameKanji}
              last_name_kana={toKatakana(request.lastNameKana)}
              first_name_kana={toKatakana(request.firstNameKana)}
            />
          </a>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="absolute right-1 bottom-1 z-10 h-7 px-2"
              onClick={() => onEdit(request)}
            >
              変更
            </Button>
          )}
        </>
      )}
      {!request && canEdit && !dayClosed && !closure && (
        <div className="grid h-full place-items-center">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            閉じる
          </Button>
        </div>
      )}
      {!request && canEdit && !dayClosed && closure && (
        <div className="grid h-full place-items-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpen(closure.id)}
          >
            開ける
          </Button>
        </div>
      )}
    </td>
  );
}
