// アプリ全体の設定（施設名）。施設名は必須で、登録されるまでアプリは使えない。
import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { onDataChanged } from "@/lib/live";

type FacilityNameResponse = { name: string | null };

export async function getFacilityName(): Promise<string | null> {
  const response = await apiRequest<FacilityNameResponse>(
    "/settings/facility-name",
  );
  return response.name;
}

/** 施設名を保存し、保存した名前（空白をそろえたもの）を返す。担当者管理権限が必要。 */
export async function saveFacilityName(name: string): Promise<string> {
  const response = await apiRequest<FacilityNameResponse>(
    "/settings/facility-name",
    {
      method: "PUT",
      body: JSON.stringify({ name }),
    },
  );
  return response.name ?? "";
}

/** 帳票に印字する施設名。設定画面で変わったときも読み直す。 */
export function useFacilityName() {
  const [name, setName] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => {
      void getFacilityName()
        .then((next) => {
          if (active) setName(next ?? "");
        })
        .catch(() => {
          // 取れなかったときは空欄のままにする。
        });
    };
    load();
    const stop = onDataChanged(load);
    return () => {
      active = false;
      stop();
    };
  }, []);

  return name;
}

// ---- DB の自動バックアップ（担当者管理権限が必要） ----

export type BackupEntry = { name: string; at: string };

export type BackupStatus = {
  /** バックアップ先のフォルダ。未設定なら null（自動バックアップしない）。 */
  dir: string | null;
  /** バックアップを取る時刻（例："9:00"） */
  times: string[];
  /** 残すバックアップの数 */
  keep: number;
  nextAt: string | null;
  lastAt: string | null;
  lastOk: boolean | null;
  lastMessage: string | null;
  /** バックアップ先を開けたか（外付け HDD が外れていると false） */
  dirAvailable: boolean;
  /** バックアップ先にあるバックアップ（新しい順） */
  backups: BackupEntry[];
};

export function getBackupStatus(): Promise<BackupStatus> {
  return apiRequest<BackupStatus>("/settings/backup");
}

/** バックアップ先を保存する。空欄なら自動バックアップを止める。 */
export function saveBackupDir(dir: string): Promise<BackupStatus> {
  return apiRequest<BackupStatus>("/settings/backup/dir", {
    method: "PUT",
    body: JSON.stringify({ dir }),
  });
}

export function runBackupNow(): Promise<BackupStatus> {
  return apiRequest<BackupStatus>("/settings/backup/run", { method: "POST" });
}
