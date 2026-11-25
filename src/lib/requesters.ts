// 依頼科・依頼医の一覧（入力候補）。
// 一覧にない名前は、オーダー・治療依頼を保存したときにサーバー側で自動登録される。
import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { onDataChanged } from "@/lib/live";

export type RequesterKind = "departments" | "physicians";

export type Requester = {
  id: number;
  name: string;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
};

export const REQUESTER_LABELS: Record<RequesterKind, string> = {
  departments: "依頼科",
  physicians: "依頼医",
};

export function listRequesters(kind: RequesterKind): Promise<Requester[]> {
  return apiRequest<Requester[]>(`/${kind}`);
}

export function createRequester(
  kind: RequesterKind,
  name: string,
): Promise<Requester> {
  return apiRequest<Requester>(`/${kind}`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function renameRequester(
  kind: RequesterKind,
  id: number,
  name: string,
): Promise<void> {
  await apiRequest<void>(`/${kind}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function deleteRequester(
  kind: RequesterKind,
  id: number,
): Promise<void> {
  await apiRequest<void>(`/${kind}/${id}`, { method: "DELETE" });
}

/** 依頼科・依頼医の入力候補（よく使う順）。他の端末で増えたときも読み直す。 */
export function useRequesterOptions() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [physicians, setPhysicians] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      void Promise.all([
        listRequesters("departments"),
        listRequesters("physicians"),
      ])
        .then(([nextDepartments, nextPhysicians]) => {
          if (!active) return;
          setDepartments(nextDepartments.map((item) => item.name));
          setPhysicians(nextPhysicians.map((item) => item.name));
        })
        .catch(() => {
          // 候補が取れなくても入力はできるので、黙って空のままにする。
        });
    };
    load();
    const stop = onDataChanged(load);
    return () => {
      active = false;
      stop();
    };
  }, []);

  return { departments, physicians };
}
