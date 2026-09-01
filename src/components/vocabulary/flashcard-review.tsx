"use client";
import { useState } from "react";
import type { ReviewRating, VocabularyCard } from "@/lib/vocabulary/types";

const labels: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: "again", label: "完全不會", className: "danger" }, { rating: "difficult", label: "困難", className: "secondary" }, { rating: "good", label: "普通", className: "button" }, { rating: "easy", label: "簡單", className: "success" }, { rating: "mastered", label: "已掌握", className: "mastered" },
];
export type LocalReview = { cardId: string; rating: ReviewRating; answerResult?: boolean };

export function FlashcardReview({ cards, direction, onComplete, pending }: { cards: VocabularyCard[]; direction: "native" | "reverse"; onComplete: (reviews: LocalReview[]) => Promise<void>; pending: boolean }) {
  const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false); const [exampleMode, setExampleMode] = useState(false); const [reviews, setReviews] = useState<LocalReview[]>([]);
  const card = cards[index];
  if (!cards.length) return <div className="vocabulary-empty"><strong>目前沒有可複習的單字</strong><p>先將單字加入學習中，再開始一輪複習。</p></div>;
  if (!card) return <section className="flashcard-session"><div className="vocabulary-empty"><strong>已完成 {reviews.length} 個單字</strong><p>熟練度會在你按下儲存後一次更新，不會逐題寫入。</p><button className="button" disabled={pending} onClick={() => void onComplete(reviews)} type="button">{pending ? "儲存中…" : "儲存本次複習"}</button></div></section>;
  const example = card.examples[0]; const reverse = direction === "reverse" && card.language === "ja"; const meaning = card.primaryTranslation || card.meanings.map((item) => item.meaning).join("、") || "尚未填寫意思";
  function rate(rating: ReviewRating) { setReviews((current) => [...current, { cardId: card.id, rating }]); setFlipped(false); setIndex((current) => current + 1); }
  return <section className="flashcard-session"><div className="flashcard-progress"><span>{reverse ? "中文 → 日文複習" : "日文 → 中文複習"}</span><strong>{index + 1} / {cards.length}</strong></div><button className="secondary-button compact" disabled={!example} onClick={() => { setExampleMode((value) => !value); setFlipped(false); }} type="button">{exampleMode ? "一般模式" : "例句模式"}</button><button aria-label="翻轉單字卡" className={`flashcard${flipped ? " flipped" : ""}`} onClick={() => setFlipped((value) => !value)} type="button"><span className="flashcard-front"><small>{exampleMode ? "從例句猜單字" : reverse ? "中文意思" : card.language.toUpperCase()}</small><strong>{exampleMode && example ? example.sentence.replace(card.word, "＿＿＿") : reverse ? meaning : card.word}</strong><em>{exampleMode ? "點擊顯示答案" : reverse ? "點擊顯示日文答案" : card.reading || card.romaji || "點擊顯示答案"}</em></span><span className="flashcard-back"><small>{exampleMode ? example?.translationZhTw || example?.translation || "例句翻譯" : card.partOfSpeech || "Vocabulary"}</small><strong>{exampleMode ? card.word : reverse ? card.word : meaning}</strong><em>{exampleMode ? meaning : reverse ? card.reading || card.kana || "未設定讀音" : example?.sentence || card.notes || "沒有補充內容"}</em></span></button>{flipped ? <div className="review-ratings">{labels.map((item) => <button className={item.className} key={item.rating} onClick={() => rate(item.rating)} type="button">{item.label}</button>)}</div> : <button className="button flashcard-reveal" onClick={() => setFlipped(true)} type="button">顯示答案</button>}</section>;
}
