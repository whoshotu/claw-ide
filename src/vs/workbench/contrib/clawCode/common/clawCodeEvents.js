"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAW_CANCELLED = exports.CLAW_DIFF_READY = exports.CLAW_ERROR = exports.CLAW_DONE = exports.CLAW_STREAM = exports.clawCodeEvents = void 0;
// Minimal Claw Code event names (P0 scaffold)
exports.clawCodeEvents = {
    CLAW_CODE_DIFF_READY: "claw-diff-ready",
    CLAW_CODE_DONE: "claw-done",
};
// Core event name constants (used across Claw Code components)
exports.CLAW_STREAM = "claw-stream";
exports.CLAW_DONE = "claw-done";
exports.CLAW_ERROR = "claw-error";
exports.CLAW_DIFF_READY = "claw-diff-ready";
exports.CLAW_CANCELLED = "claw-cancelled";
