// src/components/react/treatment/board.tsx
//
// 治療依頼表。月ごとに、診療曜日の枠（13:30・14:30・15:30 臨時）を週単位の表で表示する。
// 編集できる人（放射線治療の担当者）は、枠の開け閉め・休診・備考・依頼の変更ができる。

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
import {
  CalendarCogIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FileUpIcon,
  LockIcon,
  LockOpenIcon,
  PencilIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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
  type TreatmentBoard as Board,
  type TreatmentRequest,
} from "@/lib/treatment";
import { cn, errorMessage, getTodayLocalString, toKatakana } from "@/lib/utils";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";
import {
  TreatmentRequestDialog,
  type TreatmentRequestDraft,
} from "@/components/react/treatment/request-dialog";
import { RtOrderImport } from "@/components/react/treatment/rt-order-import";

type DayColumn = {
  iso: string;
  weekday: number;
  label: string;
  day: number;
  month: number;
};

/** その月の、診療曜日（と依頼・閉じ枠・備考がある日）を週ごとに並べる */
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

/** 診療曜日以外で、依頼・閉じ枠・備考が入っている日 */
function extraDates(board: Board) {
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

/** 閉じた枠の斜線（ライト・ダークどちらでも見えるよう文字色から作る） */
const closedStyle = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in oklab, var(--muted-foreground) 22%, transparent) 7px 8px)",
};

/** URL の ?month=YYYY-MM があればその月、なければ今月を最初に開く。 */
function initialMonth(): string {
  if (typeof window !== "undefined") {
    const param = new URLSearchParams(window.location.search).get("month");
    if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return param;
  }
  return format(new Date(), "yyyy-MM");
}

export function TreatmentBoard() {
  const [month, setMonth] = useState(initialMonth);
  const [board, setBoard] = useState<Board | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<TreatmentRequest | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getTreatmentBoard(month);
        if (cancelled) return;
        setBoard(next);
        setLoadError(null);
      } catch (err) {
        if (!cancelled)
          setLoadError(errorMessage(err, "読み込みに失敗しました"));
      }
    };
    void load();
    const stop = onDataChanged(() => void load());
    return () => {
      cancelled = true;
      stop();
    };
  }, [month]);

  const requestAt = (date: string, slot: string) =>
    board?.requests.find(
      (request) => request.requestDate === date && request.slotTime === slot,
    );

  const closureAt = (date: string, slot: string) =>
    board?.closures.find(
      (closure) => closure.closureDate === date && closure.slotTime === slot,
    );

  /** 枠の開け閉めなどを実行し、失敗したら通知で知らせる */
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err) {
      toast.error(errorMessage(err, "操作に失敗しました"));
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

  const saveExisting = async (input: TreatmentRequestDraft) => {
    if (!editing) return;
    await updateTreatmentRequest(editing.id, input);
  };

  const removeEditing = async () => {
    if (!editing) return;
    await deleteTreatmentRequest(editing.id);
  };

  const monthDate = parse(`${month}-01`, "yyyy-MM-dd", new Date());
  const thisMonth = format(new Date(), "yyyy-MM");
  const weeks = board
    ? buildWeeks(board.month, board.openWeekdays, extraDates(board))
    : [];
  const canEdit = board?.canEdit ?? false;
  const today = getTodayLocalString();

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        title="治療依頼表"
        description={
          board
            ? `診療曜日：${board.openWeekdays.map(weekdayLabel).join("・")}　／　13:30・14:30 は通常枠、15:30 は臨時枠`
            : "13:30・14:30 は通常枠、15:30 は臨時枠"
        }
        actions={
          canEdit && (
            <>
              <Button variant="outline" onClick={() => setScheduleOpen(true)}>
                <CalendarCogIcon />
                診療曜日
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileUpIcon />
                RIS から取り込む
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ButtonGroup>
            <Button
              variant="outline"
              size="icon"
              aria-label="前の月"
              onClick={() =>
                setMonth(format(addMonths(monthDate, -1), "yyyy-MM"))
              }
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              className="min-w-32 font-medium tabular-nums"
              tabIndex={-1}
            >
              {format(monthDate, "yyyy年M月")}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="次の月"
              onClick={() =>
                setMonth(format(addMonths(monthDate, 1), "yyyy-MM"))
              }
            >
              <ChevronRightIcon />
            </Button>
          </ButtonGroup>
          <Button
            variant="ghost"
            disabled={month === thisMonth}
            onClick={() => setMonth(thisMonth)}
          >
            今月
          </Button>
        </div>
        {board && (
          <p className="text-sm text-muted-foreground tabular-nums">
            この月の依頼{" "}
            <span className="font-medium text-foreground">
              {board.requests.length}
            </span>{" "}
            件
          </p>
        )}
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {!board && !loadError && (
        <div className="grid gap-4" aria-busy="true" aria-label="読み込み中">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      )}

      {board && (
        <div className="grid gap-4">
          {weeks.map((week) => (
            <Card key={week[0]?.iso} className="gap-0 overflow-hidden py-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="w-24 border-r border-b" />
                      {week.map((day) => (
                        <DayHeader
                          key={day.iso}
                          day={day}
                          isToday={day.iso === today}
                          closure={closureAt(day.iso, DAY_CLOSURE)}
                          occupied={board.requests.some(
                            (request) => request.requestDate === day.iso,
                          )}
                          canEdit={canEdit}
                          onClose={() =>
                            void run(() =>
                              closeTreatmentSlot(day.iso, DAY_CLOSURE),
                            )
                          }
                          onOpen={(id) => void run(() => openTreatmentSlot(id))}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {board.slots.map((slot) => (
                      <tr key={slot}>
                        <th className="border-r border-b bg-muted/20 px-3 py-2 text-left font-medium tabular-nums">
                          <div>{slot}</div>
                          {slot === "15:30" && (
                            <Badge variant="secondary" className="mt-1">
                              臨時
                            </Badge>
                          )}
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
                            onOpen={(id) =>
                              void run(() => openTreatmentSlot(id))
                            }
                          />
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <th className="border-r bg-muted/20 px-3 py-2 text-left align-top font-medium">
                        備考
                      </th>
                      {week.map((day) => (
                        <td
                          key={`${day.iso}-remark`}
                          className="border-r p-2 align-top last:border-r-0"
                        >
                          {canEdit ? (
                            <Textarea
                              value={remarkValue(day.iso)}
                              rows={3}
                              placeholder="備考"
                              className="max-h-48 min-h-16 overflow-y-auto text-sm break-words whitespace-pre-wrap"
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
                            <p className="max-h-48 min-h-16 overflow-y-auto text-sm break-words whitespace-pre-wrap">
                              {remarkValue(day.iso) || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </p>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

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

      {board && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          current={board.openWeekdays}
        />
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>RIS の CSV・Excel を取り込む</DialogTitle>
            <DialogDescription>
              13:30 と 14:30 以外の予定時刻は 15:30
              の臨時枠に入ります。カナはひらがなで登録します。アプリを起動した
              PC の ris/rt_order
              フォルダに置いたファイルは、自動で取り込まれます。
            </DialogDescription>
          </DialogHeader>
          <RtOrderImport
            onImported={(requestDate) => setMonth(requestDate.slice(0, 7))}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function DayHeader({
  day,
  isToday,
  closure,
  occupied,
  canEdit,
  onClose,
  onOpen,
}: {
  day: DayColumn;
  isToday: boolean;
  /** 休診（1 日まるごと閉じている）なら、その閉じ枠 */
  closure?: SlotClosure;
  /** その日に依頼が入っているか（入っていると休診にできない） */
  occupied: boolean;
  canEdit: boolean;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <th className="border-r border-b px-2 py-2 font-medium last:border-r-0">
      <div className="flex items-center justify-center gap-1">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 tabular-nums",
            isToday && "bg-primary text-primary-foreground",
          )}
        >
          {day.month}/{day.day}（{day.label}）
        </span>
        {closure && <Badge variant="outline">休診</Badge>}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${day.month}/${day.day} の操作`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                {day.month}/{day.day}（{day.label}）
              </DropdownMenuLabel>
              {closure ? (
                <DropdownMenuItem onSelect={() => onOpen(closure.id)}>
                  <LockOpenIcon />
                  休診を解除
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled={occupied} onSelect={onClose}>
                  <LockIcon />
                  {occupied ? "依頼があるため休診にできません" : "休診にする"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </th>
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
      data-occupied={request ? "true" : undefined}
      className="h-24 border-r border-b p-1.5 align-middle last:border-r-0"
      style={!request && closed ? closedStyle : undefined}
    >
      {request ? (
        <div className="relative flex h-full flex-col justify-center rounded-md border-l-4 border-foreground bg-muted px-2 py-1.5">
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            {request.requestingDepartment}
          </span>
          <a
            href={`/patient/detail/?id=${request.patientId}`}
            className="font-medium leading-snug underline-offset-2 hover:underline"
          >
            {request.lastNameKanji} {request.firstNameKanji}
          </a>
          <span className="truncate text-[11px] text-muted-foreground">
            {toKatakana(request.lastNameKana)}{" "}
            {toKatakana(request.firstNameKana)}
          </span>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1 right-1"
              aria-label={`${request.lastNameKanji} ${request.firstNameKanji} 様の依頼を変更`}
              onClick={() => onEdit(request)}
            >
              <PencilIcon />
            </Button>
          )}
        </div>
      ) : closed ? (
        <div className="grid h-full place-items-center gap-1 text-xs text-muted-foreground">
          <span className="rounded bg-background/80 px-1.5">
            {dayClosed ? "休診" : "閉じ枠"}
          </span>
          {canEdit && !dayClosed && closure && (
            <Button
              variant="ghost"
              size="xs"
              className="bg-background/80"
              onClick={() => onOpen(closure.id)}
            >
              <LockOpenIcon />
              開ける
            </Button>
          )}
        </div>
      ) : (
        canEdit && (
          <div className="grid h-full place-items-center">
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={onClose}
            >
              <LockIcon />
              閉じる
            </Button>
          </div>
        )
      )}
    </td>
  );
}

/** 診療曜日の設定。曜日を変えても、入っている依頼は残る */
function ScheduleDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number[];
}) {
  const [draft, setDraft] = useState<number[]>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(current);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (value: number) =>
    setDraft((values) =>
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value].sort((a, b) => a - b),
    );

  const save = async () => {
    if (draft.length === 0) {
      setError("診療曜日は 1 つ以上選んでください。");
      return;
    }
    setPending(true);
    try {
      await saveTreatmentSchedule(draft);
      toast.success("診療曜日を保存しました");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました。"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>診療曜日</DialogTitle>
          <DialogDescription>
            治療依頼表に出す曜日を選びます。曜日を変えても、入っている依頼は残ります。
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="診療曜日"
        >
          {WEEKDAYS.map((day) => (
            <Button
              key={day.value}
              type="button"
              variant={draft.includes(day.value) ? "default" : "outline"}
              aria-pressed={draft.includes(day.value)}
              className="w-11"
              onClick={() => toggle(day.value)}
            >
              {day.label}
            </Button>
          ))}
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              キャンセル
            </Button>
          </DialogClose>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? "保存中…" : "保存する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
