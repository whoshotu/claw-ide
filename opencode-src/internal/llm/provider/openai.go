package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/responses"
	"github.com/openai/openai-go/shared"
	"github.com/opencode-ai/opencode/internal/config"
	"github.com/opencode-ai/opencode/internal/llm/models"
	"github.com/opencode-ai/opencode/internal/llm/tools"
	"github.com/opencode-ai/opencode/internal/logging"
	"github.com/opencode-ai/opencode/internal/message"
)

type openaiOptions struct {
	baseURL         string
	disableCache    bool
	reasoningEffort string
	extraHeaders    map[string]string
}

type OpenAIOption func(*openaiOptions)

type openaiClient struct {
	providerOptions providerClientOptions
	options         openaiOptions
	client          openai.Client
}

type OpenAIClient ProviderClient

func newOpenAIClient(opts providerClientOptions) OpenAIClient {
	openaiOpts := openaiOptions{
		reasoningEffort: "medium",
	}
	for _, o := range opts.openaiOptions {
		o(&openaiOpts)
	}

	openaiClientOptions := []option.RequestOption{}
	if opts.apiKey != "" {
		openaiClientOptions = append(openaiClientOptions, option.WithAPIKey(opts.apiKey))
	}
	if openaiOpts.baseURL != "" {
		openaiClientOptions = append(openaiClientOptions, option.WithBaseURL(openaiOpts.baseURL))
	}

	if openaiOpts.extraHeaders != nil {
		for key, value := range openaiOpts.extraHeaders {
			openaiClientOptions = append(openaiClientOptions, option.WithHeader(key, value))
		}
	}

	client := openai.NewClient(openaiClientOptions...)
	return &openaiClient{
		providerOptions: opts,
		options:         openaiOpts,
		client:          client,
	}
}

func (o *openaiClient) convertMessages(messages []message.Message) (openaiMessages []openai.ChatCompletionMessageParamUnion) {
	// Add system message first
	openaiMessages = append(openaiMessages, openai.SystemMessage(o.providerOptions.systemMessage))

	for _, msg := range messages {
		switch msg.Role {
		case message.User:
			var content []openai.ChatCompletionContentPartUnionParam
			textBlock := openai.ChatCompletionContentPartTextParam{Text: msg.Content().String()}
			content = append(content, openai.ChatCompletionContentPartUnionParam{OfText: &textBlock})
			for _, binaryContent := range msg.BinaryContent() {
				imageURL := openai.ChatCompletionContentPartImageImageURLParam{URL: binaryContent.String(models.ProviderOpenAI)}
				imageBlock := openai.ChatCompletionContentPartImageParam{ImageURL: imageURL}

				content = append(content, openai.ChatCompletionContentPartUnionParam{OfImageURL: &imageBlock})
			}

			openaiMessages = append(openaiMessages, openai.UserMessage(content))

		case message.Assistant:
			assistantMsg := openai.ChatCompletionAssistantMessageParam{
				Role: "assistant",
			}

			if msg.Content().String() != "" {
				assistantMsg.Content = openai.ChatCompletionAssistantMessageParamContentUnion{
					OfString: openai.String(msg.Content().String()),
				}
			}

			if len(msg.ToolCalls()) > 0 {
				assistantMsg.ToolCalls = make([]openai.ChatCompletionMessageToolCallParam, len(msg.ToolCalls()))
				for i, call := range msg.ToolCalls() {
					assistantMsg.ToolCalls[i] = openai.ChatCompletionMessageToolCallParam{
						ID:   call.ID,
						Type: "function",
						Function: openai.ChatCompletionMessageToolCallFunctionParam{
							Name:      call.Name,
							Arguments: call.Input,
						},
					}
				}
			}

			openaiMessages = append(openaiMessages, openai.ChatCompletionMessageParamUnion{
				OfAssistant: &assistantMsg,
			})

		case message.Tool:
			for _, result := range msg.ToolResults() {
				openaiMessages = append(openaiMessages,
					openai.ToolMessage(result.Content, result.ToolCallID),
				)
			}
		}
	}

	return
}

func (o *openaiClient) convertTools(tools []tools.BaseTool) []openai.ChatCompletionToolParam {
	openaiTools := make([]openai.ChatCompletionToolParam, len(tools))

	for i, tool := range tools {
		info := tool.Info()
		openaiTools[i] = openai.ChatCompletionToolParam{
			Function: openai.FunctionDefinitionParam{
				Name:        info.Name,
				Description: openai.String(info.Description),
				Parameters: openai.FunctionParameters{
					"type":       "object",
					"properties": info.Parameters,
					"required":   info.Required,
				},
			},
		}
	}

	return openaiTools
}

func (o *openaiClient) finishReason(reason string) message.FinishReason {
	switch reason {
	case "stop":
		return message.FinishReasonEndTurn
	case "length":
		return message.FinishReasonMaxTokens
	case "tool_calls":
		return message.FinishReasonToolUse
	default:
		return message.FinishReasonUnknown
	}
}

func (o *openaiClient) preparedParams(messages []openai.ChatCompletionMessageParamUnion, tools []openai.ChatCompletionToolParam) openai.ChatCompletionNewParams {
	params := openai.ChatCompletionNewParams{
		Model:    openai.ChatModel(o.providerOptions.model.APIModel),
		Messages: messages,
		Tools:    tools,
	}

	if o.providerOptions.model.CanReason == true {
		params.MaxCompletionTokens = openai.Int(o.providerOptions.maxTokens)
		effort := o.providerOptions.model.ClampEffort(o.options.reasoningEffort)
		params.ReasoningEffort = shared.ReasoningEffort(effort)
	} else {
		params.MaxTokens = openai.Int(o.providerOptions.maxTokens)
	}

	return params
}

func (o *openaiClient) send(ctx context.Context, messages []message.Message, tools []tools.BaseTool) (response *ProviderResponse, err error) {
	if o.providerOptions.model.UseResponsesAPI {
		return o.sendResponses(ctx, messages, tools)
	}
	params := o.preparedParams(o.convertMessages(messages), o.convertTools(tools))
	cfg := config.Get()
	if cfg.Debug {
		jsonData, _ := json.Marshal(params)
		logging.Debug("Prepared messages", "messages", string(jsonData))
	}
	attempts := 0
	for {
		attempts++
		openaiResponse, err := o.client.Chat.Completions.New(
			ctx,
			params,
		)
		// If there is an error we are going to see if we can retry the call
		if err != nil {
			retry, after, retryErr := o.shouldRetry(attempts, err)
			if retryErr != nil {
				return nil, retryErr
			}
			if retry {
				logging.WarnPersist(fmt.Sprintf("Retrying due to rate limit... attempt %d of %d", attempts, maxRetries), logging.PersistTimeArg, time.Millisecond*time.Duration(after+100))
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(time.Duration(after) * time.Millisecond):
					continue
				}
			}
			return nil, retryErr
		}

		content := ""
		if openaiResponse.Choices[0].Message.Content != "" {
			content = openaiResponse.Choices[0].Message.Content
		}

		toolCalls := o.toolCalls(*openaiResponse)
		finishReason := o.finishReason(string(openaiResponse.Choices[0].FinishReason))

		if len(toolCalls) > 0 {
			finishReason = message.FinishReasonToolUse
		}

		return &ProviderResponse{
			Content:      content,
			ToolCalls:    toolCalls,
			Usage:        o.usage(*openaiResponse),
			FinishReason: finishReason,
		}, nil
	}
}

func (o *openaiClient) stream(ctx context.Context, messages []message.Message, tools []tools.BaseTool) <-chan ProviderEvent {
	if o.providerOptions.model.UseResponsesAPI {
		return o.streamResponses(ctx, messages, tools)
	}
	params := o.preparedParams(o.convertMessages(messages), o.convertTools(tools))
	params.StreamOptions = openai.ChatCompletionStreamOptionsParam{
		IncludeUsage: openai.Bool(true),
	}

	cfg := config.Get()
	if cfg.Debug {
		jsonData, _ := json.Marshal(params)
		logging.Debug("Prepared messages", "messages", string(jsonData))
	}

	attempts := 0
	eventChan := make(chan ProviderEvent)

	go func() {
		for {
			attempts++
			openaiStream := o.client.Chat.Completions.NewStreaming(
				ctx,
				params,
			)

			acc := openai.ChatCompletionAccumulator{}
			currentContent := ""
			toolCalls := make([]message.ToolCall, 0)

			for openaiStream.Next() {
				chunk := openaiStream.Current()
				acc.AddChunk(chunk)

				for _, choice := range chunk.Choices {
					if choice.Delta.Content != "" {
						eventChan <- ProviderEvent{
							Type:    EventContentDelta,
							Content: choice.Delta.Content,
						}
						currentContent += choice.Delta.Content
					}
				}
			}

			err := openaiStream.Err()
			if err == nil || errors.Is(err, io.EOF) {
				// Stream completed successfully
				finishReason := o.finishReason(string(acc.ChatCompletion.Choices[0].FinishReason))
				if len(acc.ChatCompletion.Choices[0].Message.ToolCalls) > 0 {
					toolCalls = append(toolCalls, o.toolCalls(acc.ChatCompletion)...)
				}
				if len(toolCalls) > 0 {
					finishReason = message.FinishReasonToolUse
				}

				eventChan <- ProviderEvent{
					Type: EventComplete,
					Response: &ProviderResponse{
						Content:      currentContent,
						ToolCalls:    toolCalls,
						Usage:        o.usage(acc.ChatCompletion),
						FinishReason: finishReason,
					},
				}
				close(eventChan)
				return
			}

			// If there is an error we are going to see if we can retry the call
			retry, after, retryErr := o.shouldRetry(attempts, err)
			if retryErr != nil {
				eventChan <- ProviderEvent{Type: EventError, Error: retryErr}
				close(eventChan)
				return
			}
			if retry {
				logging.WarnPersist(fmt.Sprintf("Retrying due to rate limit... attempt %d of %d", attempts, maxRetries), logging.PersistTimeArg, time.Millisecond*time.Duration(after+100))
				select {
				case <-ctx.Done():
					// context cancelled
					if ctx.Err() == nil {
						eventChan <- ProviderEvent{Type: EventError, Error: ctx.Err()}
					}
					close(eventChan)
					return
				case <-time.After(time.Duration(after) * time.Millisecond):
					continue
				}
			}
			eventChan <- ProviderEvent{Type: EventError, Error: retryErr}
			close(eventChan)
			return
		}
	}()

	return eventChan
}

// --- Responses API methods (for gpt-5.x models) ---

func (o *openaiClient) convertMessagesToResponses(messages []message.Message) responses.ResponseInputParam {
	var input responses.ResponseInputParam

	for _, msg := range messages {
		switch msg.Role {
		case message.User:
			if len(msg.BinaryContent()) > 0 {
				var parts responses.ResponseInputMessageContentListParam
				parts = append(parts, responses.ResponseInputContentUnionParam{
					OfInputText: &responses.ResponseInputTextParam{
						Text: msg.Content().String(),
					},
				})
				for _, bc := range msg.BinaryContent() {
					parts = append(parts, responses.ResponseInputContentUnionParam{
						OfInputImage: &responses.ResponseInputImageParam{
							ImageURL: openai.String(bc.String(models.ProviderOpenAI)),
							Detail:   responses.ResponseInputImageDetailAuto,
						},
					})
				}
				input = append(input, responses.ResponseInputItemUnionParam{
					OfMessage: &responses.EasyInputMessageParam{
						Role: responses.EasyInputMessageRoleUser,
						Content: responses.EasyInputMessageContentUnionParam{
							OfInputItemContentList: parts,
						},
					},
				})
			} else {
				input = append(input, responses.ResponseInputItemUnionParam{
					OfMessage: &responses.EasyInputMessageParam{
						Role: responses.EasyInputMessageRoleUser,
						Content: responses.EasyInputMessageContentUnionParam{
							OfString: openai.String(msg.Content().String()),
						},
					},
				})
			}

		case message.Assistant:
			if msg.Content().String() != "" {
				input = append(input, responses.ResponseInputItemUnionParam{
					OfMessage: &responses.EasyInputMessageParam{
						Role: responses.EasyInputMessageRoleAssistant,
						Content: responses.EasyInputMessageContentUnionParam{
							OfString: openai.String(msg.Content().String()),
						},
					},
				})
			}
			for _, call := range msg.ToolCalls() {
				input = append(input, responses.ResponseInputItemUnionParam{
					OfFunctionCall: &responses.ResponseFunctionToolCallParam{
						CallID:    call.ID,
						Name:      call.Name,
						Arguments: call.Input,
					},
				})
			}

		case message.Tool:
			for _, result := range msg.ToolResults() {
				input = append(input, responses.ResponseInputItemUnionParam{
					OfFunctionCallOutput: &responses.ResponseInputItemFunctionCallOutputParam{
						CallID: result.ToolCallID,
						Output: result.Content,
					},
				})
			}
		}
	}

	return input
}

func (o *openaiClient) convertToolsToResponses(tls []tools.BaseTool) []responses.ToolUnionParam {
	result := make([]responses.ToolUnionParam, len(tls))
	for i, tool := range tls {
		info := tool.Info()
		result[i] = responses.ToolUnionParam{
			OfFunction: &responses.FunctionToolParam{
				Name:        info.Name,
				Description: openai.String(info.Description),
				Parameters: map[string]interface{}{
					"type":       "object",
					"properties": info.Parameters,
					"required":   info.Required,
				},
			},
		}
	}
	return result
}

func (o *openaiClient) preparedResponsesParams(input responses.ResponseInputParam, tls []responses.ToolUnionParam) responses.ResponseNewParams {
	params := responses.ResponseNewParams{
		Model: shared.ResponsesModel(o.providerOptions.model.APIModel),
		Input: responses.ResponseNewParamsInputUnion{
			OfInputItemList: input,
		},
		Instructions:    openai.String(o.providerOptions.systemMessage),
		MaxOutputTokens: openai.Int(o.providerOptions.maxTokens),
		Tools:           tls,
	}

	if o.providerOptions.model.CanReason {
		effort := o.providerOptions.model.ClampEffort(o.options.reasoningEffort)
		params.Reasoning = shared.ReasoningParam{
			Effort: shared.ReasoningEffort(effort),
		}
	}

	return params
}

func (o *openaiClient) sendResponses(ctx context.Context, messages []message.Message, tls []tools.BaseTool) (*ProviderResponse, error) {
	input := o.convertMessagesToResponses(messages)
	responsesTools := o.convertToolsToResponses(tls)
	params := o.preparedResponsesParams(input, responsesTools)

	cfg := config.Get()
	if cfg.Debug {
		jsonData, _ := json.Marshal(params)
		logging.Debug("Prepared responses params", "params", string(jsonData))
	}

	attempts := 0
	for {
		attempts++
		apiResp, err := o.client.Responses.New(ctx, params)
		if err != nil {
			retry, after, retryErr := o.shouldRetry(attempts, err)
			if retryErr != nil {
				return nil, retryErr
			}
			if retry {
				logging.WarnPersist(fmt.Sprintf("Retrying due to rate limit... attempt %d of %d", attempts, maxRetries), logging.PersistTimeArg, time.Millisecond*time.Duration(after+100))
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(time.Duration(after) * time.Millisecond):
					continue
				}
			}
			return nil, retryErr
		}

		content := ""
		var toolCalls []message.ToolCall

		for _, item := range apiResp.Output {
			switch item.Type {
			case "message":
				for _, part := range item.Content {
					if part.Type == "output_text" {
						content += part.Text
					}
				}
			case "function_call":
				toolCalls = append(toolCalls, message.ToolCall{
					ID:       item.CallID,
					Name:     item.Name,
					Input:    item.Arguments,
					Type:     "function",
					Finished: true,
				})
			}
		}

		finishReason := message.FinishReasonEndTurn
		if len(toolCalls) > 0 {
			finishReason = message.FinishReasonToolUse
		}
		if apiResp.Status == "incomplete" {
			finishReason = message.FinishReasonMaxTokens
		}

		return &ProviderResponse{
			Content:      content,
			ToolCalls:    toolCalls,
			Usage:        o.responsesUsage(apiResp),
			FinishReason: finishReason,
		}, nil
	}
}

func (o *openaiClient) streamResponses(ctx context.Context, messages []message.Message, tls []tools.BaseTool) <-chan ProviderEvent {
	input := o.convertMessagesToResponses(messages)
	responsesTools := o.convertToolsToResponses(tls)
	params := o.preparedResponsesParams(input, responsesTools)

	cfg := config.Get()
	if cfg.Debug {
		jsonData, _ := json.Marshal(params)
		logging.Debug("Prepared responses params", "params", string(jsonData))
	}

	attempts := 0
	eventChan := make(chan ProviderEvent)

	go func() {
		for {
			attempts++
			stream := o.client.Responses.NewStreaming(ctx, params)

			currentContent := ""
			toolCallMap := make(map[string]*message.ToolCall) // keyed by item ID
			usage := TokenUsage{}

			for stream.Next() {
				event := stream.Current()
				switch event.Type {
				case "response.output_text.delta":
					eventChan <- ProviderEvent{
						Type:    EventContentDelta,
						Content: event.Delta,
					}
					currentContent += event.Delta

				case "response.output_item.added":
					if event.Item.Type == "function_call" {
						toolCallMap[event.Item.ID] = &message.ToolCall{
							ID:       event.Item.CallID,
							Name:     event.Item.Name,
							Input:    "",
							Type:     "function",
							Finished: false,
						}
					}

				case "response.function_call_arguments.delta":
					if tc, ok := toolCallMap[event.ItemID]; ok {
						tc.Input += event.Delta
					}

				case "response.function_call_arguments.done":
					doneEvent := event.AsResponseFunctionCallArgumentsDone()
					if tc, ok := toolCallMap[doneEvent.ItemID]; ok {
						tc.Input = doneEvent.Arguments
						tc.Finished = true
					}

				case "response.completed":
					completed := event.AsResponseCompleted()
					usage = TokenUsage{
						InputTokens:     completed.Response.Usage.InputTokens,
						OutputTokens:    completed.Response.Usage.OutputTokens,
						CacheReadTokens: completed.Response.Usage.InputTokensDetails.CachedTokens,
					}
				}
			}

			err := stream.Err()
			if err == nil || errors.Is(err, io.EOF) {
				var toolCalls []message.ToolCall
				for _, tc := range toolCallMap {
					toolCalls = append(toolCalls, *tc)
				}

				finishReason := message.FinishReasonEndTurn
				if len(toolCalls) > 0 {
					finishReason = message.FinishReasonToolUse
				}

				eventChan <- ProviderEvent{
					Type: EventComplete,
					Response: &ProviderResponse{
						Content:      currentContent,
						ToolCalls:    toolCalls,
						Usage:        usage,
						FinishReason: finishReason,
					},
				}
				close(eventChan)
				return
			}

			retry, after, retryErr := o.shouldRetry(attempts, err)
			if retryErr != nil {
				eventChan <- ProviderEvent{Type: EventError, Error: retryErr}
				close(eventChan)
				return
			}
			if retry {
				logging.WarnPersist(fmt.Sprintf("Retrying due to rate limit... attempt %d of %d", attempts, maxRetries), logging.PersistTimeArg, time.Millisecond*time.Duration(after+100))
				select {
				case <-ctx.Done():
					if ctx.Err() != nil {
						eventChan <- ProviderEvent{Type: EventError, Error: ctx.Err()}
					}
					close(eventChan)
					return
				case <-time.After(time.Duration(after) * time.Millisecond):
					continue
				}
			}
			eventChan <- ProviderEvent{Type: EventError, Error: retryErr}
			close(eventChan)
			return
		}
	}()

	return eventChan
}

func (o *openaiClient) responsesUsage(resp *responses.Response) TokenUsage {
	cachedTokens := resp.Usage.InputTokensDetails.CachedTokens
	inputTokens := resp.Usage.InputTokens - cachedTokens

	return TokenUsage{
		InputTokens:     inputTokens,
		OutputTokens:    resp.Usage.OutputTokens,
		CacheReadTokens: cachedTokens,
	}
}

func (o *openaiClient) shouldRetry(attempts int, err error) (bool, int64, error) {
	var apierr *openai.Error
	if !errors.As(err, &apierr) {
		return false, 0, err
	}

	if apierr.StatusCode != 429 && apierr.StatusCode != 500 {
		return false, 0, err
	}

	if attempts > maxRetries {
		return false, 0, fmt.Errorf("maximum retry attempts reached for rate limit: %d retries", maxRetries)
	}

	retryMs := 0
	retryAfterValues := apierr.Response.Header.Values("Retry-After")

	backoffMs := 2000 * (1 << (attempts - 1))
	jitterMs := int(float64(backoffMs) * 0.2)
	retryMs = backoffMs + jitterMs
	if len(retryAfterValues) > 0 {
		if _, err := fmt.Sscanf(retryAfterValues[0], "%d", &retryMs); err == nil {
			retryMs = retryMs * 1000
		}
	}
	return true, int64(retryMs), nil
}

func (o *openaiClient) toolCalls(completion openai.ChatCompletion) []message.ToolCall {
	var toolCalls []message.ToolCall

	if len(completion.Choices) > 0 && len(completion.Choices[0].Message.ToolCalls) > 0 {
		for _, call := range completion.Choices[0].Message.ToolCalls {
			toolCall := message.ToolCall{
				ID:       call.ID,
				Name:     call.Function.Name,
				Input:    call.Function.Arguments,
				Type:     "function",
				Finished: true,
			}
			toolCalls = append(toolCalls, toolCall)
		}
	}

	return toolCalls
}

func (o *openaiClient) usage(completion openai.ChatCompletion) TokenUsage {
	cachedTokens := completion.Usage.PromptTokensDetails.CachedTokens
	inputTokens := completion.Usage.PromptTokens - cachedTokens

	return TokenUsage{
		InputTokens:         inputTokens,
		OutputTokens:        completion.Usage.CompletionTokens,
		CacheCreationTokens: 0, // OpenAI doesn't provide this directly
		CacheReadTokens:     cachedTokens,
	}
}

func WithOpenAIBaseURL(baseURL string) OpenAIOption {
	return func(options *openaiOptions) {
		options.baseURL = baseURL
	}
}

func WithOpenAIExtraHeaders(headers map[string]string) OpenAIOption {
	return func(options *openaiOptions) {
		options.extraHeaders = headers
	}
}

func WithOpenAIDisableCache() OpenAIOption {
	return func(options *openaiOptions) {
		options.disableCache = true
	}
}

func WithReasoningEffort(effort string) OpenAIOption {
	return func(options *openaiOptions) {
		switch effort {
		case "none", "minimal", "low", "medium", "high", "xhigh":
			options.reasoningEffort = effort
		case "":
			// Keep default; don't warn on empty.
		default:
			logging.Warn("Invalid reasoning effort, using default: medium")
		}
	}
}
