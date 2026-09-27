export type VaultFieldType = "text" | "password";

export type VaultField = {
  id: string;
  label: string;
  value: string;
  type: VaultFieldType;
  order: number;
};

export type VaultPayload = {
  label: string;
  notes: string;
  fields: VaultField[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function newVaultField(type: VaultFieldType, order: number, label?: string): VaultField {
  return {
    id: crypto.randomUUID(),
    label: label ?? (type === "password" ? "密碼" : "帳號"),
    value: "",
    type,
    order,
  };
}

export function defaultVaultFields(): VaultField[] {
  return [newVaultField("text", 0), newVaultField("password", 1)];
}

/** Legacy username/secret lived inside the same AES-GCM ciphertext, not in DB columns. */
export function normalizeVaultPayload(value: unknown): VaultPayload {
  if (!isRecord(value)) throw new Error("保管項目內容格式無效。");
  const label = typeof value.label === "string" ? value.label : "";
  const notes = typeof value.notes === "string" ? value.notes : "";
  if (Array.isArray(value.fields)) {
    const seen = new Set<string>();
    const fields = value.fields.map((field, index): VaultField | null => {
      if (!isRecord(field)) return null;
      const id = typeof field.id === "string" && field.id ? field.id : `legacy-field-${index}`;
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        label: typeof field.label === "string" && field.label.trim() ? field.label : "自訂欄位",
        value: typeof field.value === "string" ? field.value : "",
        type: field.type === "text" ? "text" : "password",
        order: typeof field.order === "number" && Number.isFinite(field.order) ? field.order : index,
      };
    }).filter((field): field is VaultField => field !== null);
    return { label, notes, fields: fields.sort((a, b) => a.order - b.order) };
  }
  return {
    label,
    notes,
    fields: [
      { id: "legacy-account", label: "帳號", value: typeof value.username === "string" ? value.username : "", type: "text", order: 0 },
      { id: "legacy-secret", label: "密碼", value: typeof value.secret === "string" ? value.secret : "", type: "password", order: 1 },
    ],
  };
}

export function serializeVaultPayload(label: string, notes: string, fields: VaultField[]): VaultPayload {
  return {
    label: label.trim(),
    notes: notes.trim(),
    fields: fields.map((field, index) => ({
      id: field.id,
      label: field.label.trim() || "自訂欄位",
      value: field.value,
      type: field.type,
      order: index,
    })),
  };
}
