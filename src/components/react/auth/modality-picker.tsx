import type { Modality } from "@/lib/auth";

export function ModalityPicker({
  modalities,
  selectedIds,
  onChange,
  idPrefix = "modality",
}: {
  modalities: Modality[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  idPrefix?: string;
}) {
  const toggle = (id: number, checked: boolean) => {
    if (checked) {
      onChange(selectedIds.includes(id) ? selectedIds : [...selectedIds, id]);
      return;
    }
    onChange(selectedIds.filter((value) => value !== id));
  };

  if (modalities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        モダリティがまだありません。
      </p>
    );
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">
        担当モダリティ
        <span className="ml-1 text-destructive">*</span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {modalities.map((modality) => (
          <label key={modality.id} className="flex items-center gap-2 text-sm">
            <input
              id={`${idPrefix}-${modality.id}`}
              type="checkbox"
              checked={selectedIds.includes(modality.id)}
              onChange={(event) => toggle(modality.id, event.target.checked)}
            />
            {modality.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
