"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ModalDialog } from "./modal-dialog";
import { ConfirmDialog } from "./confirm-dialog";

type CreateFlow = { close: () => void; complete: () => void; setPending: (pending: boolean) => void; footer: HTMLDivElement | null };
const CreateFlowContext = createContext<CreateFlow | null>(null);
export const useCreateFlow = () => useContext(CreateFlowContext);
type CreateItemModalProps = { title: string; open: boolean; onClose: () => void; onSaved?: () => void; pending?: boolean; className?: string; children: ReactNode };
export function CreateItemModal(props: CreateItemModalProps) {
  return props.open ? <CreateItemModalBody {...props} /> : null;
}
function CreateItemModalBody({ title, open, onClose, onSaved = onClose, children, className = "", pending: externalPending = false }: CreateItemModalProps) {
  const [formPending, setPending] = useState(false);
  const pending = externalPending || formPending;
  const [confirm, setConfirm] = useState(false);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const dirty = useRef(false);
  const close = () => { if (!pending && !confirm) { if (dirty.current) setConfirm(true); else onClose(); } };
  return <CreateFlowContext.Provider value={{ close, complete: onSaved, setPending, footer }}>
    <ModalDialog className={`create-item-dialog ${className}`} eyebrow="CREATE PRIVATE ITEM" title={title} open={open} onClose={close} pending={pending || confirm} footer={<div className="create-item-footer" ref={setFooter} />}>
      <div className="create-item-fields" onInputCapture={() => { dirty.current = true; }} onChangeCapture={() => { dirty.current = true; }}>{children}</div>
    </ModalDialog>
    <ConfirmDialog open={confirm} title="放棄尚未儲存的內容？" description="關閉後，本次填寫但尚未儲存的內容將不會保留。" confirmLabel="放棄並關閉" onCancel={() => setConfirm(false)} onConfirm={onClose} />
  </CreateFlowContext.Provider>;
}
export function useCreatedItemRefresh(kind: string, load: () => Promise<void>) {
  useEffect(() => {
    const refresh = (event: Event) => { if ((event as CustomEvent).detail === kind) void load().catch(() => window.dispatchEvent(new CustomEvent("personal-vault:create-refresh-error"))); };
    window.addEventListener("personal-vault:item-created", refresh);
    return () => window.removeEventListener("personal-vault:item-created", refresh);
  }, [kind, load]);
}
