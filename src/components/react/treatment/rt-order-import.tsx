import { useRef, useState } from "react";
import { FileSpreadsheetIcon, FolderOpenIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const STATUS_VARIANT: Record<
  RtOrderImportRow["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  create: "default",
  attach: "secondary",
  skip: "outline",
  error: "destructive",
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
    <div className="grid min-w-0 gap-4">
      <div
        className={cn(
          "grid justify-items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
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
        <FileSpreadsheetIcon className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          CSV・Excel をここにドロップするか、ボタンから選んでください。
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <FolderOpenIcon />
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

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {rows && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="default">新規 {count(rows, "create")}</Badge>
            <Badge variant="secondary">依頼のみ {count(rows, "attach")}</Badge>
            <Badge variant="outline">取り込み済み {count(rows, "skip")}</Badge>
            <Badge variant="destructive">失敗 {count(rows, "error")}</Badge>
            {applied && (
              <span className="text-muted-foreground">登録しました</span>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table className="min-w-[960px] text-xs">
              <TableHeader>
                <TableRow className="bg-muted/40">
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
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="tabular-nums">{row.line}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.patientId}
                    </TableCell>
                    <TableCell>
                      {row.lastNameKanji}
                      {row.firstNameKanji}
                    </TableCell>
                    <TableCell>
                      {row.lastNameKana}
                      {row.firstNameKana}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.requestDate}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.sourceTime}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.slotTime}
                    </TableCell>
                    <TableCell>{row.requestingDepartment}</TableCell>
                    <TableCell>{row.requestingPhysician}</TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge variant={STATUS_VARIANT[row.status]}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                      {row.message && (
                        <span
                          className={cn(
                            "ml-1",
                            row.status === "error" && "text-destructive",
                          )}
                        >
                          {row.message}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={pending || !writable || applied}
              onClick={() => void apply()}
            >
              {applied ? "登録しました" : "この内容で登録する"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
