// src/components/react/patient/list.tsx
//
// 患者一覧ページ。最近登録した患者を新しい順に表示する（すべての患者は「患者検索」で探す）。

import { useEffect, useState } from "react";
import { SearchIcon, UserPlusIcon, UsersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { invoke } from "@/lib/api";
import { onDataChanged } from "@/lib/live";
import type { Patient } from "@/types/patient";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

import { PatientRow, PatientRowSkeleton } from "./patient-row";

/** 一覧に出す件数 */
const RECENT_COUNT = 6;

export function PatientList() {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = async () => {
    try {
      // 登録日の新しい順に返ってくる
      const data = await invoke<Patient[]>("get_patients");
      setPatients(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(String(err));
    }
  };

  useEffect(() => {
    void fetchPatients();
    return onDataChanged(() => void fetchPatients());
  }, []);

  const recent = patients?.slice(0, RECENT_COUNT) ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="患者一覧"
        description={`最近登録した ${RECENT_COUNT} 人を新しい順に表示しています`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/patient/search/">
                <SearchIcon />
                患者検索
              </a>
            </Button>
            <Button asChild>
              <a href="/patient/register/">
                <UserPlusIcon />
                患者を登録
              </a>
            </Button>
          </>
        }
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          患者一覧を読み込めませんでした：{error}
        </p>
      ) : patients === null ? (
        <PatientListSkeleton />
      ) : patients.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>登録されている患者はいません</EmptyTitle>
            <EmptyDescription>
              「患者を登録」から最初の患者を登録してください。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild size="sm">
              <a href="/patient/register/">
                <UserPlusIcon />
                患者を登録
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <ul className="grid gap-3">
            {recent.map((patient) => (
              <li key={patient.id}>
                <PatientRow patient={patient} />
              </li>
            ))}
          </ul>
          {patients.length > RECENT_COUNT && (
            <p className="text-center text-sm text-muted-foreground">
              ほかに {patients.length - RECENT_COUNT} 人が登録されています。
              <Button asChild variant="link" size="sm" className="px-1">
                <a href="/patient/search/">患者検索で探す</a>
              </Button>
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}

function PatientListSkeleton() {
  return (
    <ul className="grid gap-3" aria-busy="true" aria-label="読み込み中">
      {[0, 1, 2, 3].map((i) => (
        <li key={i}>
          <PatientRowSkeleton />
        </li>
      ))}
    </ul>
  );
}
