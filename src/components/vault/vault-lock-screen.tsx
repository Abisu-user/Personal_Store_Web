"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import { AppIcon } from "@/components/ui/app-icon";

import styles from "./vault-lock-screen.module.css";

export type VaultAnimationState =
  | "locked"
  | "verifying"
  | "error"
  | "unlocking"
  | "opening"
  | "entering"
  | "unlocked"
  | "locking"
  | "closing";

export type VaultRect = { top: number; left: number; width: number; height: number };

export type VaultTransition = {
  mode: "expand" | "contract";
  from: VaultRect;
  to: VaultRect;
  active: boolean;
  fading?: boolean;
};

type VaultLockScreenProps = {
  creating: boolean;
  error: string | null;
  interiorRef: RefObject<HTMLDivElement | null>;
  onInput: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  phase: VaultAnimationState;
};

function VaultHandle() {
  return <span aria-hidden="true" className={styles.handle}>
    <i className={styles.handleRing} />
    <i className={`${styles.handleSpoke} ${styles.handleSpokeTop}`} />
    <i className={`${styles.handleSpoke} ${styles.handleSpokeRight}`} />
    <i className={`${styles.handleSpoke} ${styles.handleSpokeBottom}`} />
    <i className={`${styles.handleSpoke} ${styles.handleSpokeLeft}`} />
    <i className={styles.handleHub} />
  </span>;
}

function VaultBolts() {
  return <span aria-hidden="true" className={styles.bolts}>
    <i /><i /><i />
  </span>;
}

function VaultInterior({ interiorRef }: { interiorRef: RefObject<HTMLDivElement | null> }) {
  return <div className={styles.interior} ref={interiorRef}>
    <span className={styles.interiorGlow} />
    <span className={styles.interiorLock}><AppIcon name="lock" /></span>
    <strong>PRIVATE VAULT</strong>
    <small>安全空間已就緒</small>
  </div>;
}

function VaultDoor() {
  return <div className={styles.door}>
    <span aria-hidden="true" className={styles.doorInset} />
    <span aria-hidden="true" className={styles.doorRivets}>{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</span>
    <span aria-hidden="true" className={styles.brandPlate}><i>PS</i><b>PERSONAL STORE</b><small>ZERO-KNOWLEDGE SECURITY</small></span>
    <VaultHandle />
    <VaultBolts />
    <span aria-hidden="true" className={styles.alarmGlow} />
    <span aria-hidden="true" className={styles.lasers}><i /><i /><i /><b /></span>
  </div>;
}

function VaultSafe({ interiorRef, phase }: { interiorRef: RefObject<HTMLDivElement | null>; phase: VaultAnimationState }) {
  return <div className={styles.safeStage}>
    <div aria-label="數位保險箱" className={styles.safe} data-phase={phase}>
      <span aria-hidden="true" className={styles.safeDepth} />
      <VaultInterior interiorRef={interiorRef} />
      <VaultDoor />
    </div>
  </div>;
}

const VAULT_STATUS: Record<VaultAnimationState, { label: string; detail: string }> = {
  locked: { label: "LOCKED", detail: "等待安全驗證" },
  verifying: { label: "VERIFYING", detail: "正在驗證 Vault 密碼" },
  error: { label: "SECURITY ALERT", detail: "驗證失敗，請重新輸入" },
  unlocking: { label: "UNLOCKING", detail: "正在解除機械鎖" },
  opening: { label: "UNLOCKING", detail: "正在開啟安全空間" },
  entering: { label: "UNLOCKED", detail: "正在進入私密空間" },
  unlocked: { label: "UNLOCKED", detail: "私密空間已安全解鎖" },
  locking: { label: "LOCKING", detail: "正在安全鎖定" },
  closing: { label: "LOCKING", detail: "正在關閉機械鎖" },
};

function VaultStatus({ phase }: { phase: VaultAnimationState }) {
  const status = VAULT_STATUS[phase];
  return <div className={styles.statusRow} data-status={phase} role="status">
    <span className={styles.statusDot} aria-hidden="true" />
    <span><strong>{status.label}</strong><small>{status.detail}</small></span>
  </div>;
}

export function VaultLockScreen({ creating, error, interiorRef, onInput, onSubmit, pending, phase }: VaultLockScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const previousPhase = useRef<VaultAnimationState>(phase);
  const transitioning = ["unlocking", "opening", "entering", "locking", "closing"].includes(phase);

  useEffect(() => {
    if (phase === "locked" && previousPhase.current === "error") {
      if (passwordRef.current) passwordRef.current.value = "";
      passwordRef.current?.focus({ preventScroll: true });
    }
    previousPhase.current = phase;
  }, [phase]);

  function submit(event: FormEvent<HTMLFormElement>) {
    passwordRef.current?.blur();
    onSubmit(event);
  }

  return <section className={`${styles.lockScreen} vault-lock-screen`} data-phase={phase}>
    <div className={styles.lockPanel}>
      <section className={styles.visualColumn}>
        <header className={styles.header}>
          <span className={styles.headerIcon}><AppIcon name="lock" /></span>
          <div>
            <p>PERSONAL STORE · PRIVATE VAULT</p>
            <h2>{creating ? "建立你的私密保管庫" : "私密保管庫"}</h2>
            <span>{creating ? "設定一組只有你知道的完整密碼，建立零知識加密空間。" : "輸入 Vault 密碼，開啟只在這台裝置記憶體中存在的解鎖金鑰。"}</span>
          </div>
        </header>

        <VaultSafe interiorRef={interiorRef} phase={phase} />
        <VaultStatus phase={phase} />
      </section>

      <form aria-busy={pending || transitioning} className={styles.authCard} onSubmit={submit}>
        <div className={styles.consoleHeading}>
          <span className={styles.consoleIcon}><AppIcon name="security" /></span>
          <div>
            <p>SECURITY CONSOLE</p>
            <h3>{creating ? "建立安全金鑰" : "安全身分驗證"}</h3>
            <span>{creating ? "建立後，敏感內容只會在你的瀏覽器中解密。" : "通過驗證後才會在本機記憶體建立暫時金鑰。"}</span>
          </div>
        </div>

        <div className={styles.authHeading}>
          <div><strong>{creating ? "建立 Vault 密碼" : phase === "verifying" ? "正在驗證…" : "Vault 密碼"}</strong><span>{creating ? "至少 11 個字元，支援英文、數字與符號。" : "輸入完整密碼以解除保險庫鎖定。"}</span></div>
          <span className={styles.securityBadge}><AppIcon name="security" /> AES-256</span>
        </div>

        {error && <p className={styles.errorMessage} role="alert">{error}</p>}

        <label className={styles.passwordField}>
          <span>Vault 密碼</span>
          <span className={styles.passwordControl}>
            <input
              autoComplete={creating ? "new-password" : "current-password"}
              disabled={pending || transitioning}
              minLength={creating ? 11 : undefined}
              name="password"
              onInput={onInput}
              ref={passwordRef}
              required
              type={showPassword ? "text" : "password"}
            />
            <button aria-label={showPassword ? "隱藏密碼" : "顯示密碼"} onClick={() => setShowPassword((current) => !current)} type="button">{showPassword ? "隱藏" : "顯示"}</button>
          </span>
        </label>

        {creating && <label className={styles.passwordField}>
          <span>再次輸入 Vault 密碼</span>
          <span className={styles.passwordControl}>
            <input autoComplete="new-password" disabled={pending || transitioning} minLength={11} name="confirmation" onInput={onInput} required type={showPassword ? "text" : "password"} />
          </span>
        </label>}

        <button className={styles.unlockButton} disabled={pending || transitioning || phase === "error"} type="submit">
          <AppIcon name="lock" />
          <span>{phase === "verifying" ? "正在驗證…" : transitioning ? "正在開啟安全空間…" : creating ? "建立加密保管庫" : "解鎖私密保管庫"}</span>
        </button>
        <p className={styles.zeroKnowledge}>密碼與解密後內容不會傳送到伺服器。</p>

        <div className={styles.securityRule} />
        <div className={styles.securityList} aria-label="保管庫安全資訊">
          <div><span><AppIcon name="security" /></span><p><strong>AES-256-GCM 瀏覽器端加密</strong><small>敏感內容只在目前裝置解密。</small></p></div>
          <div><span><AppIcon name="lock" /></span><p><strong>10 分鐘閒置自動鎖定</strong><small>鎖定時立即清除解密後的金鑰。</small></p></div>
          <div><span><AppIcon name="database" /></span><p><strong>零知識資料保護</strong><small>伺服器不會取得你的 Vault 密碼。</small></p></div>
        </div>
      </form>
    </div>
  </section>;
}

export function VaultTransitionOverlay({ transition }: { transition: VaultTransition | null }) {
  if (!transition || typeof document === "undefined") return null;
  const { from, to } = transition;
  const scaleX = from.width / Math.max(to.width, 1);
  const scaleY = from.height / Math.max(to.height, 1);
  const initialTransform = `translate3d(${from.left - to.left}px, ${from.top - to.top}px, 0) scale(${scaleX}, ${scaleY})`;
  const style = {
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    transform: transition.active ? "translate3d(0, 0, 0) scale(1)" : initialTransform,
  } satisfies CSSProperties;

  return createPortal(<div
    aria-hidden="true"
    className={`${styles.transitionOverlay} ${styles[transition.mode]}${transition.fading ? ` ${styles.fading}` : ""}`}
    data-active={transition.active ? "true" : "false"}
    style={style}
  >
    <span className={styles.transitionMark}><AppIcon name="lock" /><strong>PRIVATE VAULT</strong><small>{transition.mode === "expand" ? "安全解鎖" : "正在安全鎖定"}</small></span>
  </div>, document.body);
}
