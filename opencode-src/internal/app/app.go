package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"sync"
	"time"

	"github.com/opencode-ai/opencode/internal/config"
	"github.com/opencode-ai/opencode/internal/db"
	"github.com/opencode-ai/opencode/internal/format"
	"github.com/opencode-ai/opencode/internal/history"
	"github.com/opencode-ai/opencode/internal/llm/agent"
	"github.com/opencode-ai/opencode/internal/logging"
	"github.com/opencode-ai/opencode/internal/lsp"
	"github.com/opencode-ai/opencode/internal/message"
	"github.com/opencode-ai/opencode/internal/permission"
	"github.com/opencode-ai/opencode/internal/pubsub"
	"github.com/opencode-ai/opencode/internal/session"
	"github.com/opencode-ai/opencode/internal/tui/theme"
)

type App struct {
	Sessions    session.Service
	Messages    message.Service
	History     history.Service
	Permissions permission.Service

	CoderAgent agent.Service

	LSPClients map[string]*lsp.Client

	clientsMutex sync.RWMutex

	watcherCancelFuncs []context.CancelFunc
	cancelFuncsMutex   sync.Mutex
	watcherWG          sync.WaitGroup
}

func New(ctx context.Context, conn *sql.DB) (*App, error) {
	q := db.New(conn)
	sessions := session.NewService(q)
	messages := message.NewService(q)
	files := history.NewService(q, conn)

	app := &App{
		Sessions:    sessions,
		Messages:    messages,
		History:     files,
		Permissions: permission.NewPermissionService(),
		LSPClients:  make(map[string]*lsp.Client),
	}

	// Initialize theme based on configuration
	app.initTheme()

	// Initialize LSP clients in the background
	go app.initLSPClients(ctx)

	var err error
	app.CoderAgent, err = agent.NewAgent(
		config.AgentCoder,
		app.Sessions,
		app.Messages,
		agent.CoderAgentTools(
			app.Permissions,
			app.Sessions,
			app.Messages,
			app.History,
			app.LSPClients,
		),
	)
	if err != nil {
		logging.Error("Failed to create coder agent", err)
		return nil, err
	}

	return app, nil
}

// initTheme sets the application theme based on the configuration
func (app *App) initTheme() {
	cfg := config.Get()
	if cfg == nil || cfg.TUI.Theme == "" {
		return // Use default theme
	}

	// Try to set the theme from config
	err := theme.SetTheme(cfg.TUI.Theme)
	if err != nil {
		logging.Warn("Failed to set theme from config, using default theme", "theme", cfg.TUI.Theme, "error", err)
	} else {
		logging.Debug("Set theme from config", "theme", cfg.TUI.Theme)
	}
}

// streamEvent writes a JSON event line to stderr for GUI consumers.
func streamEvent(data map[string]string) {
	if b, err := json.Marshal(data); err == nil {
		fmt.Fprintln(os.Stderr, string(b))
	}
}

// RunNonInteractive handles the execution flow when a prompt is provided via CLI flag.
func (a *App) RunNonInteractive(ctx context.Context, prompt string, outputFormat string, quiet bool) error {
	logging.Info("Running in non-interactive mode")

	// Start spinner if not in quiet mode
	var spinner *format.Spinner
	if !quiet {
		spinner = format.NewSpinner("Thinking...")
		spinner.Start()
		defer spinner.Stop()
	}

	const maxPromptLengthForTitle = 100
	titlePrefix := "Non-interactive: "
	var titleSuffix string

	if len(prompt) > maxPromptLengthForTitle {
		titleSuffix = prompt[:maxPromptLengthForTitle] + "..."
	} else {
		titleSuffix = prompt
	}
	title := titlePrefix + titleSuffix

	sess, err := a.Sessions.Create(ctx, title)
	if err != nil {
		return fmt.Errorf("failed to create session for non-interactive mode: %w", err)
	}
	logging.Info("Created session for non-interactive run", "session_id", sess.ID)

	// Automatically approve all permission requests for this non-interactive session
	a.Permissions.AutoApproveSession(sess.ID)

	// Subscribe to message events for streaming progress to stderr
	subCtx, subCancel := context.WithCancel(ctx)
	msgCh := a.Messages.Subscribe(subCtx)

	// Track per-message state for computing deltas
	type msgState struct {
		textLen     int
		thinkingLen int
		toolCalls   map[string]bool // tool call ID -> finished
		toolResults int
	}
	states := make(map[string]*msgState)
	var statesMu sync.Mutex

	streamDone := make(chan struct{})
	go func() {
		defer close(streamDone)
		for event := range msgCh {
			msg := event.Payload
			if msg.SessionID != sess.ID {
				continue
			}
			// Only stream assistant and tool messages, skip user messages
			if msg.Role == message.User || msg.Role == message.System {
				continue
			}

			statesMu.Lock()

			st, ok := states[msg.ID]
			if !ok {
				st = &msgState{toolCalls: make(map[string]bool)}
				states[msg.ID] = st
			}

				// Stream thinking/reasoning deltas
				thinking := msg.ReasoningContent().Thinking
				if len(thinking) > st.thinkingLen {
					delta := thinking[st.thinkingLen:]
					st.thinkingLen = len(thinking)
					streamEvent(map[string]string{
						"type":    "thinking",
						"content": delta,
						"model":   string(msg.Model),
					})
				}

				// Stream text content deltas
				text := msg.Content().Text
				if len(text) > st.textLen {
					delta := text[st.textLen:]
					st.textLen = len(text)
					streamEvent(map[string]string{
						"type":    "text_delta",
						"content": delta,
						"model":   string(msg.Model),
					})
				}

			// Detect new/finished tool calls
			for _, tc := range msg.ToolCalls() {
				wasFinished, seen := st.toolCalls[tc.ID]
				if !seen {
					st.toolCalls[tc.ID] = tc.Finished
						streamEvent(map[string]string{
							"type":  "tool_start",
							"name":  tc.Name,
							"id":    tc.ID,
							"input": tc.Input,
							"model": string(msg.Model),
						})
						if tc.Finished {
							streamEvent(map[string]string{
								"type":  "tool_done",
								"name":  tc.Name,
								"id":    tc.ID,
								"model": string(msg.Model),
							})
						}
					} else if !wasFinished && tc.Finished {
						st.toolCalls[tc.ID] = true
						streamEvent(map[string]string{
							"type":  "tool_done",
							"name":  tc.Name,
							"id":    tc.ID,
							"input": tc.Input,
							"model": string(msg.Model),
						})
					}
				}

			// Detect new tool results (from tool-role messages)
			if event.Type == pubsub.CreatedEvent || event.Type == pubsub.UpdatedEvent {
				results := msg.ToolResults()
				if len(results) > st.toolResults {
					for i := st.toolResults; i < len(results); i++ {
						tr := results[i]
						content := tr.Content
						if len(content) > 500 {
							content = content[:500] + "..."
						}
							streamEvent(map[string]string{
								"type":         "tool_result",
								"name":         tr.Name,
								"tool_call_id": tr.ToolCallID,
								"content":      content,
								"model":        string(msg.Model),
							})
						}
					st.toolResults = len(results)
				}
			}

			statesMu.Unlock()
		}
	}()

	done, err := a.CoderAgent.Run(ctx, sess.ID, prompt)
	if err != nil {
		subCancel()
		<-streamDone
		return fmt.Errorf("failed to start agent processing stream: %w", err)
	}

	result := <-done

	// Signal done event before cancelling subscription
	streamEvent(map[string]string{"type": "stream_done"})
	subCancel()
	<-streamDone

	if result.Error != nil {
		if errors.Is(result.Error, context.Canceled) || errors.Is(result.Error, agent.ErrRequestCancelled) {
			logging.Info("Agent processing cancelled", "session_id", sess.ID)
			return nil
		}
		return fmt.Errorf("agent processing failed: %w", result.Error)
	}

	// Stop spinner before printing output
	if !quiet && spinner != nil {
		spinner.Stop()
	}

	// Get the text content from the response
	content := "No content available"
	if result.Message.Content().String() != "" {
		content = result.Message.Content().String()
	}

	fmt.Println(format.FormatOutput(content, outputFormat))

	logging.Info("Non-interactive run completed", "session_id", sess.ID)

	return nil
}

// Shutdown performs a clean shutdown of the application
func (app *App) Shutdown() {
	// Cancel all watcher goroutines
	app.cancelFuncsMutex.Lock()
	for _, cancel := range app.watcherCancelFuncs {
		cancel()
	}
	app.cancelFuncsMutex.Unlock()
	app.watcherWG.Wait()

	// Perform additional cleanup for LSP clients
	app.clientsMutex.RLock()
	clients := make(map[string]*lsp.Client, len(app.LSPClients))
	maps.Copy(clients, app.LSPClients)
	app.clientsMutex.RUnlock()

	for name, client := range clients {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := client.Shutdown(shutdownCtx); err != nil {
			logging.Error("Failed to shutdown LSP client", "name", name, "error", err)
		}
		cancel()
	}
}
