// 設定画面の施設名（担当者管理権限が必要）。バックアップの設定は backup-settings.tsx。
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BackupSettings } from "@/components/react/backup-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getFacilityName, saveFacilityName } from "@/lib/settings";
import { errorMessage } from "@/lib/utils";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

export function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getFacilityName()
      .then((value) => {
        setCurrent(value ?? "");
        setName(value ?? "");
      })
      .catch((err) => setError(errorMessage(err, "読み込みに失敗しました")));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await saveFacilityName(name);
      setCurrent(saved);
      setName(saved);
      setError(null);
      toast.success(`施設名を「${saved}」に変更しました`);
    } catch (err) {
      setError(errorMessage(err, "保存に失敗しました"));
    } finally {
      setPending(false);
    }
  };

  const changed = name.trim() !== current;

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="設定" description="アプリ全体の設定です" />
      <Card>
        <form onSubmit={handleSubmit} className="grid gap-6">
          <CardHeader>
            <CardTitle>施設名</CardTitle>
            <CardDescription>
              放射性医薬品使用記録簿・溶出記録などの帳票に印字されます。空欄にはできません。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="settings-facility-name">施設名</FieldLabel>
              <Input
                id="settings-facility-name"
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {error && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t">
            <Button
              type="submit"
              disabled={pending || !changed || !name.trim()}
            >
              {pending ? "保存中…" : "保存する"}
            </Button>
          </CardFooter>
        </form>
      </Card>
      <BackupSettings />
    </PageContainer>
  );
}
