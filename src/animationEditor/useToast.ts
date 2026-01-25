/**
 * Toast notification composable
 */

import { ref } from 'vue'
import type { Toast, ToastType } from './types'
import { TOAST_DURATION, TOAST_MAX_VISIBLE } from './constants'

let toastIdCounter = 0

function generateToastId(): string {
  return `toast_${++toastIdCounter}`
}

// Global toast state (singleton)
const toasts = ref<Toast[]>([])

export function useToast() {
  function addToast(message: string, type: ToastType = 'info', duration?: number) {
    const id = generateToastId()
    const toast: Toast = {
      id,
      message,
      type,
      duration: duration ?? TOAST_DURATION,
    }

    toasts.value.push(toast)

    // Limit visible toasts
    if (toasts.value.length > TOAST_MAX_VISIBLE) {
      toasts.value.shift()
    }

    // Auto-remove after duration
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, toast.duration)
    }

    return id
  }

  function removeToast(id: string) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) {
      toasts.value.splice(idx, 1)
    }
  }

  function info(message: string, duration?: number) {
    return addToast(message, 'info', duration)
  }

  function warning(message: string, duration?: number) {
    return addToast(message, 'warning', duration)
  }

  function error(message: string, duration?: number) {
    return addToast(message, 'error', duration)
  }

  function success(message: string, duration?: number) {
    return addToast(message, 'success', duration)
  }

  return {
    toasts,
    addToast,
    removeToast,
    info,
    warning,
    error,
    success,
  }
}
