import { apiRequest } from "@/lib/api";

export const RADIATION_THERAPY_CODE = "radiation_therapy";
export const DAY_CLOSURE = "day";

export const WEEKDAYS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 7, label: "日" },
] as const;

export const TREATMENT_SLOTS = [
  { value: "13:30", label: "13:30" },
  { value: "14:30", label: "14:30" },
  { value: "15:30", label: "15:30（臨時）" },
] as const;

export type TreatmentRequest = {
  id: number;
  patientDbId: number;
  patientId: string;
  lastNameKanji: string;
  firstNameKanji: string;
  lastNameKana: string;
  firstNameKana: string;
  requestDate: string;
  slotTime: string;
  requestingDepartment: string;
  requestingPhysician: string;
};

export type SlotClosure = {
  id: number;
  closureDate: string;
  slotTime: string;
};

export type DayRemark = {
  remarkDate: string;
  body: string;
};

export type TreatmentBoard = {
  month: string;
  openWeekdays: number[];
  slots: string[];
  canEdit: boolean;
  requests: TreatmentRequest[];
  closures: SlotClosure[];
  remarks: DayRemark[];
};

export type TreatmentRequestInput = {
  requestDate: string;
  slotTime: string;
  requestingDepartment: string;
  requestingPhysician: string;
};

export function canEditTreatment(
  user: { modalities: { code: string | null }[] } | null,
) {
  return !!user?.modalities.some(
    (modality) => modality.code === RADIATION_THERAPY_CODE,
  );
}

export function weekdayLabel(value: number) {
  return WEEKDAYS.find((day) => day.value === value)?.label ?? "";
}

function query(params: Record<string, string>) {
  const search = new URLSearchParams(params);
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export function getTreatmentBoard(month: string) {
  return apiRequest<TreatmentBoard>(`/treatment-board${query({ month })}`);
}

export function getTreatmentSchedule() {
  return apiRequest<{ openWeekdays: number[] }>("/treatment-schedule");
}

export function saveTreatmentSchedule(openWeekdays: number[]) {
  return apiRequest<{ openWeekdays: number[] }>("/treatment-schedule", {
    method: "PUT",
    body: JSON.stringify({ openWeekdays }),
  });
}

export function listPatientTreatmentRequests(patientDbId: number) {
  return apiRequest<TreatmentRequest[]>(
    `/patients/${patientDbId}/treatment-requests`,
  );
}

export function createTreatmentRequest(
  patientDbId: number,
  input: TreatmentRequestInput,
) {
  return apiRequest<void>(`/patients/${patientDbId}/treatment-requests`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTreatmentRequest(
  id: number,
  input: TreatmentRequestInput,
) {
  return apiRequest<void>(`/treatment-requests/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteTreatmentRequest(id: number) {
  return apiRequest<void>(`/treatment-requests/${id}`, { method: "DELETE" });
}

export function listTreatmentClosures(date: string) {
  return apiRequest<SlotClosure[]>(`/treatment-closures${query({ date })}`);
}

export function closureMessages(
  closures: Pick<SlotClosure, "slotTime">[],
): string[] {
  const dayClosed = closures.some(
    (closure) => closure.slotTime === DAY_CLOSURE,
  );
  const closed = new Set(
    closures
      .map((closure) => closure.slotTime)
      .filter((slot) => slot !== DAY_CLOSURE),
  );
  const messages: string[] = [];
  if (dayClosed) messages.push("この日は休診です");
  for (const slot of TREATMENT_SLOTS) {
    if (dayClosed || closed.has(slot.value)) {
      messages.push(`${slot.value}は閉じています`);
    }
  }
  return messages;
}

export function closeTreatmentSlot(closureDate: string, slotTime: string) {
  return apiRequest<void>("/treatment-closures", {
    method: "POST",
    body: JSON.stringify({ closureDate, slotTime }),
  });
}

export function openTreatmentSlot(id: number) {
  return apiRequest<void>(`/treatment-closures/${id}`, { method: "DELETE" });
}

export function saveTreatmentRemark(date: string, body: string) {
  return apiRequest<void>(`/treatment-remarks/${date}`, {
    method: "PUT",
    body: JSON.stringify({ body }),
  });
}
