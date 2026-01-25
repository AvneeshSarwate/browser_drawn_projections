import { ref } from 'vue'

export type SliderPreset = {
  name: string
  values: number[]
}

export const sliderPresetsState = ref<SliderPreset[]>([])
export const selectedPresetNameState = ref<string>('')

export const setSliderPresetsState = (presets: SliderPreset[], selectFirst = true) => {
  sliderPresetsState.value = presets
  if (selectFirst) {
    selectedPresetNameState.value = presets[0]?.name ?? ''
  }
}
