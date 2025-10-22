<template>
  <div class="fluid-chat">
    <label class="api-label" for="fluid-chat-api-key">Anthropic API Key</label>
    <input
      id="fluid-chat-api-key"
      v-model="apiKey"
      type="password"
      autocomplete="off"
      placeholder="sk-ant-..."
      class="api-input"
    />

    <div class="history" ref="scrollContainer">
      <div v-if="messages.length === 0 && !isWaiting" class="empty-state">
        Ask Claude to read the current fluid settings or suggest adjustments.
      </div>
      <div v-for="(message, index) in messages" :key="`${message.timestamp}-${index}`" class="message" :class="message.role">
        <div v-if="message.role === 'user'" class="user-chip">
          <span class="user-text">{{ message.text }}</span>
        </div>
        <div v-else class="assistant-block">
          <div class="assistant-text">{{ message.text }}</div>
          <div v-if="message.toolCalls" class="tool-chips">
            <span v-for="(tool, chipIndex) in message.toolCalls" :key="chipIndex" class="tool-chip">
              {{ tool.displayName || tool.name }}
            </span>
          </div>
        </div>
      </div>
      <div v-if="isWaiting" class="thinking">Thinking…</div>
    </div>

    <form class="composer" @submit.prevent="handleSend">
      <textarea
        v-model="userInput"
        rows="2"
        class="composer-input"
        placeholder="Ask Claude to tweak the fluid parameters…"
        @keydown.enter.exact.prevent="handleSend"
      ></textarea>
      <button type="submit" class="send-button" :disabled="isSendDisabled">Send</button>
    </form>

    <div v-if="combinedError" class="error">{{ combinedError }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import { appStateName, type FluidReactionAppState } from './appState'
import { createClaudeFluidChat } from './createClaudeFluidChat'

const state = inject<FluidReactionAppState>(appStateName)!!

const apiKey = ref('')
const userInput = ref('')
const scrollContainer = ref<HTMLDivElement | null>(null)
const localError = ref<string | null>(null)

const { messages, isWaiting, error, send } = createClaudeFluidChat(() => state.fluidParams ?? [])

const combinedError = computed(() => localError.value || error.value)
const isSendDisabled = computed(() => userInput.value.trim().length === 0 || isWaiting.value)

async function handleSend() {
  const prompt = userInput.value.trim()
  if (!prompt || isWaiting.value) {
    return
  }

  const key = apiKey.value.trim()
  if (!key) {
    localError.value = 'Please provide an API key.'
    return
  }

  localError.value = null
  await send(key, prompt)
  userInput.value = ''
}

watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      const container = scrollContainer.value
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  }
)

watch(isWaiting, () => {
  nextTick(() => {
    const container = scrollContainer.value
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  })
})
</script>

<style scoped>
.fluid-chat {
  width: min(380px, 100%);
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 14px 16px;
  color: #dde0ff;
  font-size: 0.9rem;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.api-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(221, 224, 255, 0.7);
}

.api-input {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 6px 8px;
  color: #dde0ff;
  font-size: 0.85rem;
}

.api-input:focus {
  outline: none;
  border-color: rgba(142, 155, 255, 0.7);
}

.history {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 8px 10px;
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-state {
  font-size: 0.8rem;
  color: rgba(221, 224, 255, 0.6);
}

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message.user {
  align-items: flex-end;
}

.user-chip {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 6px 10px;
  max-width: 100%;
}

.user-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.assistant-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.assistant-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tool-chip {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 0.7rem;
  color: rgba(221, 224, 255, 0.85);
}

.thinking {
  font-size: 0.8rem;
  color: rgba(221, 224, 255, 0.7);
}

.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.composer-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 6px 8px;
  color: #dde0ff;
  font-size: 0.85rem;
  resize: vertical;
  min-height: 54px;
  max-height: 120px;
}

.composer-input:focus {
  outline: none;
  border-color: rgba(142, 155, 255, 0.7);
}

.send-button {
  background: rgba(255, 255, 255, 0.14);
  color: #dde0ff;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 6px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.send-button:disabled {
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(221, 224, 255, 0.4);
}

.send-button:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.22);
}

.error {
  color: #ff9aa2;
  font-size: 0.8rem;
}
</style>
