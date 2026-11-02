import { useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import { changeOwnPassword } from "@/lib/auth";
import { go } from "@/lib/nav";

export function AccountPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (password !== confirm) {
      setIsError(true);
      setMessage("パスワードが一致しません");
      return;
    }
    setPending(true);
    try {
      await changeOwnPassword(password);
      setPassword("");
      setConfirm("");
      setIsError(false);
      setMessage("パスワードを変更しました。再ログインしてください。");
      go("/login/");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <form className="grid gap-4" autoComplete="off" onSubmit={handleSubmit}>
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            パスワードの変更
          </h2>
          <p className="text-sm text-muted-foreground">
            自分のパスワードだけを変更できます。変更後は再ログインが必要です。
          </p>
        </div>
        <MyInput
          id="new-password"
          label="新しいパスワード（8文字以上）"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <MyInput
          id="confirm-password"
          label="新しいパスワード（確認）"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {message && (
          <p className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message}
          </p>
        )}
        <MyButton type="submit" disabled={pending} className="justify-self-start">
          {pending ? "変更中..." : "変更する"}
        </MyButton>
      </form>
    </Card>
  );
}
