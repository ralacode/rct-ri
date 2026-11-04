export type VideoItem = {
  name: string;
  title: string;
  size: number;
  positionSec: number;
  durationSec: number;
  completed: boolean;
  updatedAt: string | null;
};

export type WatchRow = {
  userId: string;
  displayName: string;
  fileName: string;
  title: string;
  positionSec: number;
  durationSec: number;
  percent: number;
  completed: boolean;
  updatedAt: string | null;
};

function apiUrl(path: string) {
  return `/api${path}`;
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return text || response.statusText || `HTTP ${response.status}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return parseJson<T>(response);
}

export async function listVideos(): Promise<VideoItem[]> {
  return request<VideoItem[]>("/videos");
}

export async function listVideoProgress(): Promise<WatchRow[]> {
  return request<WatchRow[]>("/videos/progress");
}

export async function saveVideoTitle(input: {
  fileName: string;
  title: string;
}): Promise<void> {
  await request<void>("/videos/title", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function videoTitle(item: { name: string; title?: string | null }) {
  const title = item.title?.trim();
  return title || item.name;
}

export async function saveVideoProgress(input: {
  fileName: string;
  positionSec: number;
  durationSec: number;
}): Promise<void> {
  await request<void>("/videos/progress", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function videoContentUrl(name: string) {
  return `/api/videos/content?name=${encodeURIComponent(name)}`;
}

export type VideoStatus = "all" | "unwatched" | "inProgress" | "completed";

export type VideoFilter = {
  q: string;
  status: VideoStatus;
};

export const VIDEO_STATUS_OPTIONS: { value: VideoStatus; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "unwatched", label: "未視聴" },
  { value: "inProgress", label: "途中まで" },
  { value: "completed", label: "完了" },
];

export const EMPTY_VIDEO_FILTER: VideoFilter = { q: "", status: "all" };

function isVideoStatus(value: string | null): value is VideoStatus {
  return VIDEO_STATUS_OPTIONS.some((option) => option.value === value);
}

export function videoStatus(item: {
  completed: boolean;
  positionSec: number;
}): Exclude<VideoStatus, "all"> {
  if (item.completed) return "completed";
  if (item.positionSec > 0) return "inProgress";
  return "unwatched";
}

/** 全角・半角、大文字・小文字、カタカナ・ひらがなの違いを吸収した比較用文字列にする */
export function normalizeForSearch(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60),
    );
}

export function searchTerms(q: string) {
  return normalizeForSearch(q)
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

export function filterVideos(items: VideoItem[], filter: VideoFilter) {
  const terms = searchTerms(filter.q);
  return items.filter((item) => {
    if (filter.status !== "all" && videoStatus(item) !== filter.status) {
      return false;
    }
    if (terms.length === 0) return true;
    const haystack = normalizeForSearch(`${videoTitle(item)}\n${item.name}`);
    return terms.every((term) => haystack.includes(term));
  });
}

/** URL の q / status から検索条件を読む */
export function readVideoFilter(search: string): VideoFilter {
  const params = new URLSearchParams(search);
  const status = params.get("status");
  return {
    q: params.get("q") ?? "",
    status: isVideoStatus(status) ? status : "all",
  };
}

function filterParams(filter: VideoFilter) {
  const params = new URLSearchParams();
  if (filter.q.trim()) params.set("q", filter.q);
  if (filter.status !== "all") params.set("status", filter.status);
  return params;
}

export function listPageUrl(filter: VideoFilter = EMPTY_VIDEO_FILTER) {
  const query = filterParams(filter).toString();
  return query ? `/videos/?${query}` : "/videos/";
}

/** 一覧の検索条件を引き継いで再生画面へ渡す（戻るときに復元するため） */
export function watchPageUrl(
  name: string,
  filter: VideoFilter = EMPTY_VIDEO_FILTER,
) {
  const params = filterParams(filter);
  params.set("name", name);
  return `/videos/watch/?${params.toString()}`;
}

export function formatVideoTime(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const total = Math.floor(sec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
