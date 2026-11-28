import { useCallback, useEffect, useMemo, useState } from "react";

import { CircleCheckIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";
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
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="RIS への質問・要望"
        description="RIS（放射線部門システム）について、わからないことや「こういうことがしたい」を送ってください。送った内容と回答は、下の一覧でみんなが見られます。"
      />

      <FeedbackForm
        user={user}
        onCreated={(item) => {
          setItems((prev) => [item, ...prev]);
          setFilter("all");
        }}
      />

      <section className="grid gap-3" aria-labelledby="feedback-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="feedback-list-heading" className="text-lg font-semibold">
            みんなの質問・要望
          </h2>
          <ButtonGroup aria-label="表示する投稿">
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? "default" : "outline"}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span className="tabular-nums opacity-70">
                  {counts[option.value]}
                </span>
              </Button>
            ))}
          </ButtonGroup>
        </div>
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {loading ? (
          <div className="grid gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>
                {items.length === 0
                  ? "まだ投稿はありません"
                  : "該当する投稿はありません"}
              </EmptyTitle>
              {items.length === 0 && (
                <EmptyDescription>
                  最初の質問・要望を送ってみてください。
                </EmptyDescription>
              )}
            </EmptyHeader>
          </Empty>
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
    </PageContainer>
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
      setMessage("");
      toast.success("送信しました。ありがとうございます。");
      onCreated(item);
    } catch (error) {
      setIsError(true);
      setMessage(errorText(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="py-0">
      <CardContent className="py-6">
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <FieldSet className="gap-2">
            <FieldLegend variant="label" className="mb-0">
              種類
            </FieldLegend>
            <ButtonGroup aria-label="種類">
              {FEEDBACK_KINDS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={kind === option.value ? "default" : "outline"}
                  aria-pressed={kind === option.value}
                  onClick={() => setKind(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </ButtonGroup>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="feedback-body">
              内容<span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="feedback-body"
              required
              rows={4}
              maxLength={FEEDBACK_BODY_MAX}
              className="min-h-28"
              placeholder={
                kind === "request"
                  ? "例：検査の予定を病棟ごとに一覧で見たい"
                  : "例：検査予約の確認画面はどこから開けますか？"
              }
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <FieldDescription className="text-right tabular-nums">
              {body.length} / {FEEDBACK_BODY_MAX}
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="feedback-anonymous"
              checked={anonymous}
              onCheckedChange={(checked) => setAnonymous(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="feedback-anonymous">
                匿名で投稿する
              </FieldLabel>
              <FieldDescription>
                {anonymous
                  ? "一覧に名前は表示されません。自分の投稿として、回答が付く前なら削除できます。"
                  : `一覧に「${user?.displayName ?? "あなたの名前"}」と表示されます。`}
              </FieldDescription>
            </FieldContent>
          </Field>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {message && (
              <p
                role="status"
                className={cn(
                  "mr-auto text-sm",
                  isError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {message}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              <SendIcon />
              {pending ? "送信中…" : "送信する"}
            </Button>
          </div>
        </form>
      </CardContent>
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
  const [confirming, setConfirming] = useState<"delete" | "unanswer" | null>(
    null,
  );

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
    <Card className="gap-0 py-0">
      <article className="grid gap-3 p-4">
        <header className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{feedbackKindLabel(item.kind)}</Badge>
          {item.answer ? (
            <Badge>
              <CircleCheckIcon />
              回答済み
            </Badge>
          ) : (
            <Badge variant="secondary">未回答</Badge>
          )}
          <span>{author}</span>
          {item.isMine && <Badge variant="secondary">自分の投稿</Badge>}
          <time className="ml-auto tabular-nums" dateTime={item.createdAt}>
            {formatDateTime(item.createdAt)}
          </time>
        </header>
        <p className="break-words whitespace-pre-wrap">{item.body}</p>

        {item.answer && !editing && (
          <div className="grid gap-1 rounded-lg border-l-4 border-foreground bg-muted/60 p-3">
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
              className="min-h-24"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending || !draft.trim()}
                onClick={() => void save(draft)}
              >
                {pending ? "保存中…" : "回答を保存"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setEditing(false)}
              >
                やめる
              </Button>
              {item.answer && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() => setConfirming("unanswer")}
                >
                  回答を取り消す
                </Button>
              )}
            </div>
          </div>
        )}

        {!editing && (canAnswer || item.canDelete || item.isMine) && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
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
                onClick={() => setConfirming("delete")}
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

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "delete"
                ? item.isMine
                  ? "この投稿を削除しますか？"
                  : "この投稿（他の人の投稿）を削除しますか？"
                : "この回答を取り消しますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "delete"
                ? "削除すると元に戻せません。"
                : "取り消すと、この投稿は「未回答」に戻ります。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const kind = confirming;
                setConfirming(null);
                if (kind === "delete") void remove();
                else void save("");
              }}
            >
              {confirming === "delete" ? "削除する" : "取り消す"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
