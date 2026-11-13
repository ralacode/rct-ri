import { go } from "@/lib/nav";

export type Modality = {
  id: number;
  name: string;
  isDefault: boolean;
  code: string | null;
};

export type AuthUser = {
  id: number;
  userId: string;
  lastName: string;
  firstName: string;
  displayName: string;
  isInitialAdmin: boolean;
  canManageUsers: boolean;
  modalities: Modality[];
};

export type AuthStatus = {
  needsSetup: boolean;
  authenticated: boolean;
  user: AuthUser | null;
};

const AUTH_PAGES = ["/login/", "/setup/"];
// ログイン状態はサーバーの HttpOnly Cookie（全タブ共有）で判定する。
// ここではタブ間でログイン・ログアウトを即時に伝えるためだけに localStorage を使う。
const AUTH_EVENT_KEY = "rct_auth_event";
// 自動ログアウト（サーバー側のセッション期限切れ）を検知する間隔。
const AUTH_CHECK_INTERVAL_MS = 60 * 1000;

type AuthEvent = "login" | "logout";

function broadcastAuthEvent(type: AuthEvent) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      AUTH_EVENT_KEY,
      JSON.stringify({ type, at: Date.now() }),
    );
  } catch {
    // localStorage が使えない環境では定期チェックに任せる。
  }
}

export function onAuthEvent(callback: (type: AuthEvent) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key !== AUTH_EVENT_KEY || !event.newValue) return;
    try {
      const { type } = JSON.parse(event.newValue) as { type: AuthEvent };
      if (type === "login" || type === "logout") callback(type);
    } catch {
      // 不正な値は無視する。
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/**
 * ログイン中の画面で、別タブでのログアウトとセッション期限切れ（自動ログアウト）を
 * 検知してログイン画面へ移動する。
 */
export function watchSession() {
  if (typeof window === "undefined") return () => {};
  let stopped = false;
  const toLogin = () => {
    if (!stopped && !isAuthPage()) go(loginUrl());
  };
  const check = async () => {
    if (stopped || document.visibilityState === "hidden") return;
    try {
      const status = await fetchAuthStatus();
      if (!status.authenticated) toLogin();
    } catch {
      // 通信エラーは一時的なものとして次回に再確認する。
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };
  const offAuthEvent = onAuthEvent((type) => {
    if (type === "logout") toLogin();
  });
  const timer = window.setInterval(check, AUTH_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    stopped = true;
    offAuthEvent();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}

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

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function fetchAuthStatus(): Promise<AuthStatus> {
  return authRequest<AuthStatus>("/auth/status");
}

export async function listPublicModalities(): Promise<Modality[]> {
  return authRequest<Modality[]>("/auth/modalities");
}

export async function listModalities(): Promise<Modality[]> {
  return authRequest<Modality[]>("/modalities");
}

export async function createModality(name: string): Promise<Modality> {
  return authRequest<Modality>("/modalities", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function renameModality(id: number, name: string): Promise<void> {
  await authRequest<void>(`/modalities/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function deleteModality(id: number): Promise<void> {
  await authRequest<void>(`/modalities/${id}`, { method: "DELETE" });
}

export async function setUserModalities(
  id: number,
  modalityIds: number[],
): Promise<AuthUser> {
  return authRequest<AuthUser>(`/users/${id}/modalities`, {
    method: "PUT",
    body: JSON.stringify({ modalityIds }),
  });
}

export async function setupAdmin(input: {
  userId: string;
  password: string;
  lastName: string;
  firstName: string;
  modalityIds: number[];
}): Promise<AuthUser> {
  const user = await authRequest<AuthUser>("/auth/setup", {
    method: "POST",
    body: JSON.stringify(input),
  });
  broadcastAuthEvent("login");
  return user;
}

export async function login(input: {
  userId: string;
  password: string;
}): Promise<AuthUser> {
  const user = await authRequest<AuthUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  broadcastAuthEvent("login");
  return user;
}

export async function logout(): Promise<void> {
  try {
    await authRequest<void>("/auth/logout", { method: "POST" });
  } finally {
    broadcastAuthEvent("logout");
  }
}

export async function fetchMe(): Promise<AuthUser> {
  return authRequest<AuthUser>("/auth/me");
}

export async function listUsers(): Promise<AuthUser[]> {
  return authRequest<AuthUser[]>("/users");
}

export async function createUser(input: {
  userId: string;
  password: string;
  lastName: string;
  firstName: string;
  modalityIds: number[];
}): Promise<AuthUser> {
  return authRequest<AuthUser>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUser(
  id: number,
  input: {
    userId: string;
    lastName: string;
    firstName: string;
  },
): Promise<AuthUser> {
  return authRequest<AuthUser>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteUser(id: number): Promise<void> {
  await authRequest<void>(`/users/${id}`, { method: "DELETE" });
}

export async function resetPassword(
  id: number,
  password: string,
): Promise<void> {
  await authRequest<void>(`/users/${id}/password`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

export async function changeOwnPassword(password: string): Promise<void> {
  await authRequest<void>("/auth/password", {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

export async function setManagePermission(
  id: number,
  canManageUsers: boolean,
): Promise<void> {
  await authRequest<void>(`/users/${id}/manage-permission`, {
    method: "PUT",
    body: JSON.stringify({ canManageUsers }),
  });
}

/**
 * ログイン後に戻す先として安全な、同一オリジン内のパスかを判定する。
 * `//evil.example` や `/\\evil.example` のような外部へ飛ぶ値と、ログイン・初期設定画面自体は拒否する。
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const pathname = value.split(/[?#]/)[0];
  if (
    isAuthPage(pathname) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api")
  ) {
    return null;
  }
  return value;
}

/** ログイン画面の URL の `next` から、ログイン後に戻す先を取り出す（なければ "/"）。 */
export function nextPathAfterLogin(): string {
  if (typeof window === "undefined") return "/";
  const next = new URLSearchParams(window.location.search).get("next");
  return safeNextPath(next) ?? "/";
}

/** 今いるページ（またはその `next`）をログイン後の戻り先として付けたログイン画面の URL。 */
export function loginUrl(): string {
  if (typeof window === "undefined") return "/login/";
  const { pathname, search, hash } = window.location;
  const current = isAuthPage(pathname)
    ? nextPathAfterLogin()
    : `${pathname}${search}${hash}`;
  const next = safeNextPath(current);
  if (!next || next === "/") return "/login/";
  return `/login/?next=${encodeURIComponent(next)}`;
}

export function isAuthPage(pathname = window.location.pathname) {
  return AUTH_PAGES.some(
    (page) => pathname === page || pathname === page.slice(0, -1),
  );
}

export async function redirectForAuthStatus(status: AuthStatus) {
  const path = window.location.pathname;
  if (status.needsSetup && !path.startsWith("/setup")) {
    go("/setup/");
    return false;
  }
  if (!status.needsSetup && !status.authenticated && !isAuthPage(path)) {
    go(loginUrl());
    return false;
  }
  if (status.authenticated && isAuthPage(path)) {
    go(nextPathAfterLogin());
    return false;
  }
  if (
    status.authenticated &&
    path.startsWith("/users") &&
    !status.user?.canManageUsers
  ) {
    go("/account/");
    return false;
  }
  return status.authenticated;
}

export async function requireAuthenticatedPage() {
  const status = await fetchAuthStatus();
  return redirectForAuthStatus(status);
}
