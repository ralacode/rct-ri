// 初期管理者を作ったあとに表示する、施設名の登録画面。
// 施設名を登録するまでアプリは使えない。担当者管理権限のない人には、待ってもらう案内だけを出す。
import { useEffect, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import {
  fetchAuthStatus,
  loginUrl,
  logout,
  type AuthUser,
} from "@/lib/auth";
import { go } from "@/lib/nav";
import { saveFacilityName } from "@/lib/settings";

/** 一般の担当者の画面で、管理者が登録し終えたかを確かめる間隔 */
const RECHECK_INTERVAL_MS = 10 * 1000;

export function FacilitySetup() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const status = await fetchAuthStatus();
        if (stopped) return;
        if (status.needsSetup) return go("/setup/");
        if (!status.authenticated || !status.user) return go(loginUrl());
        if (!status.needsFacilityName) return go("/");
        setUser(status.user);
      } catch (error) {
        if (!stopped) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void check();
    const timer = window.setInterval(check, RECHECK_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setPending(true);
    try {
      await saveFacilityName(name);
      go("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      go("/login/");
    }
  };

  if (!user) {
    return message ? (
      <Card className="w-full">
        <p className="text-sm text-destructive">{message}</p>
      </Card>
    ) : null;
  }

  if (!user.canManageUsers) {
    return (
      <Card className="w-full">
        <div className="grid gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            施設名が登録されていません
          </h1>
          <p className="text-sm text-muted-foreground">
            管理者が施設名を登録するまで、アプリは使えません。管理者に施設名の登録を依頼してください。登録されると、この画面は自動で切り替わります。
          </p>
          <MyButton type="button" onClick={() => void handleLogout()}>
            ログアウト
          </MyButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">初期設定 2 / 2</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            施設名の登録
          </h1>
          <p className="text-sm text-muted-foreground">
            帳票（放射性医薬品使用記録簿・溶出記録など）に印字する施設名を登録してください。施設名を登録するまで、アプリは使えません。あとから設定画面で変更できます。
          </p>
        </div>
        <MyInput
          id="facility-name"
          label="施設名"
          required
          maxLength={100}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {message && (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
        <MyButton type="submit" disabled={pending || !name.trim()}>
          {pending ? "登録中..." : "登録してはじめる"}
        </MyButton>
      </form>
    </Card>
  );
}
