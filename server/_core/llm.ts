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
    } else if (typeof content !== "string" && content.type === "image_url") {
      return true;
    }
  }
  return false;
}

// ─── Helper: check available backends ──────────────────────────────────────
function isForgeAvailable(): boolean {
  return !!(ENV.forgeApiKey && ENV.forgeApiKey.trim().length > 0);
}

function isGeminiAvailable(): boolean {
  return !!(ENV.geminiApiKey && ENV.geminiApiKey.trim().length > 0);
}

// ─── Gemini API (Google AI Studio) ─────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function convertMessagesForGemini(messages: Message[]): { contents: GeminiContent[]; systemInstruction?: string } {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    const content = msg.content;
    const parts: GeminiPart[] = [];

    if (msg.role === "system") {
      // Gemini handles system instructions separately
      if (typeof content === "string") {
        systemInstruction = (systemInstruction ? systemInstruction + "\n" : "") + content;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "string") {
            systemInstruction = (systemInstruction ? systemInstruction + "\n" : "") + part;
          } else if (part.type === "text") {
            systemInstruction = (systemInstruction ? systemInstruction + "\n" : "") + part.text;
          }
        }
      }
      continue;
    }

    if (typeof content === "string") {
      parts.push({ text: content });
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === "string") {
          parts.push({ text: part });
        } else if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url") {
          const url = part.image_url.url;
          if (url.startsWith("data:")) {
            // Extract mime type and base64 data
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
          }
        }
      }
    } else {
      if (content.type === "text") {
        parts.push({ text: content.text });
      } else if (content.type === "image_url") {
        const url = content.image_url.url;
        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
    }

    if (parts.length > 0) {
      const role = msg.role === "assistant" ? "model" : "user";
      contents.push({ role, parts });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Recursively strip 'additionalProperties' and 'strict' from a JSON schema object.
 * Gemini API does not support these fields and returns 400 if they are present.
 */
function stripUnsupportedSchemaFields(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties" || key === "strict") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = stripUnsupportedSchemaFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        item && typeof item === "object" && !Array.isArray(item)
          ? stripUnsupportedSchemaFields(item as Record<string, unknown>)
          : item
      );
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function buildGeminiResponseSchema(params: InvokeParams): Record<string, unknown> | undefined {
  const format = params.responseFormat || params.response_format;
  if (!format) return undefined;

  if (format.type === "json_object") {
    return { responseMimeType: "application/json" };
  }

  if (format.type === "json_schema" && format.json_schema?.schema) {
    const cleanedSchema = stripUnsupportedSchemaFields(format.json_schema.schema as Record<string, unknown>);
    return {
      responseMimeType: "application/json",
      responseSchema: cleanedSchema,
    };
  }

  return undefined;
}

async function invokeGemini(params: InvokeParams): Promise<InvokeResult> {
  const { messages } = params;
  const { contents, systemInstruction } = convertMessagesForGemini(messages);
  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ENV.geminiApiKey}`;

  const body: Record<string, unknown> = { contents };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Generation config
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: params.maxTokens || params.max_tokens || 8192,
    temperature: 0.1,
  };

  const responseSchema = buildGeminiResponseSchema(params);
  if (responseSchema) {
    Object.assign(generationConfig, responseSchema);
  }

  body.generationConfig = generationConfig;

  console.log(`[LLM] Using Gemini model: ${model}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const candidate = result.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text ?? "").join("") ?? "";

  let content = text;
  // Clean up markdown code blocks if JSON was requested
  const format = params.responseFormat || params.response_format;
  if (format && (format.type === "json_object" || format.type === "json_schema")) {
    content = cleanJsonResponse(content);
  }

  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: candidate?.finishReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: result.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: result.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

// ─── Forge API (Manus platform — only used in Manus sandbox) ───────────────

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

// ─── Ollama Local (text-only tasks) ────────────────────────────────────────

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
          const url = part.image_url.url;
          if (url.startsWith("data:")) {
            const base64Data = url.split(",")[1];
            if (base64Data) images.push(base64Data);
          } else {
            images.push(url);
          }
        }
      }
    } else {
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

// ─── Utility ───────────────────────────────────────────────────────────────

function cleanJsonResponse(content: string): string {
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
//
// Priority order:
// 1. Forge API (Manus sandbox only — has BUILT_IN_FORGE_API_KEY)
// 2. Gemini API (VPS — has GEMINI_API_KEY) — used for ALL tasks (vision + text)
// 3. Ollama local (fallback if no API keys available)
//
// Strategy on VPS:
// - Gemini handles both vision (classification, OCR) and text (JSON extraction)
// - Ollama is kept as fallback only
//

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  // 1. Manus sandbox
  if (isForgeAvailable()) {
    return invokeForge(params);
  }

  // 2. Gemini API (primary for VPS)
  if (isGeminiAvailable()) {
    return invokeGemini(params);
  }

  // 3. Ollama fallback
  return invokeOllama(params);
}
