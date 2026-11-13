import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
import { cn, formatDateTimeWithDay } from "@/lib/utils";
import { Card } from "@/components/react/card";
import { MyButton } from "@/components/react/my-button";
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
    <MyButton onClick={startCreate} className={className}>
      治療依頼オーダー
    </MyButton>
  );
}

export function TreatmentRequestList() {
  const { requests, canEdit, error, startEdit } = useTreatmentRequests();

  return (
    <div className="grid gap-2 content-start">
      <h2 className="text-2xl">治療依頼</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-gray-500">登録された治療依頼はありません。</p>
      ) : (
        <div className={cn("grid gap-4 content-start", "@lg:grid-cols-2")}>
          {requests.map((request) => (
            <Card key={request.id} className="grid gap-2 content-start">
              <div className="flex flex-wrap gap-2">
                <div>{formatDateTimeWithDay(request.requestDate)}</div>
                <div>
                  {request.slotTime}
                  {request.slotTime === "15:30" ? " 臨時" : ""}
                </div>
              </div>
              <div className="text-right">
                <div>{request.requestingDepartment}</div>
                <div>{request.requestingPhysician}</div>
              </div>
              {canEdit && (
                <div className="justify-self-end">
                  <MyButton onClick={() => startEdit(request)}>変更</MyButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
