// IClawProcessService: Entry point for controlling the Claude subprocess.
// Pure TypeScript interface. No CLI or shell interactions here.
export interface IClawProcessService {
  // Spawn a Claude subprocess for a given session with provided arguments.
  spawn(sessionId: string, args: string[]): Promise<void>;

  // Cancel/terminate a Claude session by its sessionId.
  cancel(sessionId: string): void;

  // Retrieve the Claude binary version string.
  getVersion(): Promise<string>;

  // Attach a chunked stdout/stderr stream handler for a session.
  onStream(sessionId: string, handler: (chunk: string) => void): void;

  // Attach a handler to be invoked when the Claude process completes.
  onDone(sessionId: string, handler: (exitCode: number) => void): void;

  // Attach a handler for error events related to a session.
  onError(sessionId: string, handler: (err: Error) => void): void;
}
