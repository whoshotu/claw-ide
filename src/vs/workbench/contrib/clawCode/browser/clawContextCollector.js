"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectContext = void 0;
function collectContext(params) {
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
exports.collectContext = collectContext;
