import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchAuthStatus, type AuthUser } from "@/lib/auth";
import {
  answerFeedback,
  createFeedback,
  FEEDBACK_ANSWER_MAX,
  FEEDBACK_BODY_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_SHORT_MAX,
  feedbackKindLabel,
  listFeedback,
  type FeedbackItem,
  type FeedbackKind,
} from "@/lib/feedback";
import { onDataChanged } from "@/lib/live";
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | "answered";

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "open", label: "未回答" },
  { value: "answered", label: "回答済み" },
];

// 看護師モードはサーバーの更新通知（職員専用）を受け取れないので、定期的に読み直す。
const NURSE_REFRESH_MS = 60 * 1000;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  // "YYYY-MM-DD HH:MM:SS" → "YYYY/MM/DD HH:MM"
  return value.slice(0, 16).replaceAll("-", "/");
}

function submitterText(item: FeedbackItem) {
  const role = item.submitterRole === "nurse" ? "看護師" : "職員";
  const who = [item.department, item.submitterName].filter(Boolean).join(" ");
  return who ? `${role}・${who}` : `${role}（名前なし）`;
}

export function FeedbackPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      setItems(await listFeedback());
      setLoadError("");
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      let staff: AuthUser | null = null;
      try {
        const status = await fetchAuthStatus();
        staff = status.authenticated ? status.user : null;
      } catch {
        // 認証状態が取れなくても一覧の読み込みは試す。
      }
      if (cancelled) return;
      setUser(staff);
      await load();
      if (cancelled) return;
      if (staff) {
        stop = onDataChanged(() => void load());
      } else {
        const timer = window.setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, NURSE_REFRESH_MS);
        const onVisible = () => {
          if (document.visibilityState === "visible") void load();
        };
        document.addEventListener("visibilitychange", onVisible);
        stop = () => {
          window.clearInterval(timer);
          document.removeEventListener("visibilitychange", onVisible);
        };
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [load]);

  const replaceItem = (next: FeedbackItem) =>
    setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));

  const counts = useMemo(() => {
    const answered = items.filter((item) => item.answer).length;
    return { all: items.length, answered, open: items.length - answered };
  }, [items]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) =>
        filter === "all"
          ? true
          : filter === "answered"
            ? Boolean(item.answer)
            : !item.answer,
      ),
    [items, filter],
  );

  return (
    <div className="mx-auto grid w-full max-w-3xl content-start gap-6 py-4">
      <div className="grid gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          RIS への質問・要望
        </h2>
        <p className="text-sm text-muted-foreground">
          RIS（放射線部門システム）について、わからないことや「こういうことがしたい」を送ってください。
          送った内容と回答は、下の一覧でみんなが見られます。
        </p>
      </div>

      <FeedbackForm
        staff={user}
        onCreated={(item) => {
          setItems((prev) => [item, ...prev]);
          setFilter("all");
        }}
      />

      <section className="grid gap-3" aria-labelledby="feedback-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="feedback-list-heading" className="text-lg font-semibold">
            みんなの質問・要望
          </h3>
          <div
            className="flex gap-1 rounded-lg border p-1"
            role="group"
            aria-label="表示する投稿"
          >
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? "default" : "ghost"}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span className="ml-1 tabular-nums">
                  {counts[option.value]}
                </span>
              </Button>
            ))}
          </div>
        </div>
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "まだ投稿はありません。最初の質問・要望を送ってみてください。"
              : "該当する投稿はありません。"}
          </p>
        ) : (
          <ul className="grid gap-3">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <FeedbackCard
                  item={item}
                  canAnswer={Boolean(user?.canAnswerFeedback)}
                  onAnswered={replaceItem}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FeedbackForm({
  staff,
  onCreated,
}: {
  staff: AuthUser | null;
  onCreated: (item: FeedbackItem) => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>("question");
  const [body, setBody] = useState("");
  const [department, setDepartment] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) {
      setIsError(true);
      setMessage("内容を入力してください");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const item = await createFeedback({
        kind,
        body,
        department,
        submitterName: name,
      });
      setBody("");
      setIsError(false);
      setMessage("送信しました。ありがとうございます。");
      onCreated(item);
    } catch (error) {
      setIsError(true);
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">種類</legend>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_KINDS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  kind === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="feedback-kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="feedback-body">
            内容<span className="ml-1 text-destructive">*</span>
          </Label>
          <Textarea
            id="feedback-body"
            required
            rows={4}
            maxLength={FEEDBACK_BODY_MAX}
            className="min-h-28 text-base"
            placeholder={
              kind === "request"
                ? "例：検査の予定を病棟ごとに一覧で見たい"
                : "例：検査予約の確認画面はどこから開けますか？"
            }
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {body.length} / {FEEDBACK_BODY_MAX}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MyInput
            id="feedback-department"
            label="所属・病棟（任意）"
            autoComplete="off"
            maxLength={FEEDBACK_SHORT_MAX}
            placeholder="例：5階東病棟"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          />
          <MyInput
            id="feedback-name"
            label="名前（任意）"
            autoComplete="off"
            maxLength={FEEDBACK_SHORT_MAX}
            placeholder={
              staff ? `空欄なら ${staff.displayName}` : "空欄でも送れます"
            }
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MyButton type="submit" disabled={pending}>
            {pending ? "送信中..." : "送信する"}
          </MyButton>
          {message && (
            <p
              role="status"
              className={cn(
                "text-sm",
                isError ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {message}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

function FeedbackCard({
  item,
  canAnswer,
  onAnswered,
}: {
  item: FeedbackItem;
  canAnswer: boolean;
  onAnswered: (item: FeedbackItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.answer);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const startEdit = () => {
    setDraft(item.answer);
    setError("");
    setEditing(true);
  };

  const save = async (text: string) => {
    setPending(true);
    setError("");
    try {
      onAnswered(await answerFeedback(item.id, text));
      setEditing(false);
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setPending(false);
    }
  };

  const answerId = `feedback-answer-${item.id}`;

  return (
    <Card>
      <article className="grid gap-3">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-md border px-2 py-0.5 font-medium text-foreground">
            {feedbackKindLabel(item.kind)}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-medium",
              item.answer
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {item.answer ? "回答済み" : "未回答"}
          </span>
          <span>{submitterText(item)}</span>
          <time className="ml-auto tabular-nums" dateTime={item.createdAt}>
            {formatDateTime(item.createdAt)}
          </time>
        </header>
        <p className="text-base whitespace-pre-wrap break-words">{item.body}</p>

        {item.answer && !editing && (
          <div className="grid gap-1 rounded-lg border-l-4 border-primary bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              回答：{item.answeredBy}
              {item.answeredAt && `（${formatDateTime(item.answeredAt)}）`}
            </p>
            <p className="text-sm whitespace-pre-wrap break-words">
              {item.answer}
            </p>
          </div>
        )}

        {canAnswer && editing && (
          <div className="grid gap-2">
            <Label htmlFor={answerId}>回答</Label>
            <Textarea
              id={answerId}
              rows={3}
              maxLength={FEEDBACK_ANSWER_MAX}
              className="min-h-24 text-base"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={pending || !draft.trim()}
                onClick={() => void save(draft)}
              >
                {pending ? "保存中..." : "回答を保存"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setEditing(false)}
              >
                やめる
              </Button>
              {item.answer && (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("この回答を取り消しますか？")) {
                      void save("");
                    }
                  }}
                >
                  回答を取り消す
                </Button>
              )}
            </div>
          </div>
        )}

        {canAnswer && !editing && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startEdit}
            >
              {item.answer ? "回答を編集" : "回答する"}
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </article>
    </Card>
  );
}
