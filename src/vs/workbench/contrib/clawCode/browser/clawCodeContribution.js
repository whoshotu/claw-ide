"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClawCodeContributions = void 0;
// Registration of Claw Code contributions (P2)
const clawCodeLens_1 = require("./clawCodeLens");
const clawChatPanel_1 = require("./clawChatPanel");
const clawCompletions_1 = require("./clawCompletions");
// Lightweight registrations for build; actual VSCode extension APIs are not wired here.
function registerClawCodeContributions(_service) {
    // Chat panel
    const chat = new clawChatPanel_1.ClawChatPanel(_service);
    globalThis.clawCodeChatPanel = chat;
    // Completions
    // Proxy provider since there is no real editor integration in this scaffold
    const completions = new clawCompletions_1.ClawCompletionsProvider(_service);
    globalThis.clawCodeCompletions = completions;
    // Diff view
    globalThis.clawDiffView = {};
    // CodeLens
    globalThis.clawCodeLensProvider = new clawCodeLens_1.ClawCodeLensProvider();
}
exports.registerClawCodeContributions = registerClawCodeContributions;
