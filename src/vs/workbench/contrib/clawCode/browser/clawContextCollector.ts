// Context collector for Claw Code browser integration (P2)
export interface ClawContext {
  filePath: string;
  languageId?: string;
  content: string;
  cursorLine: number;
  cursorColumn: number;
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  projectRoot?: string;
}

export function collectContext(params: {
  filePath: string;
  languageId?: string;
  content: string;
  cursorLine: number;
  cursorColumn: number;
  selectionStartLine?: number;
  selectionStartColumn?: number;
  selectionEndLine?: number;
  selectionEndColumn?: number;
  projectRoot?: string;
}): ClawContext {
  const { filePath, languageId, content, cursorLine, cursorColumn } = params;
  const selPresent = typeof params.selectionStartLine === 'number' && typeof params.selectionEndLine === 'number';
  const selection = selPresent
    ? {
        startLine: params.selectionStartLine || 0,
        startColumn: params.selectionStartColumn || 0,
        endLine: params.selectionEndLine || 0,
        endColumn: params.selectionEndColumn || 0,
      }
    : undefined;
  return {
    filePath,
    languageId,
    content,
    cursorLine,
    cursorColumn,
    selection,
    projectRoot: params.projectRoot,
  };
}
