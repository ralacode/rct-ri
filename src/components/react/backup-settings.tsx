// 設定画面の「DB の自動バックアップ」。バックアップ先（外付け HDD など）の指定と、状態の確認・手動実行。
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { onDataChanged } from "@/lib/live";
import {
  type BackupStatus,
  getBackupStatus,
  runBackupNow,
  saveBackupDir,
} from "@/lib/settings";
import { errorMessage } from "@/lib/utils";

/** "2026-11-26 09:00:00" → "2026-11-26 9:00" */
function shortTime(value: string | null) {
  if (!value) return "—";
  const [date, time = ""] = value.split(" ");
  const [hour = "", minute = ""] = time.split(":");
  return `${date} ${Number(hour)}:${minute}`;
}

export function BackupSettings() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [dir, setDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "run" | null>(null);

  const apply = (next: BackupStatus, syncInput: boolean) => {
    setStatus(next);
    if (syncInput) setDir(next.dir ?? "");
  };

  useEffect(() => {
    let first = true;
    const load = () => {
      void getBackupStatus()
        .then((next) => {
          apply(next, first);
          first = false;
        })
        .catch((err) => setError(errorMessage(err, "読み込みに失敗しました")));
    };
    load();
    return onDataChanged(load);
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("save");
    try {
      const next = await saveBackupDir(dir);
      apply(next, true);
      setError(null);
      toast.success(
        next.dir
          ? `バックアップ先を「${next.dir}」にしました`
          : "自動バックアップを止めました",
      );
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました"));
    } finally {
      setPending(null);
    }
  };

  const handleRun = async () => {
    setPending("run");
    try {
      const next = await runBackupNow();
      apply(next, false);
      setError(null);
      toast.success("バックアップしました");
    } catch (err) {
      // 失敗の理由は「前回」の欄に出るので、そこに出ないもの（実行中など）だけ下に出す。
      const text = errorMessage(err, "バックアップに失敗しました");
      const next = await getBackupStatus().catch(() => null);
      if (next) apply(next, false);
      setError(next?.lastMessage === text ? null : text);
    } finally {
      setPending(null);
    }
  };

  const saved = status?.dir ?? "";
  const changed = dir.trim() !== saved;
  const times = status?.times.join("・") ?? "9:00・16:00";
  const keep = status?.keep ?? 30;

  return (
    <Card>
      <form onSubmit={handleSave} className="grid gap-6">
        <CardHeader>
          <CardTitle>DB の自動バックアップ</CardTitle>
          <CardDescription>
            {`毎日 ${times} に、業務データ・担当者・依頼科と依頼医・質問と要望・作業報告書（添付ファイルを含む）の DB を、下のフォルダへ日時の名前のフォルダで保存します。` +
              `新しいものから ${keep} 回分を残し、古いものは自動で消します（動画は含みません）。` +
              "時刻にアプリが止まっていたり HDD が外れていたりしたときは、次に動けたときに取り直します。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="settings-backup-dir">
              バックアップ先のフォルダ（このアプリを起動している PC のパス）
            </FieldLabel>
            <Input
              id="settings-backup-dir"
              placeholder="例：E:\RCT_backup"
              value={dir}
              onChange={(event) => setDir(event.target.value)}
            />
            <FieldDescription>
              フォルダがなければ作ります。空欄で保存すると自動バックアップを止めます。
            </FieldDescription>
          </Field>

          {status?.dir && (
            <div className="grid gap-3 rounded-lg border p-3">
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr] sm:items-center">
                <dt className="text-muted-foreground">前回</dt>
                <dd className="flex items-center gap-2">
                  {status.lastAt ? (
                    <>
                      {shortTime(status.lastAt)}
                      {status.lastOk ? (
                        <Badge variant="secondary">成功</Badge>
                      ) : (
                        <Badge variant="destructive">失敗</Badge>
                      )}
                    </>
                  ) : (
                    "まだありません"
                  )}
                </dd>
                <dt className="text-muted-foreground">次回</dt>
                <dd>{shortTime(status.nextAt)}</dd>
                <dt className="text-muted-foreground">保存済み</dt>
                <dd>
                  {status.dirAvailable
                    ? `${status.backups.length} / ${keep} 回分`
                    : "バックアップ先を開けません"}
                </dd>
              </dl>
              {status.lastOk === false && status.lastMessage && (
                <p className="text-sm text-destructive" role="alert">
                  {status.lastMessage}
                </p>
              )}
              {!status.dirAvailable && status.lastOk !== false && (
                <p className="text-sm text-destructive" role="alert">
                  {status.dir} が見つかりません。外付け HDD
                  がつながっているか確認してください。
                </p>
              )}
              {status.backups.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    保存済みのバックアップを見る
                  </summary>
                  <ul className="mt-2 grid max-h-48 gap-0.5 overflow-y-auto font-mono text-xs">
                    {status.backups.map((entry) => (
                      <li key={entry.name}>
                        {entry.name}
                        <span className="ml-3 font-sans text-muted-foreground">
                          {shortTime(entry.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          {status?.dir && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRun}
              disabled={pending !== null || changed}
            >
              {pending === "run" ? "バックアップ中…" : "今すぐバックアップ"}
            </Button>
          )}
          <Button type="submit" disabled={pending !== null || !changed}>
            {pending === "save" ? "保存中…" : "保存する"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
