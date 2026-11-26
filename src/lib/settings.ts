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
