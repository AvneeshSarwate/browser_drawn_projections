<script setup lang="ts">
import { useToast } from '../useToast'

const { toasts, removeToast } = useToast()

function getToastClass(type: string): string {
  return `toast toast-${type}`
}
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="getToastClass(toast.type)"
        @click="removeToast(toast.id)"
      >
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-family: system-ui, sans-serif;
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: 300px;
}

.toast-info {
  background: #3b82f6;
}

.toast-warning {
  background: #f59e0b;
  color: #000;
}

.toast-error {
  background: #ef4444;
}

.toast-success {
  background: #22c55e;
}

/* Transitions */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}
</style>
