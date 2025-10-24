import { MIDIVal, MIDIValOutput } from '@midival/core'

export interface MIDIDevice {
  id: string
  name: string
}

export class MIDIManager {
  private midiOutput: MIDIValOutput | null = null
  private availableOutputs: MIDIDevice[] = []
  private selectedDeviceId: string | null = null
  private midiEnabled: boolean = false
  private midiAccess: any = null

  async initialize(): Promise<void> {
    try {
      this.midiAccess = await MIDIVal.connect()
      this.updateAvailableDevices()
    } catch (error) {
      console.error('Failed to initialize MIDI:', error)
      throw error
    }
  }

  private updateAvailableDevices(): void {
    if (!this.midiAccess?.outputs) return

    this.availableOutputs = Array.from(this.midiAccess.outputs).map((output: any) => ({
      id: output?.id || '',
      name: output?.name || 'Unknown Device'
    }))

    // If no device is selected and devices are available, select the first one
    const firstDevice = this.availableOutputs[0]
    if (!this.selectedDeviceId && firstDevice) {
      this.selectDevice(firstDevice.id)
    }
  }

  getAvailableDevices(): MIDIDevice[] {
    return this.availableOutputs
  }

  selectDevice(deviceId: string): void {
    if (!this.midiAccess?.outputs) return

    const device = Array.from(this.midiAccess.outputs).find((output: any) => output?.id === deviceId)
    if (device) {
      this.selectedDeviceId = deviceId
      this.midiOutput = new MIDIValOutput(device as any)
    }
  }

  getSelectedDeviceId(): string | null {
    return this.selectedDeviceId
  }

  setEnabled(enabled: boolean): void {
    this.midiEnabled = enabled
  }

  isEnabled(): boolean {
    return this.midiEnabled
  }

  sendNoteOn(pitch: number, velocity: number, channel: number = 0): void {
    if (!this.midiEnabled || !this.midiOutput) return

    try {
      // Convert velocity from 0-1 range to 0-127 MIDI range if needed
      const midiVelocity = velocity <= 1 ? Math.round(velocity * 127) : velocity
      this.midiOutput.sendNoteOn(pitch, Math.max(1, Math.min(127, midiVelocity)), channel)
    } catch (error) {
      console.error('Failed to send MIDI note on:', error)
    }
  }

  sendNoteOff(pitch: number, channel: number = 0): void {
    if (!this.midiEnabled || !this.midiOutput) return

    try {
      this.midiOutput.sendNoteOff(pitch, channel)
    } catch (error) {
      console.error('Failed to send MIDI note off:', error)
    }
  }

  disconnect(): void {
    // MIDIValOutput doesn't have a disconnect method in the current version
    // Just clear the reference
    this.midiOutput = null
  }
}
