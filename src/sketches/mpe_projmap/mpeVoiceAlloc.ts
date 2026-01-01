import type { MPEAnimBundle } from './mpeState'

/**
 * Allocate an MPE channel to a polygon.
 * Finds the first available polygon (one without an active voice).
 * If all polygons are busy and voiceSteal is true, steals the oldest voice.
 *
 * @returns The polygon ID that was allocated, or null if no allocation was possible.
 */
export function allocateVoice(
  channel: number,
  polygonIds: string[],
  channelToPolygon: Map<number, string>,
  bundles: Map<string, MPEAnimBundle>,
  voiceSteal: boolean
): string | null {
  // Find first polygon without an active voice
  for (const id of polygonIds) {
    const bundle = bundles.get(id)
    if (bundle && !bundle.voice) {
      channelToPolygon.set(channel, id)
      return id
    }
  }

  // Voice steal: take from the first polygon (oldest in iteration order)
  if (voiceSteal && polygonIds.length > 0) {
    const id = polygonIds[0]
    const oldBundle = bundles.get(id)
    if (oldBundle?.voice) {
      // Remove old channel mapping
      channelToPolygon.delete(oldBundle.voice.channel)
    }
    channelToPolygon.set(channel, id)
    return id
  }

  return null
}

/**
 * Release an MPE voice from its assigned polygon.
 *
 * @returns The polygon ID that was released, or null if the channel wasn't assigned.
 */
export function releaseVoice(
  channel: number,
  channelToPolygon: Map<number, string>
): string | null {
  const polygonId = channelToPolygon.get(channel)
  if (!polygonId) return null
  channelToPolygon.delete(channel)
  return polygonId
}
