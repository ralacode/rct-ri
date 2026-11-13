import { useEffect, useState } from "react";
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
import { formatDateTimeWithDay } from "@/lib/utils";
import { MyButton } from "@/components/react/my-button";
import {
  TreatmentRequestDialog,
  type TreatmentRequestDraft,
} from "@/components/react/treatment/request-dialog";

export function TreatmentRequestSection({
  patientDbId,
}: {
  patientDbId: number;
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
    <div className="mt-4 grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium">治療依頼</h3>
        {canEdit && (
          <MyButton onClick={() => setCreating(true)}>
            治療依頼オーダー
          </MyButton>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-sm text-gray-500">
          登録された治療依頼はありません。
        </p>
      ) : (
        <div className="grid gap-2">
          {requests.map((request) => (
            <div
              key={request.id}
              className="grid gap-2 rounded-md border bg-sky-50 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {formatDateTimeWithDay(request.requestDate)}{" "}
                  {request.slotTime}
                  {request.slotTime === "15:30" ? " 臨時" : ""}
                </div>
                {canEdit && (
                  <MyButton onClick={() => setEditing(request)}>変更</MyButton>
                )}
              </div>
              <div className="text-right text-sm">
                <div>{request.requestingDepartment}</div>
                <div>{request.requestingPhysician}</div>
              </div>
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
