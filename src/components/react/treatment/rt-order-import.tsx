import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyRtOrderImport,
  previewRtOrderImport,
  type RtOrderImportRow,
} from "@/lib/treatment";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RtOrderImportRow["status"], string> = {
  create: "新規登録",
  attach: "依頼のみ",
  skip: "取り込み済み",
  error: "失敗",
};

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function count(rows: RtOrderImportRow[], status: RtOrderImportRow["status"]) {
  return rows.filter((row) => row.status === status).length;
}

const EXTENSIONS = [".csv", ".xlsx", ".xlsm", ".xls"];

function isImportable(file: File) {
  const name = file.name.toLowerCase();
  return (
    EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel"
  );
}

export function RtOrderImport({
  onImported,
}: {
  onImported: (requestDate: string) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<ArrayBuffer | null>(null);
  const [rows, setRows] = useState<RtOrderImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [applied, setApplied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const writable =
    rows?.some((row) => row.status === "create" || row.status === "attach") ??
    false;

  const read = async (next: File) => {
    setPending(true);
    setError(null);
    setApplied(false);
    setFileName(next.name);
    try {
      const bytes = await next.arrayBuffer();
      const preview = await previewRtOrderImport(bytes);
      setFile(bytes);
      setRows(preview.rows);
    } catch (err) {
      setFile(null);
      setRows(null);
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const take = (next: File | null | undefined) => {
    if (pending) return;
    if (!next) return;
    if (!isImportable(next)) {
      setError("CSV か Excel のファイルを選んでください。");
      return;
    }
    void read(next);
  };

  const apply = async () => {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const result = await applyRtOrderImport(file);
      setRows(result.rows);
      setApplied(true);
      const imported = result.rows.find(
        (row) => row.status === "create" || row.status === "attach",
      );
      if (imported) onImported(imported.requestDate);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-1">
        <div className="text-sm font-medium">RIS の CSV・Excel を読み込む</div>
        <p className="text-xs text-muted-foreground">
          13:30 と 14:30 以外の予定時刻は、15:30
          の臨時枠に入ります。カナはひらがなで登録します。アプリを起動した PC の
          ris/rt_order フォルダに置いたファイルは、自動で取り込まれます。
        </p>
      </div>
      <div
        className={cn(
          "grid justify-items-start gap-3 rounded-lg border border-dashed p-4",
          dragging && "border-primary bg-muted/60",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) {
            return;
          }
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = Array.from(event.dataTransfer.files);
          take(dropped.find(isImportable) ?? dropped[0]);
        }}
      >
        <p className="text-sm">
          CSV・Excel をここにドロップするか、ボタンから選んでください。
        </p>
        <Button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          ファイルを選択
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xlsm,.xls,text/csv"
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {fileName && (
          <p className="text-xs text-muted-foreground">{fileName}</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows && (
        <>
          <p className="text-sm">
            新規 {count(rows, "create")} 件、依頼のみ {count(rows, "attach")}{" "}
            件、取り込み済み {count(rows, "skip")} 件、失敗{" "}
            {count(rows, "error")} 件{applied ? "（登録しました）" : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-xs">
              <thead>
                <tr className="bg-muted/40">
                  {[
                    "行",
                    "患者ID",
                    "氏名",
                    "カナ",
                    "依頼日",
                    "予定",
                    "枠",
                    "依頼科",
                    "依頼医",
                    "結果",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border p-2 text-left font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.line}>
                    <td className="border p-2">{row.line}</td>
                    <td className="border p-2">{row.patientId}</td>
                    <td className="border p-2">
                      {row.lastNameKanji}
                      {row.firstNameKanji}
                    </td>
                    <td className="border p-2">
                      {row.lastNameKana}
                      {row.firstNameKana}
                    </td>
                    <td className="border p-2">{row.requestDate}</td>
                    <td className="border p-2">{row.sourceTime}</td>
                    <td className="border p-2">{row.slotTime}</td>
                    <td className="border p-2">{row.requestingDepartment}</td>
                    <td className="border p-2">{row.requestingPhysician}</td>
                    <td
                      className={
                        row.status === "error"
                          ? "border p-2 text-destructive"
                          : "border p-2"
                      }
                    >
                      {STATUS_LABEL[row.status]}
                      {row.message ? `。${row.message}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              disabled={pending || !writable || applied}
              onClick={() => void apply()}
            >
              この内容で登録する
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
