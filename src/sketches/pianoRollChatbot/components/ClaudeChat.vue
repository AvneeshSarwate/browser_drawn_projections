<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { createClaudeChat } from '../composables/useClaudeChat'
import type { NoteDataInput } from './pianoRoll/pianoRollState'
import type { TransformRegistry } from '../composables/useTransformRegistry'

interface Props {
  getNotes: () => NoteDataInput[]
  setNotes: (notes: NoteDataInput[]) => void
  getGrid: () => { maxLength: number; timeSignature: number; subdivision: number }
  registry?: TransformRegistry
}

const props = defineProps<Props>()

const chat = createClaudeChat({
  getNotes: props.getNotes,
  setNotes: props.setNotes,
  getGrid: props.getGrid,
  registry: props.registry
})

const apiKey = ref('')
const userInput = ref('')
const messagesContainer = ref<HTMLDivElement | null>(null)
const showApiKeyWarning = ref(true)
const showApiKey = ref(false)
const showSecurityModal = ref(false)

const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const handleSend = async () => {
  if (!userInput.value.trim() || chat.isWaiting.value) return
  
  const message = userInput.value
  userInput.value = ''
  
  await chat.send(message, apiKey.value)
  await scrollToBottom()
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}
</script>

<template>
  <div class="claude-chat">
    <div class="chat-header">
      <h3>AI Music Assistant</h3>
      <button 
        v-if="chat.messages.value.length > 0" 
        @click="chat.reset()" 
        class="btn btn-ghost reset-btn"
        :disabled="chat.isWaiting.value"
      >
        Clear Chat
      </button>
    </div>

    <div class="api-key-section">
      <div class="api-key-label-row">
        <label for="api-key">
          Claude API Key
          <span class="required">*</span>
        </label>
        <button 
          type="button"
          @click="showApiKey = !showApiKey" 
          class="btn btn-ghost toggle-visibility-btn"
        >
          {{ showApiKey ? '👁️ Hide' : '👁️‍🗨️ Show' }}
        </button>
      </div>
      <input
        id="api-key"
        v-model="apiKey"
        :type="showApiKey ? 'text' : 'password'"
        placeholder="sk-ant-..."
        class="input api-key-input"
        autocomplete="off"
        spellcheck="false"
      />
      <div v-if="showApiKeyWarning" class="alert alert-warning warning">
        <span class="warning-icon">⚠️</span>
        <div class="warning-content">
          <strong>Security Warning:</strong> This API key is exposed in your browser. 
          Use a limited, revocable key. Never use production keys.
          <a href="#" @click.prevent="showSecurityModal = true" class="learn-more-link">Click here to learn more</a>
          <button @click="showApiKeyWarning = false" class="btn btn-ghost dismiss-btn">Dismiss</button>
        </div>
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
          <button @click="showSecurityModal = false" class="btn btn-primary modal-ok-btn">I Understand</button>
        </div>
      </div>
    </div>

    <div class="messages-container" ref="messagesContainer">
      <div v-if="chat.messages.value.length === 0" class="empty-state">
        <p>👋 Ask me to create, modify, or analyze the music in your piano roll!</p>
        <div class="examples">
          <p><strong>Try:</strong></p>
          <ul>
            <li>"What notes are currently in the piano roll?"</li>
            <li>"Create a C major chord at beat 0"</li>
            <li>"Add a simple melody starting at beat 4"</li>
          </ul>
        </div>
      </div>

      <div
        v-for="(message, index) in chat.messages.value"
        :key="index"
        class="message"
        :class="message.role"
      >
        <div class="message-header">
          <span class="role-label">{{ message.role === 'user' ? 'You' : 'AI Assistant' }}</span>
          <span class="timestamp">{{ formatTime(message.timestamp) }}</span>
        </div>
        
        <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
          <div class="tool-call-header">🔧 Tools used:</div>
          <div v-for="(toolCall, idx) in message.toolCalls" :key="idx" class="tool-call">
            <span class="tool-name">{{ toolCall.displayName || toolCall.name }}</span>
            <span v-if="Object.keys(toolCall.input).length > 0" class="tool-params">
              ({{ Object.entries(toolCall.input)
                .filter(([k]) => !(toolCall.name === 'midi_notes' && k === 'notes'))
                .map(([k, v]) => `${k}: ${v}`).join(', ') }})
            </span>
          </div>
        </div>
        
        <div class="message-text">{{ message.text }}</div>
      </div>

      <div v-if="chat.isWaiting.value" class="message assistant waiting">
        <div class="message-header">
          <span class="role-label">AI Assistant</span>
        </div>
        <div class="message-text">
          <span class="loading-dots">Thinking</span>
        </div>
      </div>
    </div>

    <div v-if="chat.error.value" class="error-message">
      <strong>Error:</strong> {{ chat.error.value }}
    </div>

    <div class="input-container">
      <textarea
        v-model="userInput"
        @keydown="handleKeyDown"
        placeholder="Ask me to create or modify music..."
        class="textarea user-input"
        rows="2"
        :disabled="chat.isWaiting.value || !apiKey"
      ></textarea>
      <button
        @click="handleSend"
        class="btn btn-primary send-btn"
        :disabled="chat.isWaiting.value || !userInput.trim() || !apiKey"
      >
        Send
      </button>
    </div>
  </div>
</template>

<style scoped>
.claude-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  max-height: 600px;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 2px solid #e0e4f0;
}

.chat-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #303553;
}

.reset-btn {
  background: transparent;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reset-btn:hover:not(:disabled) {
  background: #f5f6f9;
  border-color: #999;
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.api-key-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-key-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.api-key-section label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4d5268;
}

.toggle-visibility-btn {
  background: transparent;
  border: 1px solid #d5d9e6;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-visibility-btn:hover {
  background: #f5f6f9;
  border-color: #999;
}

.required {
  color: #ff5b6c;
}

.api-key-input {
  padding: 8px 12px;
  border: 1px solid #d5d9e6;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: monospace;
  transition: border-color 0.15s ease;
}

.api-key-input:focus {
  outline: none;
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.1);
}

.warning {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #856404;
}

.warning-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.warning-content {
  flex: 1;
}

.dismiss-btn {
  margin-left: 8px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid #856404;
  border-radius: 4px;
  font-size: 0.8rem;
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
  margin-left: 8px;
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 2px solid #e0e4f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: #303553;
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 2rem;
  color: #666;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.modal-close:hover {
  background: #f5f6f9;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  line-height: 1.6;
}

.modal-body section {
  margin-bottom: 24px;
}

.modal-body section:last-child {
  margin-bottom: 0;
}

.modal-body h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: #303553;
  font-weight: 600;
}

.modal-body p {
  margin: 8px 0;
  color: #4d5268;
  font-size: 0.95rem;
}

.modal-body ul {
  margin: 8px 0;
  padding-left: 24px;
}

.modal-body li {
  margin: 12px 0;
  color: #4d5268;
  font-size: 0.95rem;
}

.modal-body li p {
  margin: 4px 0 0 0;
  color: #666;
  font-size: 0.9rem;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 2px solid #e0e4f0;
  display: flex;
  justify-content: flex-end;
}

.modal-ok-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, #4a6cf7, #667aff);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 4px 12px rgba(74, 108, 247, 0.2);
}

.modal-ok-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(74, 108, 247, 0.3);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 200px;
  max-height: 350px;
}

.empty-state {
  text-align: center;
  color: var(--c-text-muted);
  padding: 16px;
}

.empty-state p {
  margin: 0 0 16px 0;
  font-size: 1rem;
}

.examples {
  text-align: left;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border: 0;
}

.examples p {
  margin: 0 0 8px 0;
  font-weight: 600;
  color: #4d5268;
}

.examples ul {
  margin: 0;
  padding-left: 20px;
}

.examples li {
  margin: 6px 0;
  color: #666;
  font-size: 0.9rem;
}

.message {
  width: 100%;
  max-width: none;
  padding: 14px 16px;
  margin: 0;
  border-radius: 0;
  border: 0;
  animation: none;
}

.message.user,
.message.assistant {
  align-self: stretch;
}

.message.user {
  background: #111827;
  color: #fff;
  border-radius: 4px;
}

.message.assistant {
  background: var(--c-surface);
  color: var(--c-text);
}

.message + .message {
  border-top: 1px solid var(--c-border);
}

.message.waiting {
  opacity: 0.8;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  gap: 12px;
}

.role-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--c-text-muted);
  opacity: 0.6;
}

.message.user .role-label {
  color: rgba(255, 255, 255, 0.8);
}

.message.assistant .role-label {
  color: var(--c-accent);
}

.timestamp {
  font-size: 0.7rem;
  opacity: 0.6;
}

.message-text {
  font-size: 0.9rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.tool-calls {
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  font-size: 0.85rem;
}

.message.user .tool-calls {
  background: rgba(255, 255, 255, 0.06);
}

.tool-call-header {
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.9;
}

.tool-call {
  margin: 2px 0;
  padding-left: 8px;
}

.tool-name {
  font-weight: 600;
  font-family: monospace;
  color: var(--c-accent);
}

.message.user .tool-name {
  color: rgba(255, 255, 255, 0.95);
}

.tool-params {
  font-family: monospace;
  opacity: 0.8;
  margin-left: 4px;
}

.loading-dots::after {
  content: '...';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%, 20% {
    content: '.';
  }
  40% {
    content: '..';
  }
  60%, 100% {
    content: '...';
  }
}

.error-message {
  padding: 10px 12px;
  background: #ffe0e0;
  border: 1px solid #ff5b6c;
  border-radius: 8px;
  color: #d32f2f;
  font-size: 0.9rem;
}

.input-container {
  display: flex;
  gap: 8px;
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

.user-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--c-border);
  border-radius: 12px;
  font-size: 0.9rem;
  font-family: inherit;
  resize: none;
  background: var(--c-surface);
  box-shadow: none;
  transition: border-color 0.12s ease;
}

.user-input:focus {
  outline: none;
  border-color: var(--c-accent);
  box-shadow: none;
}

.user-input:disabled {
  background: #f3eee8;
  cursor: not-allowed;
}

.send-btn {
  padding: 10px 14px;
  background: var(--c-primary);
  border: 1px solid var(--c-primary);
  border-radius: 10px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
  box-shadow: none;
  white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
  background: var(--c-primary-600);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
