import React, { useState } from "react";
import { createRoot } from "react-dom/client";

import { AnimeHorizontalScroller } from "../../src/components/anime/anime-horizontal-scroller";

function Fixture() {
  const [clicks, setClicks] = useState(0);
  return (
    <main style={{ padding: 16 }}>
      <p data-testid="clicks">{clicks}</p>
      <AnimeHorizontalScroller aria-label="動漫測試輪播" className="anime-rail" role="region">
        {Array.from({ length: 10 }, (_, index) => (
          <button
            className="anime-catalogue-card"
            key={index}
            onClick={() => setClicks((value) => value + 1)}
            style={{ height: 180 }}
            type="button"
          >
            動漫 {index + 1}
          </button>
        ))}
      </AnimeHorizontalScroller>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
