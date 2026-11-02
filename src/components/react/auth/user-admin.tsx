import { useEffect, useState } from "react";

import { ModalityPicker } from "@/components/react/auth/modality-picker";
import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import {
  createModality,
  createUser,
  deleteModality,
  deleteUser,
  fetchMe,
  listModalities,
  listUsers,
  renameModality,
  resetPassword,
  setManagePermission,
  setUserModalities,
  type AuthUser,
  type Modality,
} from "@/lib/auth";

export function UserAdmin() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [userId, setUserId] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [modalityIds, setModalityIds] = useState<number[]>([]);
  const [newModalityName, setNewModalityName] = useState("");
  const [renameEdits, setRenameEdits] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);
  const [passwordEdits, setPasswordEdits] = useState<Record<number, string>>(
    {},
  );

  const defaultModalityIds = (items: Modality[]) =>
    items.filter((item) => item.isDefault).map((item) => item.id);

  const load = async () => {
    const [nextUsers, nextMe, nextModalities] = await Promise.all([
      listUsers(),
      fetchMe(),
      listModalities(),
    ]);
    setUsers(nextUsers);
    setMe(nextMe);
    setModalities(nextModalities);
    setModalityIds((current) =>
      current.length > 0 ? current : defaultModalityIds(nextModalities),
    );
    setRenameEdits((current) => {
      const next = { ...current };
      for (const item of nextModalities) {
        if (next[item.id] === undefined) next[item.id] = item.name;
      }
      return next;
    });
  };

  useEffect(() => {
    void load().catch((error) => {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, []);

  const showMessage = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (modalityIds.length === 0) {
      showMessage("担当モダリティは1つ以上選んでください", true);
      return;
    }
    setPending(true);
    const nextUserId = userId;
    setUserId("");
    try {
      await createUser({
        userId: nextUserId,
        password,
        lastName,
        firstName,
        modalityIds,
      });
      setLastName("");
      setFirstName("");
      setPassword("");
      setModalityIds(defaultModalityIds(modalities));
      await load();
      showMessage("担当者を追加しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async (user: AuthUser) => {
    if (user.id === me?.id) {
      showMessage("自分自身は削除できません。他の担当者に依頼してください。", true);
      return;
    }
    if (user.isInitialAdmin) {
      showMessage("初期管理者は削除できません", true);
      return;
    }
    if (!window.confirm(`${user.displayName} を削除しますか？`)) {
      return;
    }
    try {
      await deleteUser(user.id);
      await load();
      showMessage("担当者を削除しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handleReset = async (user: AuthUser) => {
    const nextPassword = passwordEdits[user.id] ?? "";
    if (nextPassword.length < 8) {
      showMessage("パスワードは8文字以上にしてください", true);
      return;
    }
    try {
      await resetPassword(user.id, nextPassword);
      setPasswordEdits((prev) => ({ ...prev, [user.id]: "" }));
      showMessage("パスワードを初期化しました。新しいパスワードを本人に伝えてください。");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handlePermission = async (user: AuthUser, canManageUsers: boolean) => {
    try {
      await setManagePermission(user.id, canManageUsers);
      await load();
      showMessage(
        canManageUsers
          ? "ユーザー管理権限を付与しました"
          : "ユーザー管理権限を外しました",
      );
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handleUserModalities = async (user: AuthUser, ids: number[]) => {
    try {
      await setUserModalities(user.id, ids);
      await load();
      showMessage("担当モダリティを更新しました");
    } catch (error) {
      await load();
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handleAddModality = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createModality(newModalityName);
      setNewModalityName("");
      await load();
      showMessage("モダリティを追加しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handleRename = async (modality: Modality) => {
    const name = (renameEdits[modality.id] ?? "").trim();
    try {
      await renameModality(modality.id, name);
      await load();
      showMessage("モダリティ名を変更しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handleDeleteModality = async (modality: Modality) => {
    if (!window.confirm(`${modality.name} を削除しますか？`)) return;
    try {
      await deleteModality(modality.id);
      await load();
      showMessage("モダリティを削除しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  return (
    <div className="grid gap-6">
      {me?.isInitialAdmin && (
        <Card>
          <form className="grid gap-4" onSubmit={handleAddModality}>
            <h2 className="text-lg font-semibold tracking-tight">モダリティ</h2>
            <div className="grid gap-3">
              {modalities.map((modality) => (
                <div
                  key={modality.id}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_auto] md:items-end"
                >
                  <MyInput
                    id={`rename-modality-${modality.id}`}
                    label={modality.isDefault ? "名前（削除不可）" : "名前"}
                    value={renameEdits[modality.id] ?? modality.name}
                    onChange={(event) =>
                      setRenameEdits((prev) => ({
                        ...prev,
                        [modality.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <MyButton
                      type="button"
                      onClick={() => void handleRename(modality)}
                    >
                      名前を変更
                    </MyButton>
                    {!modality.isDefault && (
                      <MyButton
                        type="button"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void handleDeleteModality(modality)}
                      >
                        削除
                      </MyButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <MyInput
                id="new-modality-name"
                label="新しいモダリティ"
                value={newModalityName}
                onChange={(event) => setNewModalityName(event.target.value)}
              />
              <MyButton type="submit">追加</MyButton>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <form className="grid gap-4" autoComplete="off" onSubmit={handleCreate}>
          <h2 className="text-lg font-semibold tracking-tight">担当者を追加</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <MyInput
              id="new-staff-id"
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
            <MyInput
              id="new-password"
              label="初期パスワード"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <MyInput
              id="new-last-name"
              label="姓"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
            <MyInput
              id="new-first-name"
              label="名"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <ModalityPicker
            modalities={modalities}
            selectedIds={modalityIds}
            onChange={setModalityIds}
            idPrefix="new-user-modality"
          />
          <MyButton type="submit" disabled={pending} className="justify-self-start">
            {pending ? "追加中..." : "追加"}
          </MyButton>
        </form>
      </Card>

      <Card>
        <div className="grid gap-4">
          <h2 className="text-lg font-semibold tracking-tight">登録済みの担当者</h2>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">担当者がいません。</p>
          ) : (
            <ul className="grid gap-3">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_auto] md:items-end"
                >
                  <div className="grid gap-2">
                    <p className="font-medium">
                      {user.displayName}
                      {user.id === me?.id ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          （自分）
                        </span>
                      ) : null}
                      {user.isInitialAdmin ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          初期管理者
                        </span>
                      ) : user.canManageUsers ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ユーザー管理可
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-muted-foreground">{user.userId}</p>
                    <p className="text-sm text-muted-foreground">
                      {(user.modalities ?? []).map((item) => item.name).join("、") ||
                        "担当モダリティなし"}
                    </p>
                    {me?.isInitialAdmin && !user.isInitialAdmin && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={user.canManageUsers}
                          onChange={(event) =>
                            void handlePermission(user, event.target.checked)
                          }
                        />
                        ユーザーを管理する
                      </label>
                    )}
                    <ModalityPicker
                      modalities={modalities}
                      selectedIds={(user.modalities ?? []).map((item) => item.id)}
                      onChange={(ids) => void handleUserModalities(user, ids)}
                      idPrefix={`user-${user.id}-modality`}
                    />
                    {user.id !== me?.id && (
                      <MyInput
                        id={`reset-password-${user.id}`}
                        label="新しいパスワード（初期化）"
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        value={passwordEdits[user.id] ?? ""}
                        onChange={(event) =>
                          setPasswordEdits((prev) => ({
                            ...prev,
                            [user.id]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user.id !== me?.id && (
                      <MyButton onClick={() => void handleReset(user)}>
                        パスワード初期化
                      </MyButton>
                    )}
                    {user.id !== me?.id && !user.isInitialAdmin && (
                      <MyButton
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void handleDelete(user)}
                      >
                        削除
                      </MyButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {message && (
        <p className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message}
        </p>
      )}
    </div>
  );
}
