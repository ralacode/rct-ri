// src/components/react/patient/search.tsx
//
// 患者検索ページ。患者ID・氏名（漢字・ふりがな）の一部で探す。入力が止まってから検索する。

import { useEffect, useRef, useState } from "react";
import { SearchIcon, SearchXIcon, UserPlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { invoke } from "@/lib/api";
import { onDataChanged } from "@/lib/live";
import type { Patient } from "@/types/patient";
import {
  PageContainer,
  PageHeader,
} from "@components/react/layout/page-header";

import { PatientRow, PatientRowSkeleton } from "./patient-row";

/** 入力が止まってから検索するまでの時間（ミリ秒） */
const DEBOUNCE_MS = 300;

async function searchPatients(keyword: string) {
  // 登録日の新しい順
  return invoke<Patient[]>("search_patients_cmd", {
    keyword,
    sortDesc: true,
  });
}

export function PatientSearch() {
  const [keyword, setKeyword] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;

  const trimmed = keyword.trim();

  useEffect(() => {
    if (!trimmed) {
      setPatients([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await searchPatients(trimmed);
        if (cancelled) return;
        setPatients(result);
        setError(null);
      } catch (err) {
        console.error("検索エラー:", err);
        if (!cancelled) setError("患者データの取得に失敗しました。");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  // ほかの端末で患者が増えたり変わったりしたら、同じ条件で探し直す
  useEffect(() => {
    return onDataChanged(() => {
      const current = keywordRef.current.trim();
      if (!current) return;
      void searchPatients(current)
        .then((result) => {
          if (current !== keywordRef.current.trim()) return;
          setPatients(result);
          setError(null);
        })
        .catch((err) => console.error("検索エラー:", err));
    });
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="患者検索"
        description="患者ID・氏名（漢字・ふりがな）の一部で探せます"
      />

      <InputGroup className="h-11">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          autoFocus
          type="text"
          enterKeyHint="search"
          aria-label="患者を検索"
          placeholder="例：0000000123、山田、やまだ"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="text-base"
        />
        {keyword && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="検索語を消す"
              onClick={() => {
                setKeyword("");
                inputRef.current?.focus();
              }}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!trimmed ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>検索する言葉を入力してください</EmptyTitle>
            <EmptyDescription>
              入力するとすぐに結果が出ます。氏名は一部だけでも探せます。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isLoading ? (
        <ul className="grid gap-3" aria-busy="true" aria-label="検索中">
          {[0, 1].map((i) => (
            <li key={i}>
              <PatientRowSkeleton />
            </li>
          ))}
        </ul>
      ) : patients.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>「{trimmed}」に当てはまる患者はいません</EmptyTitle>
            <EmptyDescription>
              別の言葉で探すか、新しく患者を登録してください。
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" variant="outline">
            <a href="/patient/register/">
              <UserPlusIcon />
              患者を登録
            </a>
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">
              {patients.length}
            </span>{" "}
            人見つかりました（登録日の新しい順）
          </p>
          <ul className="grid gap-3">
            {patients.map((patient) => (
              <li key={patient.id}>
                <PatientRow patient={patient} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
