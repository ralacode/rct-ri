import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { format } from "date-fns";
import { fetchMe } from "@/lib/auth";
import { onDataChanged } from "@/lib/live";
import {
  canEditTreatment,
  createTreatmentRequest,
  deleteTreatmentRequest,
  listPatientTreatmentRequests,
  updateTreatmentRequest,
  type TreatmentRequest,
} from "@/lib/treatment";
import { CalendarDaysIcon, PencilIcon, PlusIcon } from "lucide-react";
import { formatDateTimeWithDay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/react/patient/section";
import {
  TreatmentRequestDialog,
  type TreatmentRequestDraft,
} from "@/components/react/treatment/request-dialog";

type TreatmentRequestActions = {
  requests: TreatmentRequest[];
  canEdit: boolean;
  error: string | null;
  startCreate: () => void;
  startEdit: (request: TreatmentRequest) => void;
};

const TreatmentRequestContext = createContext<TreatmentRequestActions | null>(
  null,
);

function useTreatmentRequests() {
  const value = useContext(TreatmentRequestContext);
  if (!value) {
    throw new Error("治療依頼の表示位置が正しくありません");
  }
  return value;
}

export function TreatmentRequestProvider({
  patientDbId,
  children,
}: {
  patientDbId: number;
  children: ReactNode;
}) {
  const [requests, setRequests] = useState<TreatmentRequest[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TreatmentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [rows, me] = await Promise.all([
        listPatientTreatmentRequests(patientDbId),
        fetchMe(),
      ]);
      setRequests(rows);
      setCanEdit(canEditTreatment(me));
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => {
    void load();
    return onDataChanged(() => {
      void load();
    });
  }, [patientDbId]);

  const saveNew = async (input: TreatmentRequestDraft) => {
    await createTreatmentRequest(patientDbId, input);
    await load();
  };

  const saveExisting = async (input: TreatmentRequestDraft) => {
    if (!editing) return;
    await updateTreatmentRequest(editing.id, input);
    await load();
  };

  const remove = async () => {
    if (!editing) return;
    await deleteTreatmentRequest(editing.id);
    await load();
  };

  return (
    <TreatmentRequestContext.Provider
      value={{
        requests,
        canEdit,
        error,
        startCreate: () => setCreating(true),
        startEdit: setEditing,
      }}
    >
      {children}
      <TreatmentRequestDialog
        open={creating}
        title="治療依頼オーダー"
        idPrefix="treatment-request-new"
        onOpenChange={setCreating}
        onSubmit={saveNew}
      />
      <TreatmentRequestDialog
        open={editing !== null}
        title="治療依頼の変更"
        idPrefix="treatment-request-edit"
        initial={
          editing
            ? {
                requestDate: editing.requestDate,
                slotTime: editing.slotTime,
                requestingDepartment: editing.requestingDepartment,
                requestingPhysician: editing.requestingPhysician,
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={saveExisting}
        onDelete={remove}
      />
    </TreatmentRequestContext.Provider>
  );
}

export function TreatmentRequestOrderButton({
  className,
}: {
  className?: string;
}) {
  const { canEdit, startCreate } = useTreatmentRequests();
  if (!canEdit) return null;
  return (
    <Button variant="outline" onClick={startCreate} className={className}>
      <PlusIcon />
      治療依頼オーダー
    </Button>
  );
}

/**
 * 治療依頼表のリンク先。今日以降でいちばん近い依頼の月を開く。
 * 今日以降の依頼がなければ、いちばん新しい依頼の月を開く。
 */
function treatmentBoardHref(requests: TreatmentRequest[]): string {
  const today = format(new Date(), "yyyy-MM-dd");
  const dates = requests.map((request) => request.requestDate.slice(0, 10));
  const upcoming = dates.filter((date) => date >= today).sort()[0];
  const target = upcoming ?? [...dates].sort().at(-1);
  return target ? `/treatment/?month=${target.slice(0, 7)}` : "/treatment/";
}

export function TreatmentRequestList() {
  const { requests, canEdit, error, startEdit } = useTreatmentRequests();

  return (
    <Section
      title="治療依頼"
      count={requests.length}
      actions={
        requests.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <a href={treatmentBoardHref(requests)}>
              <CalendarDaysIcon />
              治療依頼表
            </a>
          </Button>
        )
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          登録された治療依頼はありません。
        </p>
      ) : (
        <ul className="grid gap-3">
          {requests.map((request) => (
            <li key={request.id}>
              <Card className="flex-row items-center gap-4 px-4 py-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
                    {formatDateTimeWithDay(request.requestDate)}
                    <span>{request.slotTime}</span>
                    {request.slotTime === "15:30" && (
                      <Badge variant="secondary">臨時</Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {request.requestingDepartment}
                    {request.requestingPhysician &&
                      `・${request.requestingPhysician}`}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(request)}
                  >
                    <PencilIcon />
                    変更
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
