import { Button } from "@/components/ui/button";
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
  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id));
      return;
    }
    onChange([...selectedIds, id]);
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modalities.map((modality) => {
          const selected = selectedIds.includes(modality.id);
          return (
            <Button
              key={modality.id}
              id={`${idPrefix}-${modality.id}`}
              type="button"
              size="lg"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              className="h-11 w-full px-4"
              onClick={() => toggle(modality.id)}
            >
              {modality.name}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
