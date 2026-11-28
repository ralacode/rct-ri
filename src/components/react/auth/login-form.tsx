import { useEffect, useRef, useState } from "react";
import { LogInIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  fetchAuthStatus,
  login,
  nextPathAfterLogin,
  onAuthEvent,
} from "@/lib/auth";
import { go } from "@/lib/nav";

import { AuthCard } from "./auth-card";

export function LoginForm() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const userIdRef = useRef<HTMLInputElement>(null);

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
      // ID 欄は空になっているので、すぐ入力し直せるようカーソルを戻す。
      userIdRef.current?.focus();
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard
      title="ログイン"
      description="担当者のユーザーIDとパスワードを入力してください。"
    >
      <form className="grid gap-5" autoComplete="off" onSubmit={handleSubmit}>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="staff-login-id">ユーザーID</FieldLabel>
            <Input
              id="staff-login-id"
              name="rct-no-store"
              ref={userIdRef}
              autoFocus
              required
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              className="tabular-nums"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">パスワード</FieldLabel>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {message && (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          <LogInIcon />
          {pending ? "確認中…" : "ログイン"}
        </Button>
      </form>
    </AuthCard>
  );
}
