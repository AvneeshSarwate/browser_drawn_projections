<template>
  <div class="fluid-chat">
    <div class="api-header" @click="toggleApiKeyExpanded">
      <span class="api-caret" :class="{ expanded: apiKeyExpanded }">▼</span>
      <label class="api-label">Anthropic API Key</label>
      <span class="api-status" :class="{ 'has-key': hasApiKey }">
        {{ hasApiKey ? '✓' : 'MISSING' }}
      </span>
    </div>
    <input
      v-if="apiKeyExpanded"
      id="fluid-chat-api-key"
      v-model="apiKey"
      type="password"
      autocomplete="off"
      placeholder="sk-ant-..."
      class="api-input"
    />
    <div v-if="showApiKeyWarning && apiKeyExpanded" class="alert alert-warning warning">
      <span class="warning-icon">⚠️</span>
      <div class="warning-content">
        <strong>Security Warning:</strong> This API key is exposed in your browser. 
        Use a limited, revocable key. Never use production keys.
        <a href="#" @click.prevent="showSecurityModal = true" class="learn-more-link">Click here to learn more</a>
        <button @click="showApiKeyWarning = false" class="btn btn-ghost dismiss-btn">Dismiss</button>
      </div>
    </div>

    <!-- Security Modal -->
    <div v-if="showSecurityModal" class="modal-overlay" @click="showSecurityModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>⚠️ Important notice about your API key</h2>
          <button @click="showSecurityModal = false" class="btn btn-ghost modal-close">×</button>
        </div>
        <div class="modal-body">
          <section>
            <h3>Where your key lives:</h3>
            <p>This app runs entirely in your browser. Your API key is kept in memory only and is not saved to localStorage, cookies, or our servers. When you close or refresh the page, the key is discarded.</p>
          </section>

          <section>
            <h3>What that still means in practice:</h3>
            <p>Even without storage, a key used in the browser can be exposed in several ways:</p>
            <ul>
              <li><strong>Browser extensions</strong> – Any extension with permission to run on this page can read the DOM, intercept network requests, or capture keystrokes. Malicious or over-permissive extensions can exfiltrate your key and chat data.</li>
              <li><strong>Developer tools & logs</strong> – Authorization headers and request bodies may be visible in the Network tab. Copy/paste history, crash reports, debugging overlays, or third-party analytics/debug scripts could capture sensitive data.</li>
              <li><strong>Clipboard & screenshots</strong> – Some clipboard managers keep history; screen recorders or "share your screen" sessions can reveal the key or responses.</li>
              <li><strong>Malware or shared devices</strong> – Keyloggers and remote-control tools can grab what you type. Anyone with access to your machine or account profile could view active sessions.</li>
              <li><strong>Third-party scripts</strong> – If you enable content blockers or load-helper scripts, be aware that any third-party script running on the page could read page memory.</li>
              <li><strong>Network visibility</strong> – We use HTTPS, but corporate proxies, antivirus, or traffic-capturing tools on your device/network could still inspect requests.</li>
              <li><strong>Usage risk</strong> – If your key leaks, someone else can spend your credits, hit your rate limits, or access models/features under your account until you revoke it.</li>
            </ul>
          </section>

          <section>
            <h3>How to reduce your risk (recommended):</h3>
            <ul>
              <li>
                <strong>Use a limited, revocable key:</strong>
                <p>Create a non-production key with the lowest possible permissions, strict quotas/spend caps, and model/endpoint allow-lists (if supported). Be ready to revoke it at any time.</p>
              </li>
              <li>
                <strong>Prefer a clean browser session:</strong>
                <p>Use a private/incognito window with extensions disabled. Don't save the key between sessions. Avoid pasting it into multiple tabs.</p>
              </li>
              <li>
                <strong>Keep it off the clipboard:</strong>
                <p>Paste once if needed, then clear it. Disable clipboard history managers while using the app.</p>
              </li>
              <li>
                <strong>Don't open DevTools while using the key:</strong>
                <p>This reduces the chance of accidental logging or copying of request data.</p>
              </li>
              <li>
                <strong>Verify the site:</strong>
                <p>Make sure you're on the correct domain (HTTPS lock icon, expected URL). Don't use the app from untrusted links or if your browser shows security warnings.</p>
              </li>
              <li>
                <strong>Rotate and monitor:</strong>
                <p>Rotate keys periodically, and keep an eye on your provider's usage/billing dashboard for unexpected spikes.</p>
              </li>
              <li>
                <strong>Prefer a server-side proxy for production:</strong>
                <p>For real projects, use a backend that keeps provider keys on the server and issues short-lived, scoped tokens to the browser. That's the only robust way to protect a production key.</p>
              </li>
            </ul>
          </section>

          <section>
            <h3>By proceeding, you acknowledge:</h3>
            <ul>
              <li>You understand your key is used client-side and may be visible to software on your device (including extensions) and in browser tools.</li>
              <li>You accept the risk of unintended exposure and potential charges if the key is leaked.</li>
              <li>You agree to use a limited, revocable, non-production key and to revoke it immediately if you suspect misuse.</li>
            </ul>
          </section>
        </div>
        <div class="modal-footer">
          <button @click="showSecurityModal = false" class="btn btn-primary modal-ok-btn">I understand</button>
        </div>
      </div>
    </div>

    <div class="history" ref="scrollContainer">
      <div v-if="messages.length === 0 && !isWaiting" class="empty-state">
        Ask Claude to read the current fluid settings or suggest adjustments.
      </div>
      <div
        v-for="(message, index) in messages"
        :key="`${message.timestamp}-${index}`"
        class="message"
        :class="message.role"
      >
        <div v-if="message.role === 'user'" class="user-block">
          <div class="user-chip">
            <span class="user-text">
              {{ message.text || (message.attachments?.length ? 'Screenshots attached' : '') }}
            </span>
          </div>
          <div v-if="message.attachments?.length" class="message-attachments">
            <div
              v-for="attachment in message.attachments"
              :key="attachment.id"
              class="message-attachment"
              :title="attachmentTooltip(attachment)"
            >
              <img :src="attachment.blobUrl" alt="" class="message-attachment-thumb" />
              <div class="message-attachment-meta">
                <span class="message-attachment-label">{{ attachment.label }}</span>
                <span class="message-attachment-mode">{{ debugLabel(attachment.debugMode) }}</span>
              </div>
              <span class="message-attachment-size">{{ formatSizeLabel(attachment.sizeBytes) }}</span>
            </div>
          </div>
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
      <div class="composer-row">
        <textarea
          v-model="userInput"
          rows="2"
          class="composer-input"
          placeholder="Ask Claude to tweak the fluid parameters…"
          @keydown.enter.exact.prevent="handleSend"
        ></textarea>
        <button type="submit" class="send-button" :disabled="isSendDisabled">Send</button>
      </div>

      <div class="attachment-section">
        <div class="attachment-header">
          <span class="attachment-title">Screenshots</span>
          <span class="attachment-count">{{ selectedScreenshots.length }} selected</span>
        </div>

        <div class="attachment-row">
          <select
            v-model="dropdownSelection"
            class="attachment-select"
            :disabled="!hasScreenshots || isWaiting"
          >
            <option value="" disabled>
              {{ hasScreenshots ? 'Select screenshot to attach' : 'No screenshots captured yet' }}
            </option>
            <option
              v-for="shot in screenshots"
              :key="shot.id"
              :value="shot.id"
              :disabled="selectedIdSet.has(shot.id)"
            >
              {{ formatOptionLabel(shot) }}
            </option>
          </select>
          <button
            type="button"
            class="attach-button"
            :disabled="isWaiting || !dropdownSelection || selectedIdSet.has(dropdownSelection)"
            @click="handleAttach"
          >
            Add
          </button>
          <button
            type="button"
            class="attach-button attach-button-secondary"
            :disabled="isWaiting || selectedScreenshots.length === 0"
            @click="clearSelection"
          >
            Clear
          </button>
        </div>

        <div class="attachment-meta">
          <span v-if="hasScreenshots">Captured {{ screenshots.length }} / {{ maxScreenshots }}</span>
          <span v-if="selectedScreenshots.length">Ready to send {{ selectedScreenshots.length }}</span>
        </div>

        <div v-if="!hasScreenshots" class="attachment-empty">
          Capture screenshots from the canvas to include them with your next message.
        </div>
        <div v-else-if="selectedScreenshots.length" class="selected-chips">
          <div
            v-for="shot in selectedScreenshots"
            :key="shot.id"
            class="screenshot-chip"
            :class="{ oversize: isOversize(shot) }"
            :title="chipTooltip(shot)"
          >
            <div class="chip-thumb">
              <img :src="shot.blobUrl" alt="" />
            </div>
            <div class="chip-body">
              <span class="chip-label">{{ shot.label }}</span>
              <span class="chip-debug">{{ debugLabel(shot.debugMode) }}</span>
            </div>
            <span class="chip-size">{{ formatSizeLabel(shot.sizeBytes) }}</span>
            <button
              type="button"
              class="chip-remove"
              @click="handleRemove(shot.id)"
              aria-label="Remove screenshot"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </form>

    <div v-if="combinedError" class="error">{{ combinedError }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import { appStateName, type FluidReactionAppState, type FluidDebugMode } from './appState'
import { createClaudeFluidChat } from './createClaudeFluidChat'
import { useScreenshotStore } from './useScreenshots'
import type { Screenshot, ScreenshotSummary } from './types/screenshot'

const state = inject<FluidReactionAppState>(appStateName)!!
const screenshotStore = useScreenshotStore()

const apiKey = ref('')
const apiKeyExpanded = ref(false)
const userInput = ref('')
const scrollContainer = ref<HTMLDivElement | null>(null)
const localError = ref<string | null>(null)
const dropdownSelection = ref<string>('')
const showApiKeyWarning = ref(true)
const showSecurityModal = ref(false)

const screenshots = computed(() => screenshotStore.screenshots.value)
const selectedScreenshots = computed(() => screenshotStore.selectedScreenshots.value)
const selectedIdSet = computed(() => screenshotStore.selectedIdSet.value)
const hasScreenshots = computed(() => screenshots.value.length > 0)
const maxScreenshots = screenshotStore.maxItems

const { messages, isWaiting, error, send } = createClaudeFluidChat({
  getFluidParams: () => state.fluidParams ?? [],
  getAttachments: () => screenshotStore.getSelected()
})

const hasApiKey = computed(() => apiKey.value.trim().length > 0)
const combinedError = computed(() => localError.value || error.value)
const isSendDisabled = computed(() => {
  const hasPrompt = userInput.value.trim().length > 0
  const hasAttachments = selectedScreenshots.value.length > 0
  if (!hasPrompt && !hasAttachments) {
    return true
  }
  return isWaiting.value
})

function toggleApiKeyExpanded() {
  apiKeyExpanded.value = !apiKeyExpanded.value
}

const debugModeLabels: Record<FluidDebugMode, string> = {
  dye: 'Dye',
  velocity: 'Velocity',
  divergence: 'Divergence',
  pressure: 'Pressure',
  splat: 'Splat',
  splatRaw: 'Splat Raw'
}

const SIZE_WARNING_BYTES = 1_000_000

function debugLabel(mode: FluidDebugMode): string {
  return debugModeLabels[mode] ?? mode
}

function formatSizeLabel(bytes: number): string {
  if (bytes <= 0) {
    return '0 KB'
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`
}

function formatDimensions(shot: Screenshot | ScreenshotSummary): string {
  return `${shot.width}x${shot.height}`
}

function formatTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatOptionLabel(shot: Screenshot): string {
  return `${shot.label} [${debugLabel(shot.debugMode)}] - ${formatDimensions(shot)} @ ${formatTimestamp(shot.createdAt)}`
}

function chipTooltip(shot: Screenshot): string {
  return `${shot.label} | ${debugLabel(shot.debugMode)} | ${formatDimensions(shot)} | ${formatSizeLabel(shot.sizeBytes)} | ${shot.mediaType}`
}

function attachmentTooltip(attachment: ScreenshotSummary): string {
  return `${attachment.label} | ${debugLabel(attachment.debugMode)} | ${formatDimensions(attachment)} | ${formatSizeLabel(attachment.sizeBytes)}`
}

function isOversize(shot: Screenshot): boolean {
  return shot.sizeBytes > SIZE_WARNING_BYTES
}

function chooseNextSelection(): void {
  const current = dropdownSelection.value
  const stillValid = current
    ? screenshots.value.some(s => s.id === current && !selectedIdSet.value.has(current))
    : false

  if (stillValid) {
    return
  }

  const next = screenshots.value.find(s => !selectedIdSet.value.has(s.id))
  dropdownSelection.value = next?.id ?? ''
}

function handleAttach(): void {
  const id = dropdownSelection.value
  if (!id || selectedIdSet.value.has(id)) {
    return
  }
  screenshotStore.toggleSelected(id)
  chooseNextSelection()
}

function handleRemove(id: string): void {
  if (!selectedIdSet.value.has(id)) {
    return
  }
  screenshotStore.toggleSelected(id)
  chooseNextSelection()
}

function clearSelection(): void {
  screenshotStore.clearSelection()
  chooseNextSelection()
}

watch(
  [
    () => screenshots.value.map(item => item.id).join(','),
    () => screenshotStore.selectedIds.value.join(',')
  ],
  () => {
    chooseNextSelection()
  },
  { immediate: true }
)

async function handleSend() {
  const prompt = userInput.value.trim()
  const hasAttachments = selectedScreenshots.value.length > 0

  if ((!prompt && !hasAttachments) || isWaiting.value) {
    return
  }

  const key = apiKey.value.trim()
  if (!key) {
    localError.value = 'Please provide an API key.'
    return
  }

  localError.value = null
  await send(key, prompt)
  if (!error.value) {
    userInput.value = ''
    if (hasAttachments) {
      clearSelection()
    }
  }
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
  width: 100%;
  height: 100%;
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

.api-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.api-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(221, 224, 255, 0.7);
}

.api-status {
  font-size: 0.7rem;
  color: #ff9aa2;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.api-status.has-key {
  color: #90ee90;
  font-size: 0.85rem;
}

.api-caret {
  font-size: 0.6rem;
  color: rgba(221, 224, 255, 0.6);
  transition: transform 0.2s ease;
}

.api-caret.expanded {
  transform: rotate(-180deg);
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
  flex: 1;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 8px 10px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  font-size: 0.8rem;
  color: rgba(221, 224, 255, 0.6);
}

.message {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message.user {
  align-items: flex-end;
}

.user-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  flex-direction: column;
  gap: 10px;
}

.composer-row {
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
  resize: none;
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

.attachment-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 10px 12px;
}

.attachment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(221, 224, 255, 0.72);
}

.attachment-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.attachment-select {
  flex: 1;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 6px 8px;
  color: #dde0ff;
  font-size: 0.8rem;
}

.attachment-select:disabled {
  opacity: 0.6;
}

.attach-button {
  background: rgba(255, 255, 255, 0.14);
  color: #dde0ff;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.attach-button:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.22);
}

.attach-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.attach-button-secondary {
  background: rgba(255, 255, 255, 0.08);
}

.attachment-meta {
  display: flex;
  gap: 12px;
  font-size: 0.72rem;
  color: rgba(221, 224, 255, 0.62);
}

.attachment-empty {
  font-size: 0.75rem;
  color: rgba(221, 224, 255, 0.55);
}

.selected-chips {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.screenshot-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 6px 8px;
}

.screenshot-chip.oversize {
  border-color: #ff9aa2;
}

.chip-thumb {
  width: 46px;
  height: 30px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.chip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chip-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chip-label {
  font-size: 0.82rem;
  color: #dde0ff;
}

.chip-debug {
  font-size: 0.7rem;
  color: rgba(221, 224, 255, 0.68);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.chip-size {
  margin-left: auto;
  font-size: 0.72rem;
  color: rgba(221, 224, 255, 0.65);
}

.chip-remove {
  background: transparent;
  border: none;
  color: rgba(221, 224, 255, 0.6);
  font-size: 0.95rem;
  cursor: pointer;
  padding: 2px 6px;
  transition: color 0.15s ease;
}

.chip-remove:hover {
  color: #ffb3ba;
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.message-attachment {
  width: 100px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-attachment-thumb {
  width: 100%;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
}

.message-attachment-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.7rem;
  color: rgba(221, 224, 255, 0.82);
}

.message-attachment-mode {
  font-size: 0.65rem;
  color: rgba(221, 224, 255, 0.65);
  text-transform: uppercase;
}

.message-attachment-size {
  font-size: 0.65rem;
  color: rgba(221, 224, 255, 0.6);
}

.error {
  color: #ff9aa2;
  font-size: 0.8rem;
}

.warning {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #856404;
  margin-top: 6px;
}

.warning-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
  line-height: 1.4;
}

.dismiss-btn {
  margin-left: 8px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid #856404;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #856404;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dismiss-btn:hover {
  background: #856404;
  color: #fff;
}

.learn-more-link {
  color: #856404;
  text-decoration: underline;
  cursor: pointer;
  margin-left: 6px;
  font-weight: 600;
}

.learn-more-link:hover {
  color: #664d03;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: #1a1d2e;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  color: #dde0ff;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #dde0ff;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 1.8rem;
  color: rgba(221, 224, 255, 0.6);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.15s ease;
}

.modal-close:hover {
  color: #dde0ff;
}

.modal-body {
  overflow-y: auto;
  padding: 18px 22px;
  font-size: 0.88rem;
  line-height: 1.6;
}

.modal-body section {
  margin-bottom: 20px;
}

.modal-body section:last-child {
  margin-bottom: 0;
}

.modal-body h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  color: #8e9bff;
}

.modal-body p {
  margin: 0 0 10px 0;
  color: rgba(221, 224, 255, 0.85);
}

.modal-body ul {
  margin: 8px 0;
  padding-left: 20px;
}

.modal-body li {
  margin-bottom: 8px;
  color: rgba(221, 224, 255, 0.85);
}

.modal-body strong {
  color: #dde0ff;
}

.modal-footer {
  padding: 14px 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  justify-content: flex-end;
}

.modal-ok-btn {
  background: rgba(142, 155, 255, 0.2);
  color: #dde0ff;
  border: 1px solid rgba(142, 155, 255, 0.4);
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-ok-btn:hover {
  background: rgba(142, 155, 255, 0.3);
  border-color: rgba(142, 155, 255, 0.6);
}
</style>
