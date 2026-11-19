import { useCallback, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchMe, type AuthUser } from "@/lib/auth";
import {
  answerFeedback,
  createFeedback,
  deleteFeedback,
  FEEDBACK_ANSWER_MAX,
  FEEDBACK_BODY_MAX,
  FEEDBACK_KINDS,
  feedbackKindLabel,
  listFeedback,
  type FeedbackItem,
  type FeedbackKind,
} from "@/lib/feedback";
import { onDataChanged } from "@/lib/live";
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | "answered" | "mine";

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "open", label: "未回答" },
  { value: "answered", label: "回答済み" },
  { value: "mine", label: "自分の投稿" },
];

function matchesFilter(item: FeedbackItem, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return !item.answer;
    case "answered":
      return Boolean(item.answer);
    case "mine":
      return item.isMine;
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  // "YYYY-MM-DD HH:MM:SS" → "YYYY/MM/DD HH:MM"
  return value.slice(0, 16).replaceAll("-", "/");
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
    void fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
    void load();
    return onDataChanged(() => void load());
  }, [load]);

  const replaceItem = (next: FeedbackItem) =>
    setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));

  const removeItem = (id: number) =>
    setItems((prev) => prev.filter((item) => item.id !== id));

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(({ value }) => [
          value,
          items.filter((item) => matchesFilter(item, value)).length,
        ]),
      ) as Record<Filter, number>,
    [items],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
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
        user={user}
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
            className="flex flex-wrap gap-1 rounded-lg border p-1"
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
                  onDeleted={removeItem}
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
  user,
  onCreated,
}: {
  user: AuthUser | null;
  onCreated: (item: FeedbackItem) => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>("question");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
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
      const item = await createFeedback({ kind, body, anonymous });
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
        <div className="grid gap-1">
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
            />
            匿名で投稿する
          </label>
          <p className="text-xs text-muted-foreground">
            {anonymous
              ? "一覧に名前は表示されません。自分の投稿として、回答が付く前なら削除できます。"
              : `一覧に「${user?.displayName ?? "あなたの名前"}」と表示されます。`}
          </p>
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
  onDeleted,
}: {
  item: FeedbackItem;
  canAnswer: boolean;
  onAnswered: (item: FeedbackItem) => void;
  onDeleted: (id: number) => void;
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

  const remove = async () => {
    const what = item.isMine ? "この投稿" : "この投稿（他の人の投稿）";
    if (
      !window.confirm(`${what}を削除しますか？\n削除すると元に戻せません。`)
    ) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await deleteFeedback(item.id);
      onDeleted(item.id);
    } catch (deleteError) {
      setError(errorText(deleteError));
      setPending(false);
    }
  };

  const answerId = `feedback-answer-${item.id}`;
  const author = item.anonymous ? "匿名" : item.authorName || "名前なし";

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
          <span>{author}</span>
          {item.isMine && (
            <span className="rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              自分の投稿
            </span>
          )}
          <time className="ml-auto tabular-nums" dateTime={item.createdAt}>
            {formatDateTime(item.createdAt)}
          </time>
        </header>
        <p className="text-base break-words whitespace-pre-wrap">{item.body}</p>

        {item.answer && !editing && (
          <div className="grid gap-1 rounded-lg border-l-4 border-primary bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              回答：{item.answeredBy}
              {item.answeredAt && `（${formatDateTime(item.answeredAt)}）`}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap">
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

        {!editing && (canAnswer || item.canDelete || item.isMine) && (
          <div className="flex flex-wrap items-center gap-2">
            {canAnswer && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startEdit}
              >
                {item.answer ? "回答を編集" : "回答する"}
              </Button>
            )}
            {item.canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() => void remove()}
              >
                削除
              </Button>
            ) : (
              item.isMine && (
                <span className="ml-auto text-xs text-muted-foreground">
                  回答が付いたため削除できません
                </span>
              )
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </article>
    </Card>
  );
}
