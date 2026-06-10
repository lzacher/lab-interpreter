import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ─── Helper: detect if messages contain images ─────────────────────────────
function messagesContainImages(messages: Message[]): boolean {
  for (const msg of messages) {
    const content = msg.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part !== "string" && part.type === "image_url") {
          return true;
        }
      }
    }
  }
  return false;
}

// ─── Helper: check if Forge API is available ────────────────────────────────
function isForgeAvailable(): boolean {
  return !!(ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0);
}

// ─── Forge API (Manus platform) ─────────────────────────────────────────────

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;
  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");
    return { role, name, tool_call_id, content };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return { role, name, content: contentParts[0].text };
  }

  return { role, name, content: contentParts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error("tool_choice 'required' was provided but no tools were configured");
    }
    if (tools.length > 1) {
      throw new Error("tool_choice 'required' needs a single tool or specify the tool name explicitly");
    }
    return { type: "function", function: { name: tools[0].function.name } };
  }
  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return toolChoice;
};

const resolveForgeApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return undefined;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

async function invokeForge(params: InvokeParams): Promise<InvokeResult> {
  const { messages, tools, toolChoice, tool_choice, outputSchema, output_schema, responseFormat, response_format } = params;

  const payload: Record<string, unknown> = {
    model: "gemini-2.5-flash",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) payload.tools = tools;

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;

  payload.max_tokens = 32768;
  payload.thinking = { budget_tokens: 128 };

  const normalizedResponseFormat = normalizeResponseFormat({ responseFormat, response_format, outputSchema, output_schema });
  if (normalizedResponseFormat) payload.response_format = normalizedResponseFormat;

  const response = await fetch(resolveForgeApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return (await response.json()) as InvokeResult;
}

// ─── Ollama Local ───────────────────────────────────────────────────────────

interface OllamaMessage {
  role: string;
  content: string;
  images?: string[];
}

function convertMessagesForOllama(messages: Message[]): { ollamaMessages: OllamaMessage[]; hasImages: boolean } {
  let hasImages = false;
  const ollamaMessages: OllamaMessage[] = [];

  for (const msg of messages) {
    const content = msg.content;
    let textParts: string[] = [];
    let images: string[] = [];

    if (typeof content === "string") {
      textParts.push(content);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === "string") {
          textParts.push(part);
        } else if (part.type === "text") {
          textParts.push(part.text);
        } else if (part.type === "image_url") {
          hasImages = true;
          // Extract base64 data from data URL
          const url = part.image_url.url;
          if (url.startsWith("data:")) {
            const base64Data = url.split(",")[1];
            if (base64Data) images.push(base64Data);
          } else {
            // External URL - pass as-is (Ollama may not support this)
            images.push(url);
          }
        }
      }
    } else {
      // Single content object
      if (content.type === "text") {
        textParts.push(content.text);
      } else if (content.type === "image_url") {
        hasImages = true;
        const url = content.image_url.url;
        if (url.startsWith("data:")) {
          const base64Data = url.split(",")[1];
          if (base64Data) images.push(base64Data);
        }
      }
    }

    const ollamaMsg: OllamaMessage = {
      role: msg.role === "tool" || msg.role === "function" ? "assistant" : msg.role,
      content: textParts.join("\n"),
    };

    if (images.length > 0) {
      ollamaMsg.images = images;
    }

    ollamaMessages.push(ollamaMsg);
  }

  return { ollamaMessages, hasImages };
}

function buildJsonFormatPrompt(params: InvokeParams): string {
  const format = params.responseFormat || params.response_format;
  if (!format) return "";

  if (format.type === "json_object") {
    return "\n\nIMPORTANT: Respond ONLY with valid JSON. No extra text, no markdown code blocks.";
  }

  if (format.type === "json_schema" && format.json_schema?.schema) {
    const schema = format.json_schema.schema;
    return `\n\nIMPORTANT: Respond ONLY with valid JSON matching this schema: ${JSON.stringify(schema)}. No extra text, no markdown code blocks, no explanations.`;
  }

  return "";
}

async function invokeOllama(params: InvokeParams): Promise<InvokeResult> {
  const { messages } = params;
  const { ollamaMessages, hasImages } = convertMessagesForOllama(messages);

  // Choose model based on whether images are present
  const model = hasImages ? ENV.ollamaVisionModel : ENV.ollamaModel;
  const ollamaUrl = `${ENV.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`;

  // Append JSON format instruction to the last user message if needed
  const jsonPrompt = buildJsonFormatPrompt(params);
  if (jsonPrompt && ollamaMessages.length > 0) {
    const lastMsg = ollamaMessages[ollamaMessages.length - 1];
    lastMsg.content += jsonPrompt;
  }

  console.log(`[LLM] Using Ollama model: ${model} (images: ${hasImages})`);

  const response = await fetch(ollamaUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        num_predict: 4096,
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const ollamaResult = (await response.json()) as {
    model: string;
    created_at: string;
    message: { role: string; content: string };
    done: boolean;
    total_duration?: number;
    eval_count?: number;
    prompt_eval_count?: number;
  };

  // Convert Ollama response to InvokeResult format
  let content = ollamaResult.message?.content ?? "";

  // Clean up markdown code blocks if JSON was requested
  const format = params.responseFormat || params.response_format;
  if (format && (format.type === "json_object" || format.type === "json_schema")) {
    content = cleanJsonResponse(content);
  }

  return {
    id: `ollama-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: ollamaResult.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: ollamaResult.prompt_eval_count ?? 0,
      completion_tokens: ollamaResult.eval_count ?? 0,
      total_tokens: (ollamaResult.prompt_eval_count ?? 0) + (ollamaResult.eval_count ?? 0),
    },
  };
}

function cleanJsonResponse(content: string): string {
  // Remove markdown code blocks
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (isForgeAvailable()) {
    return invokeForge(params);
  }

  // Fallback to Ollama
  return invokeOllama(params);
}
