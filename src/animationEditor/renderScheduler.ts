/**
 * Render Scheduler
 * Coalesces multiple invalidation requests into a single RAF frame
 */

export class RenderScheduler {
  private dirty: boolean = false
  private rafPending: boolean = false
  private subs: Set<() => void> = new Set()

  /**
   * Subscribe a callback to be called on each render frame
   * Returns an unsubscribe function
   */
  subscribe(fn: () => void): () => void {
    this.subs.add(fn)
    return () => {
      this.subs.delete(fn)
    }
  }

  /**
   * Mark the scheduler as dirty and schedule a render frame
   */
  invalidate(): void {
    this.dirty = true
    if (!this.rafPending) {
      this.rafPending = true
      requestAnimationFrame(() => this.frame())
    }
  }

  /**
   * Internal: Execute all subscribers if dirty
   */
  private frame(): void {
    this.rafPending = false
    if (!this.dirty) return

    this.dirty = false
    for (const fn of this.subs) {
      fn()
    }
  }
}
