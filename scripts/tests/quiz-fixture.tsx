import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { VocabularyWorkspace } from "../../src/components/vocabulary/vocabulary-workspace";
import { BookmarksWorkspace } from "../../src/components/bookmarks/bookmarks-workspace";
import { FilesWorkspace } from "../../src/components/files/files-workspace";
import { PhotosWorkspace } from "../../src/components/photos/photos-workspace";
import { clearClientResources } from "../../src/lib/pwa/client-resource-cache";
import { ambiguousHints, drawQuizCards, eligibleStudyCards, firstKana, persistQuizSession } from "../../src/lib/vocabulary/quiz-session";
import { adaptiveQuestionWeight } from "../../src/lib/vocabulary/review";

const cards = Array.from({ length: 30 }, (_, i) => ({
  id: String(i), word: i === 0 ? "収める" : i === 1 ? "収納する" : `単語${i}`,
  reading: i === 0 ? "おさめる" : i === 1 ? "しゅうのうする" : `たんご${i}`, kana: null,
  language: "ja", primaryTranslation: i < 2 ? "收納、收藏" : `意思${i}`,
  meanings: [], examples: [], tags: [], deckIds: [], learningStatus: "learning",
  currentLevel: 0, masteryLevel: 0, totalAttempts: 0, correctCount: 0, wrongCount: 0,
  recentResults: [], reviewCount: 0, consecutiveCorrect: 0, consecutiveWrong: 0,
  currentIntervalDays: 0, jlptLevel: "N3", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}));
const data = { cards, decks: [], tags: [], reviewLogs: [], settings: { dailyNewGoal: 5, dailyReviewGoal: 20, flashcardPreferences: {} } };
// Test-only hooks; this fixture is never imported into the application.
Object.assign(window, { testData: data, quizHelpers: { ambiguousHints, drawQuizCards, eligibleStudyCards, firstKana, persistQuizSession, adaptiveQuestionWeight } });
const empty = { folders: [], categories: [], items: [], files: [], photos: [], bookmarks: [], tags: [] };
function App() {
  const [page, setPage] = useState("quiz");
  return <><nav id="test-nav">{["quiz", "away", "bookmark", "file", "photo"].map((p) => <button key={p} onClick={() => setPage(p)}>{p}</button>)}<button onClick={() => { clearClientResources(); location.reload(); }}>reset</button></nav><div className="app-main">{page === "quiz" ? <VocabularyWorkspace /> : page === "away" ? <h1>其他功能</h1> : <main className="dashboard"><section className="dashboard-card">{page === "bookmark" ? <BookmarksWorkspace createMode initialData={empty as never} /> : page === "file" ? <FilesWorkspace createMode initialData={empty as never} /> : <PhotosWorkspace createMode initialData={empty as never} />}</section></main>}</div></>;
}
createRoot(document.getElementById("root")!).render(<App />);
