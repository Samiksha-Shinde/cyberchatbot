const MODEL = "gemini-3.5-flash-lite";
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const REQUEST_TIMEOUT_MS = 60000;
const SESSION_KEY = "cyberaware.geminiApiKey";
const SYSTEM_INSTRUCTION = [
  "You are CyberAware, a friendly cybercrime-awareness assistant.",
  "Give clear, calm, practical advice about recognizing scams, protecting accounts and devices, privacy, and responding to suspected cybercrime.",
  "Prioritize immediate harm reduction: advise users not to click links, send money, share passwords or verification codes, and to contact their bank or relevant service through official channels when appropriate.",
  "Encourage reporting to local law enforcement or official cybercrime reporting services when relevant. Do not claim to be law enforcement, a lawyer, or an incident-response professional.",
  "Do not provide instructions that enable cyber abuse, credential theft, malware, evasion, or unauthorized access. Redirect such requests to defensive, lawful guidance.",
  "Do not ask users to share passwords, authentication codes, full payment-card details, or other secrets. Be transparent when advice depends on a user's country or circumstances."
].join(" ");

const messages = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const suggestions = document.querySelector("#suggestions");
const keyDialog = document.querySelector("#key-dialog");
const keyInput = document.querySelector("#api-key-input");
let previousInteractionId = null;
let isSending = false;

function openKeyDialog() {
  keyInput.value = sessionStorage.getItem(SESSION_KEY) || "";
  keyDialog.showModal();
  keyInput.focus();
}

function addMessage(text, role, label) {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user-row" : "assistant-row"}`;

  if (role !== "user") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "C";
    row.append(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  bubble.append(paragraph);
  const timestamp = document.createElement("span");
  timestamp.className = "message-time";
  timestamp.textContent = label || (role === "user" ? "You · just now" : "CyberAware · just now");
  content.append(bubble, timestamp);
  row.append(content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "message-row assistant-row";
  row.id = "typing-indicator";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = "C";
  const content = document.createElement("div");
  content.className = "message-content";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble typing-bubble";
  bubble.setAttribute("aria-label", "Assistant is responding");
  for (let i = 0; i < 3; i += 1) bubble.append(document.createElement("span"));
  content.append(bubble);
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
}

async function getAssistantReply(userMessage, apiKey) {
  const requestBody = {
    model: MODEL,
    input: userMessage,
    system_instruction: SYSTEM_INSTRUCTION
  };
  if (previousInteractionId) requestBody.previous_interaction_id = previousInteractionId;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiError = Array.isArray(result)
      ? result.find((item) => item?.error)?.error
      : result.error;
    const detail = apiError?.message || `The Gemini API returned HTTP ${response.status}.`;
    throw new Error(detail);
  }

  const outputStep = Array.isArray(result.steps)
    ? [...result.steps].reverse().find((step) => step.type === "model_output")
    : null;
  const stepText = Array.isArray(outputStep?.content)
    ? outputStep.content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("")
    : "";
  const outputText = typeof result.output_text === "string" ? result.output_text : stepText;

  if (!outputText.trim()) {
    throw new Error("Gemini returned no text. Please try again.");
  }
  if (typeof result.id === "string") previousInteractionId = result.id;
  return outputText.trim();
}

async function sendMessage(text) {
  if (isSending) return;
  const apiKey = sessionStorage.getItem(SESSION_KEY);
  if (!apiKey) {
    openKeyDialog();
    return;
  }

  const userMessage = text.trim();
  if (!userMessage) return;
  isSending = true;
  sendButton.disabled = true;
  suggestions.hidden = true;
  addMessage(userMessage, "user");
  input.value = "";
  input.style.height = "auto";
  showTyping();

  try {
    const reply = await getAssistantReply(userMessage, apiKey);
    addMessage(reply, "assistant");
  } catch (error) {
    const errorText = error instanceof Error ? error.message : "An unexpected error occurred.";
    addMessage(`I couldn't get a response. ${errorText} Check your API key, model access, and network connection, then try again.`, "assistant", "Connection issue");
  } finally {
    document.querySelector("#typing-indicator")?.remove();
    isSending = false;
    sendButton.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

suggestions.addEventListener("click", (event) => {
  const button = event.target.closest(".suggestion-chip");
  if (button) sendMessage(button.textContent);
});

document.querySelector("#api-key-button").addEventListener("click", openKeyDialog);
document.querySelector("#close-dialog").addEventListener("click", () => keyDialog.close());
document.querySelector("#key-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const apiKey = keyInput.value.trim();
  if (!apiKey) return;
  sessionStorage.setItem(SESSION_KEY, apiKey);
  keyDialog.close();
  input.focus();
});
document.querySelector("#remove-key").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  keyInput.value = "";
  keyDialog.close();
});
document.querySelector("#clear-chat").addEventListener("click", () => {
  if (isSending) return;
  previousInteractionId = null;
  messages.replaceChildren();
  addMessage("Hi! I’m here to help you recognize cybercrime and take safer next steps. What would you like to know?", "assistant", "CyberAware · just now");
  suggestions.hidden = false;
  input.focus();
});

if (!sessionStorage.getItem(SESSION_KEY)) {
  window.setTimeout(openKeyDialog, 250);
}
