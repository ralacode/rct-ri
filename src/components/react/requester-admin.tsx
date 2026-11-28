// 依頼科・依頼医の一覧の管理（名前の変更・削除・追加）。
import { useEffect, useState } from "react";

import { CheckIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";
import { onDataChanged } from "@/lib/live";
import {
  createRequester,
  deleteRequester,
  listRequesters,
  renameRequester,
  REQUESTER_LABELS,
  type Requester,
  type RequesterKind,
} from "@/lib/requesters";
import { normalizeForSearch } from "@/lib/sidebar-menu";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function RequesterSection({ kind }: { kind: RequesterKind }) {
  const label = REQUESTER_LABELS[kind];
  const [items, setItems] = useState<Requester[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<Requester | null>(null);

  // 結果は通知で知らせる
  const show = (text: string, error = false) => {
    if (error) toast.error(text);
    else toast.success(text);
  };

  const load = async () => {
    const next = await listRequesters(kind);
    setItems(next);
    // 編集途中の欄は残し、新しく増えた名前だけ入力欄に入れる。
    setEdits((current) => {
      const merged: Record<number, string> = {};
      for (const item of next) {
        merged[item.id] = current[item.id] ?? item.name;
      }
      return merged;
    });
  };

  useEffect(() => {
    const reload = () =>
      void load().catch((error) => show(errorText(error), true));
    reload();
    return onDataChanged(reload);
  }, [kind]);

  const run = async (action: () => Promise<void>, done: string) => {
    setPending(true);
    try {
      await action();
      await load();
      show(done);
    } catch (error) {
      show(errorText(error), true);
    } finally {
      setPending(false);
    }
  };

  const handleRename = (item: Requester) => {
    const name = (edits[item.id] ?? "").trim();
    if (name === item.name) return;
    void run(async () => {
      await renameRequester(kind, item.id, name);
      setEdits((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }, `${item.name} を ${name} に変更しました`);
  };

  const handleDelete = (item: Requester) => {
    void run(
      () => deleteRequester(kind, item.id),
      `${item.name} を削除しました`,
    );
  };

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      await createRequester(kind, name);
      setNewName("");
    }, `${name} を追加しました`);
  };

  const q = normalizeForSearch(query);
  const visible = q
    ? items.filter((item) => normalizeForSearch(item.name).includes(q))
    : items;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>
          {label}
          <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
            {items.length} 件
          </span>
        </CardTitle>
        <CardDescription>よく使う順に並んでいます。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="flex gap-2" onSubmit={handleAdd}>
          <Input
            id={`new-${kind}`}
            aria-label={`${label}を追加`}
            placeholder={`${label}を追加`}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button type="submit" disabled={pending || !newName.trim()}>
            <PlusIcon />
            追加
          </Button>
        </form>

        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            id={`search-${kind}`}
            aria-label="絞り込み"
            placeholder={`${label}の名前で絞り込み`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>

        <ul className="grid divide-y rounded-lg border">
          {visible.map((item) => {
            const value = edits[item.id] ?? item.name;
            const changed = value.trim() !== item.name;
            return (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <Input
                  id={`${kind}-${item.id}`}
                  aria-label={`${item.name} の名前`}
                  className="h-8 min-w-0 flex-1 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
                  value={value}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRename(item);
                    }
                  }}
                />
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  使用 {item.useCount} 回
                </span>
                {changed ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !value.trim()}
                    onClick={() => handleRename(item)}
                  >
                    <CheckIcon />
                    変更
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${item.name} を削除`}
                    className="text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? `${label}はまだ登録されていません`
                : "当てはまる名前がありません"}
            </li>
          )}
        </ul>
      </CardContent>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.name} を{label}の候補から削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              これまでのオーダー・治療依頼に記録された名前は変わりません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) handleDelete(deleting);
                setDeleting(null);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function RequesterAdmin() {
  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        title="依頼科・依頼医"
        description="検査オーダーと治療依頼の入力候補です。名前を変えたり削除したりしても、これまでのオーダー・治療依頼に記録された名前は変わりません。"
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <RequesterSection kind="departments" />
        <RequesterSection kind="physicians" />
      </div>
    </PageContainer>
  );
}
