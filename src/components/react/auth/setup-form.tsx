import { useEffect, useState } from "react";

import { ModalityPicker } from "@/components/react/auth/modality-picker";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  fetchAuthStatus,
  listPublicModalities,
  setupAdmin,
  type Modality,
} from "@/lib/auth";
import { go } from "@/lib/nav";
import { RADIATION_THERAPY_CODE, RI_CODE } from "@/lib/permissions";

import { AuthCard } from "./auth-card";

export function SetupForm() {
  const [userId, setUserId] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [modalityIds, setModalityIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetchAuthStatus().then((status) => {
      if (!status.needsSetup && status.authenticated) go("/");
      if (!status.needsSetup && !status.authenticated) go("/login/");
    });
    void listPublicModalities()
      .then((items) => {
        setModalities(items);
        // 初期管理者は一般撮影・RI・放射線治療に所属させておく（あとで担当者管理で変えられる）。
        setModalityIds(
          items
            .filter(
              (item) =>
                item.isDefault ||
                item.code === RI_CODE ||
                item.code === RADIATION_THERAPY_CODE,
            )
            .map((item) => item.id),
        );
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (password !== confirm) {
      setMessage("パスワードが一致しません");
      return;
    }
    if (modalityIds.length === 0) {
      setMessage("担当モダリティは1つ以上選んでください");
      return;
    }
    setPending(true);
    const nextUserId = userId;
    setUserId("");
    try {
      await setupAdmin({
        userId: nextUserId,
        password,
        lastName,
        firstName,
        modalityIds,
      });
      setPassword("");
      setConfirm("");
      // 次は施設名の登録（登録するまでアプリは使えない）
      go("/setup/facility/");
    } catch (error) {
      setUserId(nextUserId);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard
      step="初期設定 1 / 2"
      title="初期管理者の作成"
      description="最初の担当者アカウントを作成します。この画面はユーザーが 0 人のときだけ表示されます。"
    >
      <form className="grid gap-5" autoComplete="off" onSubmit={handleSubmit}>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="staff-setup-id">ユーザーID</FieldLabel>
            <Input
              id="staff-setup-id"
              name="rct-no-store"
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
            <FieldDescription>8 桁の数字</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="lastName">姓</FieldLabel>
              <Input
                id="lastName"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="firstName">名</FieldLabel>
              <Input
                id="firstName"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
          </div>
          <ModalityPicker
            modalities={modalities}
            selectedIds={modalityIds}
            onChange={setModalityIds}
            idPrefix="setup-modality"
          />
          <Field>
            <FieldLabel htmlFor="password">パスワード</FieldLabel>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldDescription>8 文字以上</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm">パスワード（確認）</FieldLabel>
            <Input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
        </FieldGroup>
        {message && (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending || modalities.length === 0}
          className="w-full"
        >
          {pending ? "作成中…" : "作成してログイン"}
        </Button>
      </form>
    </AuthCard>
  );
}
