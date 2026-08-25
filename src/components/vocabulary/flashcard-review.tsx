"use client";
import { useState } from "react";
import type { ReviewRating, VocabularyCard } from "@/lib/vocabulary/types";

const labels: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: "again", label: "完全不會", className: "danger" }, { rating: "difficult", label: "困難", className: "secondary" }, { rating: "good", label: "普通", className: "button" }, { rating: "easy", label: "簡單", className: "success" }, { rating: "mastered", label: "已掌握", className: "mastered" },
];
export function FlashcardReview({ cards, onReview, pending }: { cards: VocabularyCard[]; onReview: (card: VocabularyCard, rating: ReviewRating) => Promise<void>; pending: boolean }) {
  const [index, setIndex] = useState(0); const [flipped, setFlipped] = useState(false);
  const card = cards[Math.min(index, Math.max(cards.length - 1, 0))];
  if (!card) return <div className="vocabulary-empty"><strong>今天沒有待複習的單字</strong><p>新增單字後，系統會在這裡安排間隔複習。</p></div>;
  async function rate(rating: ReviewRating) { await onReview(card, rating); setFlipped(false); setIndex((current) => Math.min(current + 1, Math.max(cards.length - 1, 0))); }
  return <section className="flashcard-session"><div className="flashcard-progress"><span>今日複習</span><strong>{Math.min(index + 1, cards.length)} / {cards.length}</strong></div><button aria-label="翻轉單字卡" className={`flashcard${flipped ? " flipped" : ""}`} onClick={() => setFlipped((value) => !value)} type="button"><span className="flashcard-front"><small>{card.language.toUpperCase()}</small><strong>{card.word}</strong><em>{card.reading || card.romaji || "點擊顯示答案"}</em></span><span className="flashcard-back"><small>{card.partOfSpeech || "Vocabulary"}</small><strong>{card.primaryTranslation || card.meanings.map((meaning) => meaning.meaning).join("、") || "尚未填寫意思"}</strong><em>{card.examples[0]?.sentence || card.notes || "沒有補充內容"}</em></span></button>{flipped ? <div className="review-ratings">{labels.map((item) => <button className={item.className} disabled={pending} key={item.rating} onClick={() => void rate(item.rating)} type="button">{item.label}</button>)}</div> : <button className="button flashcard-reveal" onClick={() => setFlipped(true)} type="button">顯示答案</button>}</section>;
}
