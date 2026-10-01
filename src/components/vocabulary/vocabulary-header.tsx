"use client";

import { PageHeaderActions } from "@/components/layout/global-header-actions";
import styles from "./vocabulary-header.module.css";

export function VocabularyHeader({ onCreate }: { onCreate: () => void }) {
  return <header className={`vocabulary-header ${styles.header}`}>
    <div className={styles.copy}>
      <p className="eyebrow">VOCABULARY LEARNING</p>
      <div className={styles.row}>
        <h1>單字學習</h1>
        <PageHeaderActions><button className="button vocabulary-primary-action" onClick={onCreate} type="button">＋ 新增單字</button></PageHeaderActions>
      </div>
      <p>記錄、整理與間隔複習你的日文、英文及更多語言。</p>
    </div>
  </header>;
}
