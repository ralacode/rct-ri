// 作業報告書の一覧。絞り込みと、PDF・JSON の取り込み。
import { FileUp, Plus, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/react/card";
import { MyInput } from "@/components/react/my-input";
import { Button } from "@/components/ui/button";
import { onDataChanged } from "@/lib/live";
import { go } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  getOptions,
  importReport,
  listReports,
  STATUS_LABELS,
  type Device,
  type ImportResult,
  type WorkReport,
} from "@/lib/work-reports";

const selectClass =
  "h-10 rounded-md border border-input bg-transparent px-3 text-base";

type ImportLine = { fileName: string; result?: ImportResult; error?: string };

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function StatusBadge({ status }: { status: WorkReport["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "review"
          ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function isImportable(file: File) {
  return /\.(pdf|json)$/i.test(file.name);
}

function editUrl(id: number) {
  return `/work-report/edit/?id=${id}`;
}

export function WorkReportList() {
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [keyword, setKeyword] = useState("");
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imports, setImports] = useState<ImportLine[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void Promise.all([
        listReports({ keyword, deviceId, status }),
        getOptions(),
      ])
        .then(([nextReports, options]) => {
          if (!active) return;
          setReports(nextReports);
          setDevices(options.devices);
          setError("");
        })
        .catch((err) => active && setError(errorText(err)))
        .finally(() => active && setLoaded(true));
    };
    const timer = window.setTimeout(load, keyword ? 250 : 0);
    const stop = onDataChanged(load);
    return () => {
      active = false;
      window.clearTimeout(timer);
      stop();
    };
  }, [keyword, deviceId, status]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0 || importing) return;
    setImporting(true);
    const lines: ImportLine[] = [];
    for (const file of Array.from(files)) {
      if (!isImportable(file)) {
        lines.push({
          fileName: file.name,
          error: "PDF か JSON のファイルだけ取り込めます",
        });
        setImports([...lines]);
        continue;
      }
      try {
        lines.push({ fileName: file.name, result: await importReport(file) });
      } catch (err) {
        lines.push({ fileName: file.name, error: errorText(err) });
      }
      setImports([...lines]);
    }
    setImporting(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  // 画面（サイドバーを含むウィンドウ全体）のどこにドロップしても取り込む。
  // ブラウザが PDF を開いてアプリから離れてしまわないよう、ウィンドウで受け止める。
  // 子要素の出入りでちらつかないよう、出入りの回数を数える。
  const [dragDepth, setDragDepth] = useState(0);
  const dragging = dragDepth > 0;
  const handleFilesRef = useRef(handleFiles);
  handleFilesRef.current = handleFiles;

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      !!event.dataTransfer &&
      Array.from(event.dataTransfer.types).includes("Files");
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragDepth((depth) => depth + 1);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      setDragDepth((depth) => Math.max(0, depth - 1));
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragDepth(0);
      void handleFilesRef.current(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const reviewCount = reports.filter((r) => r.status === "review").length;

  return (
    <div className="grid gap-4">
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/70 p-6 backdrop-blur-[2px]">
          <div className="grid justify-items-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background px-10 py-8 text-center shadow-lg">
            <FileUp className="size-10 text-primary" />
            <p className="text-lg font-semibold">ここにドロップして取り込む</p>
            <p className="text-sm text-muted-foreground">
              PDF・JSON（複数まとめてでも可）
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">作業報告書</h2>
          <p className="text-sm text-muted-foreground">
            メーカーの保守・修理の報告です。PDF
            を取り込むと項目を読み取り、「要確認」として登録します。PDF・JSON
            はこの画面にドラッグ&ドロップしても取り込めます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={() => go("/work-report/settings/")}
          >
            <Settings />
            装置・担当者の設定
          </Button>
          <Button
            variant="outline"
            size="lg"
            disabled={importing}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp />
            {importing ? "読み取り中..." : "PDF・JSON を取り込む"}
          </Button>
          <Button size="lg" onClick={() => go("/work-report/edit/")}>
            <Plus />
            手入力で登録
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.json,application/pdf,application/json"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </div>
      </div>

      {imports.length > 0 && (
        <Card>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">取り込み結果</h3>
              <Button variant="ghost" size="sm" onClick={() => setImports([])}>
                閉じる
              </Button>
            </div>
            <ul className="grid gap-2 text-sm">
              {imports.map((line, index) => (
                <li key={index} className="rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium break-all">
                      {line.fileName}
                    </span>
                    {line.error && (
                      <span className="text-destructive">{line.error}</span>
                    )}
                    {line.result && (
                      <>
                        <span
                          className={
                            line.result.status === "duplicate"
                              ? "text-amber-700 dark:text-amber-300"
                              : undefined
                          }
                        >
                          {line.result.status === "duplicate"
                            ? `登録しませんでした。${line.result.message}`
                            : line.result.message}
                        </span>
                        <a
                          className="text-primary underline underline-offset-4"
                          href={editUrl(line.result.reportId)}
                        >
                          {line.result.status === "duplicate"
                            ? "登録済みの報告書を開く"
                            : "開く"}
                        </a>
                      </>
                    )}
                  </div>
                  {line.result && line.result.warnings.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                      {line.result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <MyInput
            id="work-report-keyword"
            label="キーワード"
            placeholder="件名・作業内容・作業指示番号・担当者で検索..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <label className="grid gap-1.5 text-sm font-medium">
            装置
            <select
              className={selectClass}
              value={deviceId ?? ""}
              onChange={(event) =>
                setDeviceId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">すべて</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                  {device.manufacturerName
                    ? `（${device.manufacturerName}）`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            状態
            <select
              className={selectClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">すべて</option>
              <option value="review">要確認</option>
              <option value="confirmed">確認済み</option>
            </select>
          </label>
        </div>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-baseline gap-3 text-sm text-muted-foreground">
        <span>{reports.length} 件</span>
        {reviewCount > 0 && <span>うち要確認 {reviewCount} 件</span>}
      </div>

      <ul className="grid gap-2">
        {reports.map((report) => (
          <li key={report.id}>
            <a
              href={editUrl(report.id)}
              className="grid gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50 md:grid-cols-[9.5rem_1fr_auto] md:items-center md:gap-4"
            >
              <div className="flex items-center gap-2 md:grid md:gap-1">
                <StatusBadge status={report.status} />
                <span className="text-sm tabular-nums">
                  {formatDateTime(report.failureAt || report.arrivalAt) ||
                    "日時なし"}
                </span>
              </div>
              <div className="grid min-w-0 gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {report.title || "（件名なし）"}
                  </span>
                  {report.workType && (
                    <span className="text-xs text-muted-foreground">
                      {report.workType}
                    </span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {report.deviceName || "装置未設定"}
                  {report.manufacturerName
                    ? `（${report.manufacturerName}）`
                    : ""}
                  {report.workOrderNo ? ` ・ ${report.workOrderNo}` : ""}
                </span>
              </div>
              <div className="grid gap-0.5 text-sm md:text-right">
                <span>
                  <span className="text-muted-foreground">作業担当者 </span>
                  {report.engineerNames.join("、") || "-"}
                </span>
                <span>
                  <span className="text-muted-foreground">担当技師 </span>
                  {report.staffName || "-"}
                </span>
              </div>
            </a>
          </li>
        ))}
        {loaded && reports.length === 0 && (
          <li className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {keyword || deviceId || status
              ? "当てはまる作業報告書がありません"
              : "作業報告書はまだありません。PDF を取り込むか、手入力で登録してください"}
          </li>
        )}
      </ul>
    </div>
  );
}
