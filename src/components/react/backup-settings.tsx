// 設定画面の「DB の自動バックアップ」。バックアップ先（外付け HDD など）の指定と、状態の確認・手動実行。
import { useEffect, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import { Button } from "@/components/ui/button";
import { onDataChanged } from "@/lib/live";
import {
  type BackupStatus,
  getBackupStatus,
  runBackupNow,
  saveBackupDir,
} from "@/lib/settings";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
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
        .catch((error) => {
          setIsError(true);
          setMessage(errorText(error));
        });
    };
    load();
    return onDataChanged(load);
  }, []);

  const show = (text: string, error: boolean) => {
    setMessage(text);
    setIsError(error);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("save");
    try {
      const next = await saveBackupDir(dir);
      apply(next, true);
      show(
        next.dir
          ? `バックアップ先を「${next.dir}」にしました`
          : "自動バックアップを止めました",
        false,
      );
    } catch (error) {
      show(errorText(error), true);
    } finally {
      setPending(null);
    }
  };

  const handleRun = async () => {
    setPending("run");
    try {
      const next = await runBackupNow();
      apply(next, false);
      show("バックアップしました", false);
    } catch (error) {
      // 失敗の理由は「前回」の欄に出るので、そこに出ないもの（実行中など）だけ下に出す。
      const text = errorText(error);
      const next = await getBackupStatus().catch(() => null);
      if (next) apply(next, false);
      show(next?.lastMessage === text ? "" : text, true);
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
      <div className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            DB の自動バックアップ
          </h2>
          <p className="text-sm text-muted-foreground">
            {`毎日 ${times} に、業務データ・担当者・依頼科と依頼医・質問と要望の DB を、下のフォルダへ日時の名前のフォルダで保存します。` +
              `新しいものから ${keep} 回分を残し、古いものは自動で消します（動画は含みません）。` +
              "時刻にアプリが止まっていたり HDD が外れていたりしたときは、次に動けたときに取り直します。"}
          </p>
        </div>

        <form
          className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
          onSubmit={handleSave}
        >
          <MyInput
            id="settings-backup-dir"
            label="バックアップ先のフォルダ（このアプリを起動している PC のパス）"
            placeholder="例：E:\RCT_backup"
            value={dir}
            onChange={(event) => setDir(event.target.value)}
          />
          <MyButton type="submit" disabled={pending !== null || !changed}>
            保存
          </MyButton>
        </form>
        <p className="-mt-2 text-xs text-muted-foreground">
          フォルダがなければ作ります。空欄で保存すると自動バックアップを止めます。
        </p>

        {status?.dir && (
          <div className="grid gap-3 rounded-md border p-3">
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">前回</dt>
              <dd>
                {status.lastAt ? (
                  <>
                    {shortTime(status.lastAt)}{" "}
                    {status.lastOk ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        成功
                      </span>
                    ) : (
                      <span className="font-medium text-destructive">失敗</span>
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
            <div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleRun}
                disabled={pending !== null || changed}
              >
                {pending === "run" ? "バックアップ中…" : "今すぐバックアップ"}
              </Button>
            </div>
          </div>
        )}

        {message && (
          <p
            className={
              isError
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </div>
    </Card>
  );
}
