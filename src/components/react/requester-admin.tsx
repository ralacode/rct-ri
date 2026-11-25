// 依頼科・依頼医の一覧の管理（名前の変更・削除・追加）。
import { useEffect, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
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
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  const show = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
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
    const reload = () => void load().catch((error) => show(errorText(error), true));
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
    if (
      !window.confirm(
        `${item.name} を${label}の候補から削除しますか？\n（これまでのオーダーに記録された名前は変わりません）`,
      )
    ) {
      return;
    }
    void run(() => deleteRequester(kind, item.id), `${item.name} を削除しました`);
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
    <Card>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {label}（{items.length}件）
          </h2>
          <p className="text-sm text-muted-foreground">
            よく使う順に並んでいます。名前を変えたり削除したりしても、これまでのオーダー・治療依頼に記録された名前は変わりません。
          </p>
        </div>

        <form
          className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
          onSubmit={handleAdd}
        >
          <MyInput
            id={`new-${kind}`}
            label={`${label}を追加`}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <MyButton type="submit" disabled={pending || !newName.trim()}>
            追加
          </MyButton>
        </form>

        <MyInput
          id={`search-${kind}`}
          label="絞り込み"
          placeholder={`${label}の名前で絞り込み...`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {message && (
          <p
            className={
              isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"
            }
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}

        <ul className="grid gap-2">
          {visible.map((item) => {
            const value = edits[item.id] ?? item.name;
            const changed = value.trim() !== item.name;
            return (
              <li
                key={item.id}
                className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_auto] md:items-end"
              >
                <div className="grid gap-1">
                  <MyInput
                    id={`${kind}-${item.id}`}
                    label={`使用 ${item.useCount} 回`}
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
                </div>
                <div className="flex flex-wrap gap-2">
                  <MyButton
                    type="button"
                    disabled={pending || !changed || !value.trim()}
                    onClick={() => handleRename(item)}
                  >
                    名前を変更
                  </MyButton>
                  <MyButton
                    type="button"
                    disabled={pending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => handleDelete(item)}
                  >
                    削除
                  </MyButton>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="text-sm text-muted-foreground">
              {items.length === 0
                ? `${label}はまだ登録されていません`
                : "当てはまる名前がありません"}
            </li>
          )}
        </ul>
      </div>
    </Card>
  );
}

export function RequesterAdmin() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <RequesterSection kind="departments" />
      <RequesterSection kind="physicians" />
    </div>
  );
}
