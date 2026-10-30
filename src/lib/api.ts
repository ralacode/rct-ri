type InvokeArgs = Record<string, unknown>;

function hasTauriIpc(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI__?.core?.invoke);
}

function shouldUseHttp(): boolean {
  if (typeof window === "undefined") return true;
  const protocol = window.location.protocol;
  return protocol === "http:" || protocol === "https:";
}

function apiRoot(): string {
  if (typeof window !== "undefined" && window.location.port === "4321") {
    return "http://127.0.0.1:8080/api";
  }
  return "/api";
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  return text || response.statusText || `HTTP ${response.status}`;
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function invokeViaHttp<T>(cmd: string, args: InvokeArgs): Promise<T> {
  switch (cmd) {
    case "get_patients":
      return request<T>(`${apiRoot()}/patients`);
    case "search_patients_cmd":
      return request<T>(
        `${apiRoot()}/patients${queryString({
          keyword: args.keyword == null ? undefined : String(args.keyword),
          sortDesc:
            args.sortDesc === undefined ? undefined : String(Boolean(args.sortDesc)),
        })}`,
      );
    case "add_patient":
      return request<T>(`${apiRoot()}/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    case "edit_patient":
      return request<T>(`${apiRoot()}/patients/${args.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    case "remove_patient":
      return request<T>(`${apiRoot()}/patients/${args.id}`, { method: "DELETE" });
    case "get_exam_orders":
      return request<T>(`${apiRoot()}/patients/${args.patientDbId}/orders`);
    case "add_exam_order":
      return request<T>(`${apiRoot()}/patients/${args.patientDbId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    case "get_daily_exam_orders":
      return request<T>(
        `${apiRoot()}/exam-orders${queryString({ date: String(args.date ?? "") })}`,
      );
    case "edit_exam_order_fields":
      return request<T>(`${apiRoot()}/exam-orders/${args.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    case "delete_exam_order_cmd":
      return request<T>(`${apiRoot()}/exam-orders/${args.id}`, { method: "DELETE" });
    default:
      throw new Error(`未対応の API コマンドです: ${cmd}`);
  }
}

export async function invoke<T = unknown>(
  cmd: string,
  args: InvokeArgs = {},
): Promise<T> {
  if (hasTauriIpc() && !shouldUseHttp()) {
    return window.__TAURI__.core.invoke(cmd, args) as Promise<T>;
  }
  return invokeViaHttp<T>(cmd, args);
}
