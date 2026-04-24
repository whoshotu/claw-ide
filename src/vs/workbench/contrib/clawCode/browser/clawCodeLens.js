"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClawCodeLensProvider = void 0;
// Lightweight CodeLens provider scaffold (P2)
class ClawCodeLensProvider {
    provideCodeLenses(document, token) {
        // Minimal no-op lens to satisfy compilation; real lenses would be created here
        return [];
    }
}
exports.ClawCodeLensProvider = ClawCodeLensProvider;
