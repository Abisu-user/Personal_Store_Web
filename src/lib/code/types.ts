export type CodeCategory = { id: string; name: string; sort_order: number };
export type CodeTag = { id: string; name: string; color: string | null };

export type CodeSnippet = {
  id: string;
  title: string;
  description: string | null;
  language: string;
  sourceCode: string;
  category: Pick<CodeCategory, "id" | "name"> | null;
  tags: CodeTag[];
  updatedAt: string;
};

export type CodeWorkspaceData = { snippets: CodeSnippet[]; categories: CodeCategory[]; tags: CodeTag[] };
