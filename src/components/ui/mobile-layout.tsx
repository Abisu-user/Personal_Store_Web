import type { ReactNode } from "react";

export function MobilePageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return <header className="mobile-page-header"><div className="mobile-page-header-copy">{eyebrow ? <p className="mobile-page-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>{actions ? <div className="mobile-page-header-actions">{actions}</div> : null}</header>;
}

export function MobileSection({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`mobile-section ${className}`.trim()}><header><h2>{title}</h2>{action}</header>{children}</section>;
}
