export type UniformDescriptorLike = {
  name: string
  kind: string
  bindingName: string
  default?: unknown
  ui?: {
    min?: number
    max?: number
    step?: number
  }
}

export type ShaderEffectLike = {
  id?: string
  effectName: string
  uniforms?: Record<string, unknown>
  getGraph?: () => ShaderGraphLike
  getUniformsMeta?: () => UniformDescriptorLike[]
  getUniformRuntime?: () => Record<string, any>
  setUniforms?: (uniforms: Record<string, unknown>) => void
}

export type ShaderGraphNodeLike = {
  id: string
  name: string
  ref: ShaderEffectLike
}

export type ShaderGraphEdgeLike = {
  from: string
  to: string
}

export type ShaderGraphLike = {
  nodes: ShaderGraphNodeLike[]
  edges: ShaderGraphEdgeLike[]
}

export type GraphNodeView = {
  id: string
  name: string
}

export type GraphEdgeView = {
  from: string
  to: string
}
