import { useEffect, useState } from "react";

import { Card } from "@/components/react/card";
import { Button } from "@/components/ui/button";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import {
  enterNurseMode,
  fetchAuthStatus,
  NURSE_HOME,
  login,
  nextPathAfterLogin,
  onAuthEvent,
} from "@/lib/auth";
import { go } from "@/lib/nav";

export function LoginForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetchAuthStatus().then((status) => {
      if (status.needsSetup) go("/setup/");
      if (status.authenticated) go(nextPathAfterLogin());
    });
    // 別タブでログインしたら、このタブもログイン後の画面へ移動する。
    return onAuthEvent((type) => {
      if (type === "login") go(nextPathAfterLogin());
    });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setPending(true);
    const nextUserId = userId;
    setUserId("");
    try {
      await login({ userId: nextUserId, password });
      setPassword("");
      // メール等で共有された URL から来た場合は、ログイン後にそのページへ戻す。
      go(nextPathAfterLogin());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const handleNurse = () => {
    // 看護師はパスワードなしで質問・要望ページだけを使える。
    enterNurseMode();
    go(NURSE_HOME);
  };

  return (
    <Card className="w-full">
      <form className="grid gap-4" autoComplete="off" onSubmit={handleSubmit}>
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">ログイン</h1>
          <p className="text-sm text-muted-foreground">
            担当者のユーザーIDとパスワードを入力してください。
          </p>
        </div>
        <MyInput
          id="staff-login-id"
          name="rct-no-store"
          label="ユーザーID"
          required
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <MyInput
          id="password"
          label="パスワード"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {message && <p className="text-sm text-destructive">{message}</p>}
        <MyButton type="submit" disabled={pending}>
          {pending ? "確認中..." : "ログイン"}
        </MyButton>
      </form>
      <div className="mt-6 grid gap-2 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          看護師の方は、パスワードなしで RIS への質問・要望を送れます。
        </p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 text-base"
          onClick={handleNurse}
        >
          看護師はこちら
        </Button>
      </div>
    </Card>
  );
}
