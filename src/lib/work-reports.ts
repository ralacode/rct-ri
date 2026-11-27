// 作業報告書（メーカーの保守・修理の報告）。
import { apiRequest } from "@/lib/api";

export type ReportStatus = "review" | "confirmed";

export const STATUS_LABELS: Record<ReportStatus, string> = {
  review: "要確認",
  confirmed: "確認済み",
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: "手入力",
  pdf: "PDF",
  json: "写真（JSON）",
};

export type Manufacturer = { id: number; name: string; aliases: string };

export type Device = {
  id: number;
  name: string;
  serialNo: string;
  manufacturerId: number | null;
  manufacturerName: string;
  modalityId: number | null;
};

export type Engineer = {
  id: number;
  name: string;
  nameRoman: string;
  manufacturerId: number | null;
  manufacturerName: string;
};

export type StaffAlias = { id: number; userId: number; alias: string };

export type Modality = { id: number; name: string };

export type WorkReportOptions = {
  manufacturers: Manufacturer[];
  devices: Device[];
  engineers: Engineer[];
  staff: { id: number; name: string }[];
  staffAliases: StaffAlias[];
  modalities: Modality[];
};

export type ReportFile = {
  id: number;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
};

export type WorkReport = {
  id: number;
  deviceId: number | null;
  deviceName: string;
  manufacturerName: string;
  modalityId: number | null;
  title: string;
  workType: string;
  workOrderNo: string;
  failureAt: string;
  arrivalAt: string;
  recoveryAt: string;
  departureAt: string;
  workContent: string;
  notes: string;
  engineerIds: number[];
  engineerNames: string[];
  staffUserId: number | null;
  staffName: string;
  staffNameRaw: string;
  status: ReportStatus;
  source: string;
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  files: ReportFile[];
};

export type WorkReportInput = {
  deviceId: number | null;
  title: string;
  workType: string;
  workOrderNo: string;
  failureAt: string;
  arrivalAt: string;
  recoveryAt: string;
  departureAt: string;
  workContent: string;
  notes: string;
  engineerIds: number[];
  staffUserId: number | null;
  status: ReportStatus;
};

export type ImportResult = {
  status: "created" | "duplicate";
  reportId: number;
  message: string;
  warnings: string[];
};

export function getOptions() {
  return apiRequest<WorkReportOptions>("/work-reports/options");
}

export function listReports(filter: {
  keyword?: string;
  deviceId?: number | null;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filter.keyword?.trim()) params.set("keyword", filter.keyword.trim());
  if (filter.deviceId) params.set("deviceId", String(filter.deviceId));
  if (filter.status) params.set("status", filter.status);
  const query = params.toString();
  return apiRequest<WorkReport[]>(`/work-reports${query ? `?${query}` : ""}`);
}

export function getReport(id: number) {
  return apiRequest<WorkReport>(`/work-reports/${id}`);
}

export function createReport(input: WorkReportInput) {
  return apiRequest<{ id: number }>("/work-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateReport(id: number, input: WorkReportInput) {
  return apiRequest<{ id: number }>(`/work-reports/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteReport(id: number) {
  return apiRequest<void>(`/work-reports/${id}`, { method: "DELETE" });
}

function upload<T>(path: string, file: File) {
  const sep = path.includes("?") ? "&" : "?";
  return apiRequest<T>(`${path}${sep}name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

/** PDF か JSON を読み取り、要確認の作業報告書として登録する */
export function importReport(file: File) {
  return upload<ImportResult>("/work-report-imports", file);
}

export function addFile(reportId: number, file: File) {
  return upload<number>(`/work-reports/${reportId}/files`, file);
}

export function deleteFile(fileId: number) {
  return apiRequest<void>(`/work-report-files/${fileId}`, { method: "DELETE" });
}

export function fileUrl(fileId: number) {
  return `/api/work-report-files/${fileId}`;
}

/** 開かずに保存させる URL（原本のダウンロード） */
export function downloadUrl(fileId: number) {
  return `${fileUrl(fileId)}?download=1`;
}

type Kind = "manufacturers" | "devices" | "engineers";

export function saveMaster(kind: Kind, id: number | null, body: object) {
  return apiRequest<number>(
    id ? `/work-report-${kind}/${id}` : `/work-report-${kind}`,
    { method: id ? "PUT" : "POST", body: JSON.stringify(body) },
  );
}

export function deleteMaster(kind: Kind, id: number) {
  return apiRequest<void>(`/work-report-${kind}/${id}`, { method: "DELETE" });
}

export function addStaffAlias(userId: number, alias: string) {
  return apiRequest<void>("/work-report-staff-aliases", {
    method: "POST",
    body: JSON.stringify({ userId, alias }),
  });
}

export function deleteStaffAlias(id: number) {
  return apiRequest<void>(`/work-report-staff-aliases/${id}`, {
    method: "DELETE",
  });
}

function nameKeys(value: string) {
  const tokens = value
    .split(/[\s・,、]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  return [tokens.join(""), [...tokens].reverse().join("")];
}

/** 姓名の順番・空白・大文字小文字の違いを無視して名前を比べる（サーバーの names_match と同じ） */
export function namesMatch(a: string, b: string) {
  const keys = nameKeys(b);
  return nameKeys(a).some((key) => key && keys.includes(key));
}

/** `2026-11-09 08:50` → `2026/11/09 08:50` */
export function formatDateTime(value: string) {
  return value ? value.replace(/-/g, "/") : "";
}

/** `2026-11-09 08:50` ⇔ `<input type="datetime-local">` の値 */
export function toInputValue(value: string) {
  return value ? value.replace(" ", "T") : "";
}

export function fromInputValue(value: string) {
  return value ? value.replace("T", " ") : "";
}

export function fileSizeLabel(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

/** スマホで撮った報告書を Claude で読み取るときの指示文 */
export const CLAUDE_PROMPT = `添付した写真は、医療機器メーカーの作業報告書です。
読み取った内容を、次の形の JSON だけで返してください（説明文は不要です）。
読み取れない項目は空文字にしてください。推測で埋めないでください。

{
  "manufacturer": "メーカー名（例: Varian）",
  "deviceName": "装置名（Product Name など）",
  "deviceSerial": "装置番号（納入商品・シリアル番号など）",
  "title": "件名",
  "workType": "作業区分（例: PMP、Replace、Investigate/Trouble Shoot）",
  "workOrderNo": "作業指示番号（例: WO-004698810）",
  "failureAt": "障害発生日時（YYYY-MM-DD HH:MM）",
  "arrivalAt": "到着日時（YYYY-MM-DD HH:MM）",
  "recoveryAt": "装置復帰の日時（YYYY-MM-DD HH:MM）",
  "departureAt": "退出日時（YYYY-MM-DD HH:MM）",
  "workContent": "作業内容（改行は \\n。原文のまま）",
  "notes": "連絡事項",
  "engineers": ["作業担当者（メーカー側）の氏名"],
  "staffName": "お客様の署名、なければ取引先責任者の氏名"
}

返した JSON を「報告書1.json」のような名前で保存できるファイルにしてください。`;
