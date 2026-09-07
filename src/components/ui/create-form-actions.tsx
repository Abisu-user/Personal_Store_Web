"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useCreateFlow } from "./create-item-modal";

export function CreateFormActions({ pending, returnHref = "/", label, pendingLabel, onSave, onCancel }: { pending: boolean; returnHref?: string; label: string; pendingLabel: string; onSave?: () => void; onCancel?: () => void }) {
  const router = useRouter();
  const flow = useCreateFlow();
  const marker = useRef<HTMLSpanElement>(null);
  const formId = useId();
  useEffect(() => { const form = marker.current?.closest("form"); if (form && flow) form.id = formId; }, [flow, formId]);
  const setPending = flow?.setPending;
  useEffect(() => { setPending?.(pending); }, [pending, setPending]);
  const actions = <div className="create-form-actions"><button className="secondary-button" disabled={pending} onClick={() => flow ? flow.close() : onCancel ? onCancel() : router.push(returnHref)} type="button">取消</button><button className="button" disabled={pending} form={flow && !onSave ? formId : undefined} onClick={onSave} type={onSave ? "button" : "submit"}>{pending ? pendingLabel : label}</button></div>;
  return <><span hidden ref={marker} />{flow?.footer ? createPortal(actions, flow.footer) : actions}</>;
}
