import { useAppStore } from "../store/appStore";

export function StatusBar() {
  const { activeFilePath, clawVersion, isStreaming, permissionMode, model } = useAppStore();

  return (
    <div className="status-bar">
      <div style={{ display: "flex", gap: "1rem" }}>
        {isStreaming && <span style={{ color: "#eab308" }}>Processing...</span>}
        {clawVersion && !clawVersion.isCompatible && <span style={{ color: "#f87171" }}>claw outdated</span>}
        <span>{permissionMode}</span>
        <span>{model}</span>
      </div>
      <div style={{ display: "flex", gap: "1rem" }}>
        {activeFilePath && (
          <>
            <span>UTF-8</span>
            <span>{activeFilePath.split(/[/\\]/).pop()}</span>
          </>
        )}
      </div>
    </div>
  );
}