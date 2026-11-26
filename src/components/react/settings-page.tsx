// 設定画面の施設名（担当者管理権限が必要）。バックアップの設定は backup-settings.tsx。
import { useEffect, useState } from "react";

import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
import { MyInput } from "@/components/react/my-input";
import { getFacilityName, saveFacilityName } from "@/lib/settings";

export function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getFacilityName()
      .then((value) => {
        setCurrent(value ?? "");
        setName(value ?? "");
      })
      .catch((error) => {
        setIsError(true);
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    try {
      const saved = await saveFacilityName(name);
      setCurrent(saved);
      setName(saved);
      setIsError(false);
      setMessage(`施設名を「${saved}」に変更しました`);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  const changed = name.trim() !== current;

  return (
    <Card>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">施設名</h2>
          <p className="text-sm text-muted-foreground">
            放射性医薬品使用記録簿・溶出記録などの帳票に印字されます。空欄にはできません。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <MyInput
            id="settings-facility-name"
            label="施設名"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <MyButton type="submit" disabled={pending || !changed || !name.trim()}>
            保存
          </MyButton>
        </div>
        {message && (
          <p
            className={
              isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"
            }
            role={isError ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </form>
    </Card>
  );
}
