// src/components/react/patient/detail.tsx
//
// 患者詳細ページ。患者情報・治療依頼・検査オーダーをまとめて表示する。
// 表示する患者は URL の ?id=<患者ID> で決まる。

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ClipboardListIcon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { invoke } from "@/lib/api";
import { onDataChanged } from "@/lib/live";
import { go } from "@/lib/nav";
import {
  calculateAge,
  formatDateString,
  formatDateTimeWithDay,
  toKatakana,
} from "@/lib/utils";
import type { ExamOrder } from "@/types/exam_order";
import type { Patient } from "@/types/patient";
import { DeleteOrderDialog } from "@components/react/exam_order/delete-order-dialog";
import { ExamOrderDialog } from "@components/react/exam_order/exam-order-dialog";
import { PageContainer } from "@components/react/layout/page-header";
import {
  TreatmentRequestList,
  TreatmentRequestOrderButton,
  TreatmentRequestProvider,
} from "@components/react/treatment/patient-requests";

import { PatientEditDialog } from "./patient-edit-dialog";
import { PatientOrderCard } from "./patient-order-card";
import { Section } from "./section";

function getPatientIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id");
}

/** 患者IDが変わったとき、再読み込みしても同じ患者を開けるよう URL を書き換える */
function replacePatientIdInUrl(patientId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("id", patientId);
  window.history.replaceState(window.history.state, "", url);
}

export function PatientDetail() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [orders, setOrders] = useState<ExamOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [isDeletingPatient, setIsDeletingPatient] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ExamOrder | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<ExamOrder | null>(null);

  // 患者情報の編集中は、ほかの端末の更新で読み直さない
  const isEditingRef = useRef(false);
  isEditingRef.current = isEditingPatient;

  const loadAllData = async (patientId: string) => {
    try {
      const patients = await invoke<Patient[]>("search_patients_cmd", {
        keyword: patientId,
        sortDesc: false,
      });
      const found = patients?.[0];
      if (!found) {
        setError(`患者ID「${patientId}」の患者が見つかりませんでした。`);
        return;
      }
      setPatient(found);
      setError(null);
      try {
        const rows = await invoke<ExamOrder[]>("get_exam_orders", {
          patientDbId: found.id,
        });
        setOrders(rows ?? []);
      } catch (e) {
        console.error("検査履歴の取得失敗:", e);
        setOrders([]);
      }
    } catch (err) {
      console.error("Invoke Error:", err);
      setError("データベースに接続できませんでした。");
    }
  };

  const reload = () => {
    const id = getPatientIdFromUrl();
    if (id) void loadAllData(id);
  };

  useEffect(() => {
    const id = getPatientIdFromUrl();
    if (id) void loadAllData(id);
    else setError("患者IDが指定されていません。");

    return onDataChanged(() => {
      if (!isEditingRef.current) reload();
    });
  }, []);

  if (error) {
    return (
      <PageContainer>
        <BackLink />
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserXIcon />
            </EmptyMedia>
            <EmptyTitle>患者を表示できません</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PageContainer>
    );
  }

  if (!patient) return <PatientDetailSkeleton />;

  const age = calculateAge(patient.birth_date);

  return (
    <TreatmentRequestProvider patientDbId={patient.id}>
      <PageContainer>
        <div className="grid gap-3">
          <BackLink />
          <header className="flex flex-col gap-4 @lg:flex-row @lg:items-end @lg:justify-between">
            <div className="grid gap-1">
              <p className="text-sm text-muted-foreground">
                {toKatakana(patient.last_name_kana)}{" "}
                {toKatakana(patient.first_name_kana)}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {patient.last_name_kanji} {patient.first_name_kanji}
                <span className="ml-3 text-base font-normal text-muted-foreground">
                  {age !== null ? `${age}歳` : "年齢不明"}・{patient.gender}
                </span>
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setIsCreatingOrder(true)}>
                <PlusIcon />
                検査オーダーを登録
              </Button>
              <TreatmentRequestOrderButton />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="患者のその他の操作"
                  >
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setIsEditingPatient(true)}>
                    <PencilIcon />
                    患者情報を編集
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setIsDeletingPatient(true)}
                  >
                    <Trash2Icon />
                    患者を削除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
        </div>

        <PatientInfoCard
          patient={patient}
          onEdit={() => setIsEditingPatient(true)}
        />

        <TreatmentRequestList />

        <Section
          title="検査オーダー"
          count={orders?.length}
          description="新しい日付から順に表示しています"
        >
          {orders === null ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : orders.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon />
                </EmptyMedia>
                <EmptyTitle>検査オーダーはありません</EmptyTitle>
                <EmptyDescription>
                  「検査オーダーを登録」から追加できます。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid gap-3">
              {orders.map((order) => (
                <li key={order.id}>
                  <PatientOrderCard
                    order={order}
                    weight={patient.weight}
                    onEdit={setEditingOrder}
                    onDelete={setDeletingOrder}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </PageContainer>

      <ExamOrderDialog
        open={isCreatingOrder || editingOrder !== null}
        onOpenChange={(open) => {
          if (open) return;
          setIsCreatingOrder(false);
          setEditingOrder(null);
        }}
        order={editingOrder}
        patientDbId={patient.id}
        weight={patient.weight}
        onSaved={reload}
      />
      <DeleteOrderDialog
        order={deletingOrder}
        onOpenChange={(open) => !open && setDeletingOrder(null)}
        onDeleted={reload}
      />
      <PatientEditDialog
        patient={patient}
        open={isEditingPatient}
        onOpenChange={setIsEditingPatient}
        onSaved={(patientId) => {
          replacePatientIdInUrl(patientId);
          void loadAllData(patientId);
        }}
      />
      <DeletePatientDialog
        patient={patient}
        open={isDeletingPatient}
        onOpenChange={setIsDeletingPatient}
      />
    </TreatmentRequestProvider>
  );
}

function BackLink() {
  return (
    <Button
      asChild
      variant="link"
      size="sm"
      className="justify-self-start px-0 text-muted-foreground"
    >
      <a href="/patient/list/">
        <ChevronLeftIcon />
        患者一覧
      </a>
    </Button>
  );
}

function formatBody(value: number | null, unit: string): string | null {
  if (value === null || value === undefined) return null;
  return `${Number(value).toFixed(1)} ${unit}`;
}

function PatientInfoCard({
  patient,
  onEdit,
}: {
  patient: Patient;
  onEdit: () => void;
}) {
  const items: { label: string; value: string | null }[] = [
    { label: "患者ID", value: patient.patient_id },
    { label: "生年月日", value: formatDateString(patient.birth_date) },
    { label: "身長", value: formatBody(patient.height, "cm") },
    { label: "体重", value: formatBody(patient.weight, "kg") },
    { label: "登録日", value: formatDateTimeWithDay(patient.created_at) },
    {
      label: "更新日",
      value:
        patient.updated_at !== patient.created_at
          ? formatDateTimeWithDay(patient.updated_at)
          : null,
    },
  ];

  return (
    <Card className="@container/info gap-0 py-0">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">患者情報</h2>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <PencilIcon />
          編集
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 @xl/info:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-sm tabular-nums">
              {item.value ?? (
                <span className="text-muted-foreground">未登録</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function DeletePatientDialog({
  patient,
  open,
  onOpenChange,
}: {
  patient: Patient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // 削除が終わるまで閉じない
    setIsDeleting(true);
    try {
      await invoke("remove_patient", { id: patient.id });
      toast.success("患者を削除しました", {
        description: `${patient.last_name_kanji} ${patient.first_name_kanji} 様（ID ${patient.patient_id}）`,
      });
      go("/patient/list/");
    } catch (err) {
      console.error("削除エラー:", err);
      toast.error("患者の削除に失敗しました");
      setIsDeleting(false);
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>この患者を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            {patient.last_name_kanji} {patient.first_name_kanji} 様（ID{" "}
            {patient.patient_id}）
            <br />
            この患者の検査オーダーと治療依頼もすべて削除され、元に戻せません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            キャンセル
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? "削除中…" : "削除する"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PatientDetailSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-20" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </PageContainer>
  );
}
