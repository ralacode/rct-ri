// 担当者管理（担当者の追加・編集・権限・担当モダリティ、モダリティの管理）。
import { useEffect, useState } from "react";
import {
  CheckIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ModalityPicker } from "@/components/react/auth/modality-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { RADIATION_THERAPY_CODE, RI_CODE } from "@/lib/permissions";
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
  setFeedbackPermission,
  setManagePermission,
  setUserModalities,
  updateUser,
  type AuthUser,
  type Modality,
} from "@/lib/auth";
import { normalizeForSearch } from "@/lib/sidebar-menu";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";
import { Section } from "@components/react/patient/section";

type ProfileEdit = {
  userId: string;
  lastName: string;
  firstName: string;
};

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [passwordEdits, setPasswordEdits] = useState<Record<number, string>>(
    {},
  );
  const [profileEdits, setProfileEdits] = useState<Record<number, ProfileEdit>>(
    {},
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);
  const [deletingModality, setDeletingModality] = useState<Modality | null>(
    null,
  );

  // 氏名・ユーザーID・担当モダリティ名で絞り込む（全角/半角・かな/カナの違いは無視）
  const normalizedQuery = normalizeForSearch(searchQuery);
  const filteredUsers = normalizedQuery
    ? users.filter((user) =>
        [
          user.displayName,
          `${user.lastName}${user.firstName}`,
          user.userId,
          ...(user.modalities ?? []).map((item) => item.name),
        ].some((text) => normalizeForSearch(text).includes(normalizedQuery)),
      )
    : users;

  const editingUser = users.find((user) => user.id === editingId) ?? null;

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
    setProfileEdits(
      Object.fromEntries(
        nextUsers.map((user) => [
          user.id,
          {
            userId: user.userId,
            lastName: user.lastName,
            firstName: user.firstName,
          },
        ]),
      ),
    );
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
      setLoadError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  // 結果は通知で知らせる
  const showMessage = (text: string, error = false) => {
    if (error) toast.error(text);
    else toast.success(text);
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
      setCreating(false);
      showMessage("担当者を追加しました");
    } catch (error) {
      setUserId(nextUserId);
      showMessage(error instanceof Error ? error.message : String(error), true);
    } finally {
      setPending(false);
    }
  };

  const handleUpdateProfile = async (user: AuthUser) => {
    const edit = profileEdits[user.id];
    if (!edit) return;
    try {
      await updateUser(user.id, edit);
      await load();
      setEditingId(null);
      showMessage("担当者情報を更新しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const handleDelete = async (user: AuthUser) => {
    if (user.id === me?.id) {
      showMessage(
        "自分自身は削除できません。他の担当者に依頼してください。",
        true,
      );
      return;
    }
    if (user.isInitialAdmin) {
      showMessage("初期管理者は削除できません", true);
      return;
    }
    try {
      await deleteUser(user.id);
      setEditingId(null);
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
      showMessage(
        "パスワードを初期化しました。新しいパスワードを本人に伝えてください。",
      );
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

  const handleFeedbackPermission = async (
    user: AuthUser,
    canAnswerFeedback: boolean,
  ) => {
    try {
      await setFeedbackPermission(user.id, canAnswerFeedback);
      await load();
      showMessage(
        canAnswerFeedback
          ? `${user.displayName} が質問・要望に回答できるようにしました`
          : `${user.displayName} の回答権限を外しました`,
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
    try {
      await deleteModality(modality.id);
      await load();
      showMessage("モダリティを削除しました");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  };

  const setProfile = (user: AuthUser, patch: Partial<ProfileEdit>) =>
    setProfileEdits((prev) => ({
      ...prev,
      [user.id]: {
        userId: prev[user.id]?.userId ?? user.userId,
        lastName: prev[user.id]?.lastName ?? user.lastName,
        firstName: prev[user.id]?.firstName ?? user.firstName,
        ...patch,
      },
    }));

  const openEdit = (user: AuthUser) => {
    // 編集を始めるときは、いまの値に戻してから開く
    setProfileEdits((prev) => ({
      ...prev,
      [user.id]: {
        userId: user.userId,
        lastName: user.lastName,
        firstName: user.firstName,
      },
    }));
    setPasswordEdits((prev) => ({ ...prev, [user.id]: "" }));
    setEditingId(user.id);
  };

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="担当者管理"
        description="アプリを使う担当者と、それぞれが使えるページ（担当モダリティ）・権限を管理します"
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlusIcon />
            担当者を追加
          </Button>
        }
      />

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      <Section title="登録済みの担当者" count={users.length}>
        {users.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="w-full sm:w-80">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="staff-search"
                type="text"
                enterKeyHint="search"
                aria-label="担当者を検索"
                placeholder="氏名・ユーザーID・モダリティで検索"
                autoComplete="off"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </InputGroup>
            {normalizedQuery && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {filteredUsers.length} 件 / 全 {users.length} 件
              </span>
            )}
          </div>
        )}
        {users.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            担当者がいません。
          </p>
        ) : filteredUsers.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            該当する担当者がいません。
          </p>
        ) : (
          <ul className="grid gap-3">
            {filteredUsers.map((user) => (
              <li key={user.id}>
                <Card className="flex-row items-center gap-4 px-4 py-3">
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{user.displayName}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {user.userId}
                      </span>
                      {user.id === me?.id && (
                        <Badge variant="secondary">自分</Badge>
                      )}
                      {user.isInitialAdmin ? (
                        <Badge>初期管理者</Badge>
                      ) : user.canManageUsers ? (
                        <Badge variant="outline">ユーザー管理</Badge>
                      ) : null}
                      {user.canAnswerFeedback && (
                        <Badge variant="outline">質問・要望に回答</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(user.modalities ?? []).length === 0 ? (
                        <span className="text-xs text-destructive">
                          担当モダリティがありません
                        </span>
                      ) : (
                        user.modalities.map((item) => (
                          <Badge
                            key={item.id}
                            variant="secondary"
                            className="font-normal"
                          >
                            {item.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(user)}
                  >
                    <PencilIcon />
                    編集
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {me?.isInitialAdmin && (
        <Section
          title="モダリティ"
          count={modalities.length}
          description="担当者に割り当てる区分です。初期管理者だけが変更できます。"
        >
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {modalities.map((modality) => {
                const locked =
                  modality.isDefault ||
                  modality.code === RADIATION_THERAPY_CODE ||
                  modality.code === RI_CODE;
                const value = renameEdits[modality.id] ?? modality.name;
                const changed = value.trim() !== modality.name;
                return (
                  <li key={modality.id} className="grid gap-1 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Input
                        id={`rename-modality-${modality.id}`}
                        aria-label={`${modality.name} の名前`}
                        className="h-8 max-w-xs"
                        value={value}
                        onChange={(event) =>
                          setRenameEdits((prev) => ({
                            ...prev,
                            [modality.id]: event.target.value,
                          }))
                        }
                      />
                      {locked && (
                        <Badge variant="outline" className="font-normal">
                          削除不可
                        </Badge>
                      )}
                      <div className="ml-auto flex gap-1">
                        {changed && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleRename(modality)}
                          >
                            <CheckIcon />
                            名前を変更
                          </Button>
                        )}
                        {!locked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${modality.name} を削除`}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingModality(modality)}
                          >
                            <Trash2Icon />
                          </Button>
                        )}
                      </div>
                    </div>
                    {modality.code === RADIATION_THERAPY_CODE && (
                      <p className="text-xs text-muted-foreground">
                        治療依頼表・患者のページを使えるようになり、治療依頼の作成・変更もできます。表示名を変えても、この権限は残ります。
                      </p>
                    )}
                    {modality.code === RI_CODE && (
                      <p className="text-xs text-muted-foreground">
                        検査一覧・減衰計算・溶出記録・作業内容記録・患者のページを使えるようになります。表示名を変えても、この権限は残ります。
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <form
              className="flex gap-2 border-t px-4 py-3"
              onSubmit={handleAddModality}
            >
              <Input
                id="new-modality-name"
                aria-label="新しいモダリティ"
                placeholder="新しいモダリティ"
                className="max-w-xs"
                value={newModalityName}
                onChange={(event) => setNewModalityName(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!newModalityName.trim()}
              >
                <PlusIcon />
                追加
              </Button>
            </form>
          </Card>
        </Section>
      )}

      {/* 担当者を追加 */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <form
            className="grid gap-5"
            autoComplete="off"
            onSubmit={handleCreate}
          >
            <DialogHeader>
              <DialogTitle>担当者を追加</DialogTitle>
              <DialogDescription>
                初期パスワードは本人に伝え、ログイン後に変更してもらってください。
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-staff-id">ユーザーID</FieldLabel>
                  <Input
                    id="new-staff-id"
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
                <Field>
                  <FieldLabel htmlFor="new-password">初期パスワード</FieldLabel>
                  <Input
                    id="new-password"
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
                  <FieldLabel htmlFor="new-last-name">姓</FieldLabel>
                  <Input
                    id="new-last-name"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-first-name">名</FieldLabel>
                  <Input
                    id="new-first-name"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </Field>
              </div>
              <ModalityPicker
                modalities={modalities}
                selectedIds={modalityIds}
                onChange={setModalityIds}
                idPrefix="new-user-modality"
              />
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  キャンセル
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "追加中…" : "追加する"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 担当者の編集 */}
      <Dialog
        open={editingUser !== null}
        onOpenChange={(open) => !open && setEditingId(null)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          {editingUser && (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{editingUser.displayName} さんを編集</DialogTitle>
                <DialogDescription>
                  担当モダリティと権限は、選ぶとすぐに反映されます。
                </DialogDescription>
              </DialogHeader>

              <form
                className="grid gap-4"
                autoComplete="off"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleUpdateProfile(editingUser);
                }}
              >
                <Field>
                  <FieldLabel htmlFor={`edit-staff-id-${editingUser.id}`}>
                    ユーザーID
                  </FieldLabel>
                  <Input
                    id={`edit-staff-id-${editingUser.id}`}
                    name="rct-no-store"
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={8}
                    className="tabular-nums sm:w-48"
                    value={
                      profileEdits[editingUser.id]?.userId ?? editingUser.userId
                    }
                    onChange={(event) =>
                      setProfile(editingUser, { userId: event.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`edit-last-name-${editingUser.id}`}>
                      姓
                    </FieldLabel>
                    <Input
                      id={`edit-last-name-${editingUser.id}`}
                      required
                      autoComplete="off"
                      value={
                        profileEdits[editingUser.id]?.lastName ??
                        editingUser.lastName
                      }
                      onChange={(event) =>
                        setProfile(editingUser, {
                          lastName: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`edit-first-name-${editingUser.id}`}>
                      名
                    </FieldLabel>
                    <Input
                      id={`edit-first-name-${editingUser.id}`}
                      required
                      autoComplete="off"
                      value={
                        profileEdits[editingUser.id]?.firstName ??
                        editingUser.firstName
                      }
                      onChange={(event) =>
                        setProfile(editingUser, {
                          firstName: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <Button type="submit" className="justify-self-end">
                  氏名・ユーザーIDを保存
                </Button>
              </form>

              <FieldSeparator />

              <ModalityPicker
                modalities={modalities}
                selectedIds={(editingUser.modalities ?? []).map(
                  (item) => item.id,
                )}
                onChange={(ids) => void handleUserModalities(editingUser, ids)}
                idPrefix={`user-${editingUser.id}-modality`}
              />

              <FieldSet className="gap-3">
                <FieldLegend variant="label" className="mb-0">
                  権限
                </FieldLegend>
                {me?.isInitialAdmin && !editingUser.isInitialAdmin && (
                  <Field orientation="horizontal">
                    <Checkbox
                      id={`perm-manage-${editingUser.id}`}
                      checked={editingUser.canManageUsers}
                      onCheckedChange={(checked) =>
                        void handlePermission(editingUser, checked === true)
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`perm-manage-${editingUser.id}`}>
                        ユーザーを管理する
                      </FieldLabel>
                      <FieldDescription>
                        担当者管理・依頼科と依頼医・設定のページを使えます
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )}
                <Field orientation="horizontal">
                  <Checkbox
                    id={`perm-feedback-${editingUser.id}`}
                    checked={editingUser.canAnswerFeedback}
                    onCheckedChange={(checked) =>
                      void handleFeedbackPermission(
                        editingUser,
                        checked === true,
                      )
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={`perm-feedback-${editingUser.id}`}>
                      質問・要望に回答する
                    </FieldLabel>
                  </FieldContent>
                </Field>
              </FieldSet>

              {editingUser.id !== me?.id && (
                <>
                  <FieldSeparator />
                  <Field>
                    <FieldLabel htmlFor={`reset-password-${editingUser.id}`}>
                      パスワードの初期化
                    </FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id={`reset-password-${editingUser.id}`}
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="新しいパスワード（8 文字以上）"
                        value={passwordEdits[editingUser.id] ?? ""}
                        onChange={(event) =>
                          setPasswordEdits((prev) => ({
                            ...prev,
                            [editingUser.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleReset(editingUser)}
                      >
                        <KeyRoundIcon />
                        初期化
                      </Button>
                    </div>
                    <FieldDescription>
                      新しいパスワードは本人に伝えてください。
                    </FieldDescription>
                  </Field>
                </>
              )}

              <DialogFooter className="sm:justify-between">
                {editingUser.id !== me?.id && !editingUser.isInitialAdmin ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeletingUser(editingUser)}
                  >
                    <Trash2Icon />
                    この担当者を削除
                  </Button>
                ) : (
                  <span />
                )}
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    閉じる
                  </Button>
                </DialogClose>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingUser !== null || deletingModality !== null}
        onOpenChange={(open) => {
          if (open) return;
          setDeletingUser(null);
          setDeletingModality(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingUser
                ? `${deletingUser.displayName} さんを削除しますか？`
                : `${deletingModality?.name} を削除しますか？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              削除すると元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deletingUser) void handleDelete(deletingUser);
                if (deletingModality)
                  void handleDeleteModality(deletingModality);
                setDeletingUser(null);
                setDeletingModality(null);
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
