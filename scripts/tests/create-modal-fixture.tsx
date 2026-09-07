import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CreateItemProvider, CreateItemButton, createLabels } from "../../src/components/layout/create-item-provider";
import { useCreatedItemRefresh } from "../../src/components/ui/create-item-modal";
function App() {
  const [refreshes, setRefreshes] = useState(0);
  const refresh = async () => { setRefreshes(value => value + 1); };
  useCreatedItemRefresh("bookmark", refresh); useCreatedItemRefresh("note", refresh);
  useCreatedItemRefresh("code", refresh); useCreatedItemRefresh("file", refresh);
  useCreatedItemRefresh("photo", refresh); useCreatedItemRefresh("vocabulary", refresh);
  return <CreateItemProvider><main id="original-page"><h1>原功能清單</h1><p>清單更新次數：<span id="refreshes">{refreshes}</span></p>
    {Object.entries(createLabels).map(([kind,label]) => <CreateItemButton key={kind} kind={kind as keyof typeof createLabels}>{label}</CreateItemButton>)}
  </main></CreateItemProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
