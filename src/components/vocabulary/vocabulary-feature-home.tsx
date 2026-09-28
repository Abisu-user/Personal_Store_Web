"use client";

import { useState } from "react";
import { featureHomeStyles as styles } from "@/components/content/feature-home";
import { formatRelativeTime } from "@/lib/feature-home/time";
import type { VocabularyCard, VocabularyWorkspaceData } from "@/lib/vocabulary/types";

export function VocabularyFeatureHome({ data, loaded, dueCount, onReview, onOverview, onOpen, onCreate }: {
  data: VocabularyWorkspaceData; loaded: boolean; dueCount: number;
  onReview: () => void; onOverview: () => void; onOpen: (card: VocabularyCard) => void; onCreate: () => void;
}) {
  const [now] = useState(() => Date.now());
  const cards = data.cards.filter((card) => !card.deletedAt && !(card.sourceKind === "catalog" && card.learningStatus === "paused"));
  const untested = cards.filter((card) => card.totalAttempts === 0).length;
  const unfamiliar = cards.filter((card) => card.totalAttempts > 0 && card.currentLevel <= 1).length;
  const regular = cards.filter((card) => card.currentLevel >= 2 && card.currentLevel <= 3).length;
  const familiar = cards.filter((card) => card.currentLevel >= 4).length;
  const today = new Date().toLocaleDateString("sv-SE");
  const completedToday = data.reviewLogs.filter((log) => new Date(log.reviewedAt).toLocaleDateString("sv-SE") === today).length;
  const goal = Math.max(1, data.settings.dailyReviewGoal);
  const recent = [...cards].filter((card) => card.lastReviewedAt).sort((left, right) => Date.parse(right.lastReviewedAt!) - Date.parse(left.lastReviewedAt!)).slice(0, 5);
  const priority = [...cards].filter((card) => card.totalAttempts > 0 && (card.currentLevel <= 1 || card.nextReviewAt && Date.parse(card.nextReviewAt) <= now))
    .sort((left, right) => left.currentLevel - right.currentLevel || left.correctRate - right.correctRate).slice(0, 5);
  const weekLogs = data.reviewLogs.filter((log) => Date.parse(log.reviewedAt) >= now - 7 * 86400000);
  const weekCards = new Set(weekLogs.map((log) => log.cardId)).size;
  const weekAccuracy = weekLogs.length ? Math.round(weekLogs.filter((log) => log.answerResult).length / weekLogs.length * 100) : null;
  return <div className={styles.home}>
    <div aria-label="熟悉度摘要" className={styles.summary}>
      {loaded ? [
        ["尚未測驗", untested, "開始學習"], ["完全不熟", unfamiliar, "優先複習"], ["普通", regular, "持續加強"], ["熟悉", familiar, "穩定進步"],
      ].map(([label, value, description]) => <button className={styles.metric} key={label} onClick={onOverview} type="button"><span>{label}</span><strong>{value}</strong><small>{description}</small></button>) : Array.from({ length: 4 }, (_, index) => <div className={styles.skeleton} key={index} />)}
    </div>
    <section className={styles.studyCta}><div><h2>今日學習</h2><p>{dueCount ? `還有 ${dueCount} 個單字等待複習` : "今天沒有到期的複習；仍可開始新的練習。"}　{completedToday}／{goal} 已完成</p><div aria-label={`今日學習進度 ${Math.min(100, Math.round(completedToday / goal * 100))}%`} className={styles.progress} role="progressbar" aria-valuenow={Math.min(completedToday, goal)} aria-valuemin={0} aria-valuemax={goal}><i style={{ width: `${Math.min(100, completedToday / goal * 100)}%` }} /></div></div><button className="button" onClick={onReview} type="button">繼續學習</button></section>
    {!loaded ? <div className={styles.skeletonCards}>{Array.from({ length: 4 }, (_, index) => <div className={styles.skeleton} key={index} />)}</div> : !cards.length ? <div className={styles.emptyState}><strong>還沒有單字</strong><button className="button" onClick={onCreate} type="button">＋ 新增單字</button></div> : <div className={styles.bottom}>
      <section className={styles.panel}><header className={styles.heading}><div><h2>最近學習</h2><p>最近複習或測驗過的單字</p></div><button onClick={onOverview} type="button">單字總覽 ›</button></header><div className={styles.wordList}>{recent.length ? recent.map((card) => <button className={styles.wordRow} key={card.id} onClick={() => onOpen(card)} type="button"><span><strong>{card.word} <small>{card.reading || card.kana || ""}</small></strong><small>{card.primaryTranslation || "未填寫意思"}</small></span><em>{card.jlptLevel || card.cefrLevel || ""} · {formatRelativeTime(card.lastReviewedAt, now)}</em></button>) : <p className={styles.empty}>完成第一次複習後，最近學習會顯示在這裡。</p>}</div></section>
      <section className={styles.panel}><header className={styles.heading}><div><h2>優先複習</h2><p>不熟悉與到期的單字</p></div></header><div className={styles.wordList}>{priority.length ? priority.map((card) => <button className={styles.wordRow} key={card.id} onClick={() => onOpen(card)} type="button"><span><strong>{card.word}</strong><small>{card.primaryTranslation || "未填寫意思"}</small></span><em>{card.currentLevel <= 1 ? "完全不熟" : "待複習"} · {Math.round(card.correctRate)}%</em></button>) : <p className={styles.empty}>目前沒有需要優先複習的單字。</p>}</div></section>
    </div>}
    <section className={styles.panel}><header className={styles.heading}><div><h2>本週學習</h2><p>根據現有測驗紀錄統計</p></div></header><p>{weekLogs.length} 次練習 · {weekCards} 個單字 · {weekAccuracy === null ? "尚無正確率" : `平均正確率 ${weekAccuracy}%`}</p></section>
  </div>;
}
