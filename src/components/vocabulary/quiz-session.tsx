"use client";

import { useEffect, useRef, useState } from "react";
import type { LocalReview } from "./flashcard-review";
import { hiragana, persistQuizSession, quizMeaning, rememberQuizProgress, type QuizProgress, type StudySession } from "@/lib/vocabulary/quiz-session";

export function VocabularyQuizSession({ session, onComplete, onHome, onContinue, onRestart, onPhase }: {
  session: StudySession; onComplete: (reviews: LocalReview[]) => Promise<void>;
  onHome: () => void; onContinue: () => void; onRestart: () => void; onPhase: () => void;
}) {
  const [progress, setProgress] = useState<QuizProgress>(() => session.progress || { index: 0, answer: "", checked: null, skipped: false, results: [], startedAt: Date.now(), saveState: "idle", saveError: "" });
  const progressRef = useRef(progress);
  const completeRef = useRef(onComplete);
  const phaseRef = useRef(onPhase);
  useEffect(() => { completeRef.current = onComplete; phaseRef.current = onPhase; }, [onComplete, onPhase]);
  function update(patch: Partial<QuizProgress>) {
    const next = { ...progressRef.current, ...patch };
    progressRef.current = next;
    rememberQuizProgress(session, next);
    setProgress(next);
  }
  const { index, answer, checked, skipped, results, startedAt, saveState, saveError } = progress;
  const card = session.cards[index];
  useEffect(() => {
    if (index < session.cards.length || results.length !== session.cards.length || saveState === "saved" || saveState === "error") return;
    let active = true;
    // One promise per session survives unmounts, so returning while saving
    // attaches to the same request instead of submitting the answers twice.
    if (!session.progress) rememberQuizProgress(session, progressRef.current);
    const reviews = results.map((item) => ({ cardId: item.card.id, answerResult: item.correct, durationMs: item.durationMs, occurrenceIndex: item.occurrenceIndex, mode: "quiz" as const }));
    const saving = persistQuizSession(session, () => completeRef.current(reviews));
    phaseRef.current();
    void saving.then(() => {
      if (active) { progressRef.current = session.progress!; setProgress(session.progress!); phaseRef.current(); }
    });
    return () => { active = false; };
  }, [index, results, saveState, session]);

  const normalize = (value: string) => hiragana(value).replace(/[\s・\-]/g, "").toLowerCase();
  const native = session.direction === "native";
  const correctAnswer = card ? native ? quizMeaning(card) : `${card.word}${card.reading || card.kana ? `（${card.reading || card.kana}）` : ""}` : "";
  function submit() {
    if (!card || checked !== null) return;
    const accepted = native ? [quizMeaning(card), ...card.meanings.map((meaning) => meaning.meaning)].flatMap((value) => [value, ...value.split(/[、，,；;]/)]) : [card.word, card.reading || "", card.kana || ""];
    update({ skipped: false, checked: accepted.map(normalize).filter(Boolean).includes(normalize(answer)) });
  }
  function next() {
    if (!card || checked === null) return;
    update({ results: [...results, { card, answer, correct: checked, durationMs: Date.now() - startedAt, occurrenceIndex: index + 1 }], index: index + 1, answer: "", checked: null, skipped: false, startedAt: Date.now() });
  }
  if (!card) {
    if (saveState !== "saved") return <section aria-live="polite" className="vocabulary-quiz vocabulary-quiz-saving"><h2>{saveState === "error" ? "測驗結果尚未儲存" : "正在儲存測驗結果"}</h2><p>{saveState === "error" ? saveError : "正在更新答題紀錄與熟練度…"}</p>{saveState === "error" ? <button className="button" onClick={() => update({ saveState: "idle", saveError: "" })} type="button">重試儲存</button> : <div className="vocabulary-quiz-save-progress"><i aria-hidden="true" /><span>儲存資料中…</span></div>}</section>;
    const correctCount = results.filter((item) => item.correct).length;
    return <section className="vocabulary-quiz vocabulary-quiz-results"><header><p className="eyebrow">QUIZ RESULT</p><h2>測驗結果</h2><p>共 {results.length} 題 · <b className="quiz-correct">答對 {correctCount} 題</b> · <b className="quiz-wrong">答錯 {results.length - correctCount} 題</b> · 正確率 {Math.round(correctCount / Math.max(1, results.length) * 100)}%</p><p>作答時間：{Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / 1000)} 秒</p></header><p className="notice success">已儲存本次測驗結果，熟練度已更新。</p><div className="vocabulary-quiz-result-list">{results.map((item, i) => <article className={item.correct ? "correct" : "wrong"} key={item.card.id}><div><strong>{i + 1}. {item.card.word}</strong><span>{item.card.reading || item.card.kana || ""} · {quizMeaning(item.card)}</span><span>你的答案：{item.answer || "跳過"}</span></div><b>{item.correct ? "答對" : "答錯"}</b></article>)}</div><footer className="quiz-result-actions"><button className="secondary-button" onClick={onHome} type="button">回到首頁</button><button className="secondary-button" onClick={onRestart} type="button">重新設定</button><button className="button" onClick={onContinue} type="button">繼續</button></footer></section>;
  }
  return <section className="vocabulary-quiz"><header><p className="eyebrow">QUIZ</p><span>{index + 1} ／ {session.cards.length}</span></header><div className="vocabulary-quiz-card"><p>{native ? "請寫出這個單字的中文意思。" : `根據提示寫出正確的${card.language === "ja" ? "日文" : "英文"}單字。`}</p><h2>{native ? card.word : quizMeaning(card)}</h2>{!native && session.hints[card.id] && <p className="quiz-kana-hint">第一個假名：<strong>{session.hints[card.id]}</strong></p>}<label>你的答案<input aria-label="你的答案" autoComplete="off" disabled={checked !== null} onChange={(event) => update({ answer: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && answer.trim()) submit(); }} value={answer} /></label>{checked === null ? <><button className="button" disabled={!answer.trim()} onClick={submit} type="button">確認答案</button><button className="secondary-button compact" onClick={() => update({ skipped: true, checked: false })} type="button">不會，跳過這個單字</button></> : <><p className={`notice ${checked ? "success" : "error"}`} role="status">{checked ? "答對了！" : `${skipped ? "已跳過。" : "答錯了。"}正確答案是「${correctAnswer}」。`}</p><button className="button" onClick={next} type="button">下一題</button></>}</div></section>;
}
