import { useEffect, useState } from "react";

import { ModalityPicker } from "@/components/react/auth/modality-picker";
import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import {
  fetchAuthStatus,
  listPublicModalities,
  setupAdmin,
  type Modality,
} from "@/lib/auth";
import { go } from "@/lib/nav";

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
        setModalityIds(items.filter((item) => item.isDefault).map((item) => item.id));
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
      go("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="w-full">
      <form className="grid gap-4" autoComplete="off" onSubmit={handleSubmit}>
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            初期管理者の作成
          </h1>
          <p className="text-sm text-muted-foreground">
            最初の担当者アカウントを作成します。この画面はユーザーが0人のときだけ表示されます。
          </p>
        </div>
        <MyInput
          id="staff-setup-id"
          name="rct-no-store"
          label="ユーザーID（8桁の数字）"
          required
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <MyInput
            id="lastName"
            label="姓"
            required
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
          <MyInput
            id="firstName"
            label="名"
            required
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <ModalityPicker
          modalities={modalities}
          selectedIds={modalityIds}
          onChange={setModalityIds}
          idPrefix="setup-modality"
        />
        <MyInput
          id="password"
          label="パスワード（8文字以上）"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <MyInput
          id="confirm"
          label="パスワード（確認）"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {message && <p className="text-sm text-destructive">{message}</p>}
        <MyButton type="submit" disabled={pending}>
          {pending ? "作成中..." : "作成してログイン"}
        </MyButton>
      </form>
    </Card>
  );
}
