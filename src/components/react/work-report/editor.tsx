// 作業報告書の登録・編集。取り込んだ報告書は、元の PDF・写真を横に見ながら確認できる。
import { ArrowLeft, Download, Paperclip, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/react/card";
import { MyInput } from "@/components/react/my-input";
import { StatusBadge } from "@/components/react/work-report/list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchMe } from "@/lib/auth";
import { go } from "@/lib/nav";
import {
  addFile,
  checkDuplicate,
  createReport,
  deleteFile,
  deleteReport,
  fileSizeLabel,
  downloadUrl,
  fileUrl,
  fromInputValue,
  getOptions,
  getReport,
  namesMatch,
  saveMaster,
  SOURCE_LABELS,
  toInputValue,
  updateReport,
  type DuplicateReport,
  type ReportStatus,
  type WorkReport,
  type WorkReportInput,
  type WorkReportOptions,
} from "@/lib/work-reports";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-base";

const WORK_TYPES = [
  "PMP",
  "Replace",
  "Investigate/Trouble Shoot",
  "定期点検",
  "修理",
  "部品交換",
];

const EMPTY: WorkReportInput = {
  deviceId: null,
  title: "",
  workType: "",
  workOrderNo: "",
  failureAt: "",
  arrivalAt: "",
  recoveryAt: "",
  departureAt: "",
  workContent: "",
  notes: "",
  engineerIds: [],
  staffUserId: null,
  status: "review",
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function reportToInput(report: WorkReport): WorkReportInput {
  return {
    deviceId: report.deviceId,
    title: report.title,
    workType: report.workType,
    workOrderNo: report.workOrderNo,
    failureAt: report.failureAt,
    arrivalAt: report.arrivalAt,
    recoveryAt: report.recoveryAt,
    departureAt: report.departureAt,
    workContent: report.workContent,
    notes: report.notes,
    engineerIds: report.engineerIds,
    staffUserId: report.staffUserId,
    status: report.status,
  };
}

function DateTimeField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <MyInput
      id={id}
      label={label}
      type="datetime-local"
      value={toInputValue(value)}
      onChange={(event) => onChange(fromInputValue(event.target.value))}
    />
  );
}

function FilePreview({ report }: { report: WorkReport }) {
  const previewable = report.files.filter(
    (file) =>
      file.contentType === "application/pdf" ||
      (file.contentType.startsWith("image/") &&
        !file.contentType.includes("hei")),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const current =
    previewable.find((file) => file.id === selected) ?? previewable[0];
  if (!current) return null;
  return (
    <Card className="lg:sticky lg:top-0">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">原本</h3>
          {previewable.length > 1 && (
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={current.id}
              onChange={(event) => setSelected(Number(event.target.value))}
            >
              {previewable.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.fileName}
                </option>
              ))}
            </select>
          )}
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <a href={downloadUrl(current.id)} download={current.fileName}>
              <Download />
              ダウンロード
            </a>
          </Button>
        </div>
        {current.contentType === "application/pdf" ? (
          <iframe
            title={current.fileName}
            src={fileUrl(current.id)}
            className="h-[75svh] w-full rounded-md border bg-white"
          />
        ) : (
          <img
            src={fileUrl(current.id)}
            alt={current.fileName}
            className="max-h-[75svh] w-full rounded-md border object-contain"
          />
        )}
      </div>
    </Card>
  );
}

export function WorkReportEditor() {
  const [reportId, setReportId] = useState<number | null>(null);
  const [report, setReport] = useState<WorkReport | null>(null);
  const [options, setOptions] = useState<WorkReportOptions | null>(null);
  const [form, setForm] = useState<WorkReportInput>(EMPTY);
  const [engineerToAdd, setEngineerToAdd] = useState("");
  const [newEngineer, setNewEngineer] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [duplicate, setDuplicate] = useState<DuplicateReport | null>(null);

  // 作業指示番号や日時を入れた時点で、同じ報告書が登録済みでないか調べる。
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void checkDuplicate({
        excludeId: reportId,
        workOrderNo: form.workOrderNo,
        deviceId: form.deviceId,
        failureAt: form.failureAt,
        arrivalAt: form.arrivalAt,
      })
        .then((found) => active && setDuplicate(found ?? null))
        .catch(() => active && setDuplicate(null));
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    loaded,
    reportId,
    form.workOrderNo,
    form.deviceId,
    form.failureAt,
    form.arrivalAt,
  ]);

  const show = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const loadReport = async (id: number, opts = options) => {
    const next = await getReport(id);
    setReport(next);
    const input = reportToInput(next);
    // 取り込んだあとで覚えた表記（例: Tsuzuki Shoya）なら、担当技師を選んでおく。
    if (input.staffUserId === null && next.staffNameRaw && opts) {
      const alias = opts.staffAliases.find((item) =>
        namesMatch(item.alias, next.staffNameRaw),
      );
      input.staffUserId = alias?.userId ?? null;
    }
    setForm(input);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));
    void (async () => {
      try {
        const loadedOptions = await getOptions();
        setOptions(loadedOptions);
        if (id) {
          setReportId(id);
          await loadReport(id, loadedOptions);
        } else {
          // 手入力のときは、担当技師をログインしている人にしておく。
          const me = await fetchMe().catch(() => null);
          setForm({ ...EMPTY, staffUserId: me?.id ?? null });
        }
      } catch (error) {
        show(errorText(error), true);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const set = <K extends keyof WorkReportInput>(
    key: K,
    value: WorkReportInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const device = options?.devices.find((item) => item.id === form.deviceId);
  const engineers = options?.engineers ?? [];
  const engineerName = (id: number) =>
    engineers.find((item) => item.id === id)?.name ?? `#${id}`;
  // 装置のメーカーの人を先に出す。
  const addableEngineers = useMemo(() => {
    const rest = engineers.filter(
      (item) => !form.engineerIds.includes(item.id),
    );
    const manufacturerId = device?.manufacturerId;
    return [
      ...rest.filter(
        (item) => manufacturerId && item.manufacturerId === manufacturerId,
      ),
      ...rest.filter(
        (item) => !manufacturerId || item.manufacturerId !== manufacturerId,
      ),
    ];
  }, [engineers, form.engineerIds, device?.manufacturerId]);

  const save = async (status: ReportStatus = form.status) => {
    setPending(true);
    try {
      const input = { ...form, status };
      if (reportId) {
        await updateReport(reportId, input);
        await loadReport(reportId);
        setOptions(await getOptions());
        show(
          status === "confirmed" && form.status === "review"
            ? "確認済みにしました"
            : "保存しました",
        );
      } else {
        const { id } = await createReport(input);
        go(`/work-report/edit/?id=${id}`);
        setReportId(id);
        await loadReport(id);
        show("登録しました");
      }
    } catch (error) {
      show(errorText(error), true);
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (!reportId) return;
    if (
      !window.confirm(
        "この作業報告書を削除しますか？添付したファイルも消えます。",
      )
    )
      return;
    setPending(true);
    try {
      await deleteReport(reportId);
      go("/work-report/");
    } catch (error) {
      show(errorText(error), true);
      setPending(false);
    }
  };

  const addNewEngineer = async () => {
    const name = newEngineer.trim();
    if (!name) return;
    try {
      const id = await saveMaster("engineers", null, {
        name,
        nameRoman: "",
        manufacturerId: device?.manufacturerId ?? null,
      });
      setOptions(await getOptions());
      set("engineerIds", [...form.engineerIds, id]);
      setNewEngineer("");
    } catch (error) {
      show(errorText(error), true);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!reportId || !files || files.length === 0) return;
    setPending(true);
    try {
      for (const file of Array.from(files)) {
        await addFile(reportId, file);
      }
      const next = await getReport(reportId);
      setReport(next);
      show("添付しました");
    } catch (error) {
      show(errorText(error), true);
    } finally {
      setPending(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeFile = async (id: number, name: string) => {
    if (!reportId || !window.confirm(`${name} を削除しますか？`)) return;
    try {
      await deleteFile(id);
      setReport(await getReport(reportId));
    } catch (error) {
      show(errorText(error), true);
    }
  };

  if (!loaded) return null;
  if (!options) {
    return <p className="text-sm text-destructive">{message}</p>;
  }

  const staffUnmatched =
    report && report.staffNameRaw && form.staffUserId === null;
  const hasPreview = !!report?.files.some(
    (file) =>
      file.contentType === "application/pdf" ||
      file.contentType.startsWith("image/"),
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="lg" onClick={() => go("/work-report/")}>
          <ArrowLeft />
          一覧へ
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">
          {reportId ? "作業報告書" : "作業報告書の登録"}
        </h2>
        {report && <StatusBadge status={report.status} />}
        {report && report.source !== "manual" && (
          <span className="min-w-0 text-sm text-muted-foreground break-all">
            {SOURCE_LABELS[report.source] ?? report.source}から取り込み：
            {report.sourceFile}
          </span>
        )}
      </div>

      <div
        className={
          hasPreview
            ? "grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start"
            : "grid grid-cols-[minmax(0,1fr)] gap-4"
        }
      >
        <form
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {report?.status === "review" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              読み取った内容を原本と見比べて、問題なければ「確認済みにする」を押してください。
            </div>
          )}

          <Card>
            <div className="grid gap-4">
              <h3 className="font-semibold">装置・件名</h3>
              <label className="grid gap-1.5 text-sm font-medium">
                装置
                <select
                  className={selectClass}
                  value={form.deviceId ?? ""}
                  onChange={(event) =>
                    set(
                      "deviceId",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">選んでください</option>
                  {options.devices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.serialNo ? ` [${item.serialNo}]` : ""}
                      {item.manufacturerName
                        ? `（${item.manufacturerName}）`
                        : ""}
                    </option>
                  ))}
                </select>
                {options.devices.length === 0 && (
                  <span className="font-normal text-muted-foreground">
                    装置は「装置・担当者の設定」で登録できます（PDF
                    を取り込むと自動で登録されます）
                  </span>
                )}
              </label>
              <MyInput
                id="wr-title"
                label="件名"
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <MyInput
                  id="wr-work-type"
                  label="作業区分"
                  list="wr-work-types"
                  value={form.workType}
                  onChange={(event) => set("workType", event.target.value)}
                />
                <datalist id="wr-work-types">
                  {WORK_TYPES.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <div className="grid gap-1">
                  <MyInput
                    id="wr-order-no"
                    label="作業指示番号"
                    value={form.workOrderNo}
                    aria-invalid={!!duplicate || undefined}
                    onChange={(event) => set("workOrderNo", event.target.value)}
                  />
                  {duplicate && (
                    <a
                      className="text-sm text-destructive underline underline-offset-4"
                      href={`/work-report/edit/?id=${duplicate.id}`}
                    >
                      登録済みの報告書と同じです
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="grid gap-4">
              <h3 className="font-semibold">作業日時</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateTimeField
                  id="wr-failure"
                  label="障害発生日時"
                  value={form.failureAt}
                  onChange={(value) => set("failureAt", value)}
                />
                <DateTimeField
                  id="wr-arrival"
                  label="到着日時"
                  value={form.arrivalAt}
                  onChange={(value) => set("arrivalAt", value)}
                />
                <DateTimeField
                  id="wr-recovery"
                  label="装置復帰"
                  value={form.recoveryAt}
                  onChange={(value) => set("recoveryAt", value)}
                />
                <DateTimeField
                  id="wr-departure"
                  label="退出日時"
                  value={form.departureAt}
                  onChange={(value) => set("departureAt", value)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="grid gap-4">
              <h3 className="font-semibold">作業内容</h3>
              <div className="grid gap-1.5">
                <Label htmlFor="wr-content">作業内容</Label>
                <Textarea
                  id="wr-content"
                  className="min-h-40"
                  value={form.workContent}
                  onChange={(event) => set("workContent", event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wr-notes">連絡事項</Label>
                <Textarea
                  id="wr-notes"
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="grid gap-4">
              <h3 className="font-semibold">担当者</h3>
              <div className="grid gap-2">
                <span className="text-sm font-medium">
                  作業担当者（メーカー）
                </span>
                <div className="flex flex-wrap gap-2">
                  {form.engineerIds.map((id, index) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
                    >
                      {engineerName(id)}
                      {index > 0 && (
                        <span className="text-xs text-muted-foreground">
                          共同
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`${engineerName(id)} を外す`}
                        className="rounded-full p-0.5 hover:bg-background"
                        onClick={() =>
                          set(
                            "engineerIds",
                            form.engineerIds.filter((item) => item !== id),
                          )
                        }
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  {form.engineerIds.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      未選択
                    </span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    aria-label="作業担当者を追加"
                    className={selectClass}
                    value={engineerToAdd}
                    onChange={(event) => {
                      const id = Number(event.target.value);
                      if (id) set("engineerIds", [...form.engineerIds, id]);
                      setEngineerToAdd("");
                    }}
                  >
                    <option value="">一覧から追加...</option>
                    {addableEngineers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.manufacturerName
                          ? `（${item.manufacturerName}）`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      aria-label="新しい作業担当者の氏名"
                      placeholder="新しい人の氏名"
                      className="h-10 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-base"
                      value={newEngineer}
                      onChange={(event) => setNewEngineer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addNewEngineer();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      disabled={!newEngineer.trim()}
                      onClick={() => void addNewEngineer()}
                    >
                      登録して追加
                    </Button>
                  </div>
                </div>
              </div>

              <label className="grid gap-1.5 text-sm font-medium">
                担当技師
                <select
                  className={selectClass}
                  value={form.staffUserId ?? ""}
                  onChange={(event) =>
                    set(
                      "staffUserId",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                >
                  <option value="">選んでください</option>
                  {options.staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                {staffUnmatched && (
                  <span className="font-normal text-amber-700 dark:text-amber-300">
                    報告書には「{report.staffNameRaw}
                    」とあります。担当者一覧から選んで保存すると、次からは自動で選びます。
                  </span>
                )}
              </label>
            </div>
          </Card>

          {duplicate && (
            <div
              role="alert"
              className="grid gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-medium">{duplicate.message}</p>
              <p>
                同じ報告書を二重に登録しないよう、保存できなくしています。
                <a
                  className="ml-1 underline underline-offset-4"
                  href={`/work-report/edit/?id=${duplicate.id}`}
                >
                  登録済みの報告書を開く
                </a>
              </p>
            </div>
          )}

          {message && (
            <p
              className={
                isError
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
              role={isError ? "alert" : "status"}
            >
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(!reportId || form.status === "review") && (
              <Button
                type="button"
                size="lg"
                className="h-10 px-4"
                disabled={pending || !!duplicate}
                onClick={() => void save("confirmed")}
              >
                確認済みにする
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              variant={
                !reportId || form.status === "review" ? "outline" : "default"
              }
              className="h-10 px-4"
              disabled={pending || !!duplicate}
            >
              {!reportId || form.status === "review"
                ? "要確認のまま保存"
                : "保存"}
            </Button>
            {reportId && form.status === "confirmed" && (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-10 px-4"
                disabled={pending || !!duplicate}
                onClick={() => void save("review")}
              >
                要確認に戻す
              </Button>
            )}
            {reportId && (
              <Button
                type="button"
                size="lg"
                variant="destructive"
                className="ml-auto h-10 px-4"
                disabled={pending}
                onClick={() => void remove()}
              >
                <Trash2 />
                削除
              </Button>
            )}
          </div>

          <Card>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">添付ファイル</h3>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!reportId || pending}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip />
                  PDF・写真を添付
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(event) => void uploadFiles(event.target.files)}
                />
              </div>
              {!reportId && (
                <p className="text-sm text-muted-foreground">
                  登録したあとで添付できます
                </p>
              )}
              <ul className="grid gap-1 text-sm">
                {report?.files.map((file) => (
                  <li key={file.id} className="flex items-center gap-2">
                    <a
                      href={fileUrl(file.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline"
                    >
                      {file.fileName}
                    </a>
                    <span className="text-muted-foreground">
                      {fileSizeLabel(file.size)}
                    </span>
                    <Button asChild variant="ghost" size="icon-sm">
                      <a
                        href={downloadUrl(file.id)}
                        download={file.fileName}
                        aria-label={`${file.fileName} をダウンロード`}
                        title="ダウンロード"
                      >
                        <Download />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${file.fileName} を削除`}
                      onClick={() => void removeFile(file.id, file.fileName)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
                {reportId && report?.files.length === 0 && (
                  <li className="text-muted-foreground">
                    添付ファイルはありません
                  </li>
                )}
              </ul>
            </div>
          </Card>

          {report && (
            <p className="text-xs text-muted-foreground">
              登録 {report.createdAt} ・ 最終更新 {report.updatedAt}
              {report.updatedBy ? `（${report.updatedBy}）` : ""}
            </p>
          )}
        </form>

        {report && hasPreview && <FilePreview report={report} />}
      </div>
    </div>
  );
}
