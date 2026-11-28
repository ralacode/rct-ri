// 自分のパスワードの変更。変更後は再ログインが必要。
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changeOwnPassword } from "@/lib/auth";
import { go } from "@/lib/nav";
import { errorMessage } from "@/lib/utils";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

export function AccountPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setPending(true);
    try {
      await changeOwnPassword(password);
      setPassword("");
      setConfirm("");
      go("/login/");
    } catch (err) {
      setError(errorMessage(err, "変更に失敗しました"));
    } finally {
      setPending(false);
    }
  };

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader
        title="アカウント"
        description="自分のログイン情報の設定です"
      />
      <Card>
        <form className="grid gap-6" autoComplete="off" onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>パスワードの変更</CardTitle>
            <CardDescription>
              自分のパスワードだけを変更できます。変更後は再ログインが必要です。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="new-password">新しいパスワード</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>8 文字以上にしてください</FieldDescription>
              </Field>
              <Field data-invalid={mismatch ? true : undefined}>
                <FieldLabel htmlFor="confirm-password">
                  新しいパスワード（確認）
                </FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  aria-invalid={mismatch ? true : undefined}
                  onChange={(event) => {
                    setConfirm(event.target.value);
                    setMismatch(false);
                  }}
                />
                {mismatch && <FieldError>パスワードが一致しません</FieldError>}
              </Field>
            </FieldGroup>
            {error && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button type="submit" disabled={pending}>
              {pending ? "変更中…" : "変更する"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </PageContainer>
  );
}
