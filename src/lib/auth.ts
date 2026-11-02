import { go } from "@/lib/nav";

export type Modality = {
  id: number;
  name: string;
  isDefault: boolean;
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
const SESSION_ALIVE_KEY = "rct_session_alive";

export function markSessionAlive() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_ALIVE_KEY, "1");
}

export function hasSessionAlive() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_ALIVE_KEY) === "1";
}

export function clearSessionAlive() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_ALIVE_KEY);
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
  const status = await authRequest<AuthStatus>("/auth/status");
  if (status.authenticated && !hasSessionAlive()) {
    await logout();
    return {
      needsSetup: status.needsSetup,
      authenticated: false,
      user: null,
    };
  }
  return status;
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
  markSessionAlive();
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
  markSessionAlive();
  return user;
}

export async function logout(): Promise<void> {
  clearSessionAlive();
  await authRequest<void>("/auth/logout", { method: "POST" });
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
    go("/login/");
    return false;
  }
  if (status.authenticated && isAuthPage(path)) {
    go("/");
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
