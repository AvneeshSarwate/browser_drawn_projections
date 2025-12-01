import { z, ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Type helpers
// ─────────────────────────────────────────────────────────────────────────────

type ShapeToType<S extends ZodRawShape> = {
  [K in keyof S]: z.infer<S[K]>
}

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type AllVariantShape<TVariants extends Record<string, ZodRawShape>> =
  UnionToIntersection<TVariants[keyof TVariants]> extends infer R extends ZodRawShape
    ? R
    : {}

// ─────────────────────────────────────────────────────────────────────────────
// SwitchMeta and SwitchedZodObject with preserved generics
// ─────────────────────────────────────────────────────────────────────────────

export type SwitchMeta<
  TBaseShape extends ZodRawShape = ZodRawShape,
  TSwitchKey extends string = string,
  TVariants extends Record<string, ZodRawShape> = Record<string, ZodRawShape>
> = {
  switchKey: TSwitchKey
  variants: TVariants
  baseShape: TBaseShape
}

export type SwitchedZodObject<
  TBaseShape extends ZodRawShape = ZodRawShape,
  TSwitchKey extends string = string,
  TVariants extends Record<string, ZodRawShape> = Record<string, ZodRawShape>
> = ZodObject<TBaseShape & AllVariantShape<TVariants>> & {
  _switchMeta: SwitchMeta<TBaseShape, TSwitchKey, TVariants>
}

// ─────────────────────────────────────────────────────────────────────────────
// InferFlat utility type
// ─────────────────────────────────────────────────────────────────────────────

type AnySwitched = ZodObject<any> & { _switchMeta: SwitchMeta<any, any, any> | null }

/**
 * Infer a "flat" type from a schema with all fields optional.
 * For switched schemas: base fields + all variant fields, all optional.
 */
export type InferFlat<TSchema extends z.ZodTypeAny> =
  TSchema extends SwitchedZodObject<infer TBaseShape, any, infer TVariants>
    ? Partial<ShapeToType<TBaseShape & AllVariantShape<TVariants>>>
    : TSchema extends AnySwitched
      ? TSchema['_switchMeta'] extends SwitchMeta<infer TBaseShape, any, infer TVariants>
        ? Partial<ShapeToType<TBaseShape & AllVariantShape<TVariants>>>
        : Partial<z.infer<TSchema>>
      : Partial<z.infer<TSchema>>

// ─────────────────────────────────────────────────────────────────────────────
// switchedSchema function with overloads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a schema that supports conditional fields based on an enum value.
 * 
 * Simple usage (no switching):
 *   switchedSchema(z.object({ name: z.string() }))
 * 
 * With conditional fields:
 *   switchedSchema(
 *     z.object({
 *       fillAnim: z.enum(['dropAndScroll', 'matterExplode']),
 *       textInd: z.number()
 *     }),
 *     'fillAnim',
 *     {
 *       dropAndScroll: { minCharsDrop: z.number() },
 *       matterExplode: {}
 *     }
 *   )
 */

// Overload: no switching
export function switchedSchema<TBaseShape extends ZodRawShape>(
  baseSchema: ZodObject<TBaseShape>
): ZodObject<TBaseShape> & { _switchMeta: null }

// Overload: with switching
export function switchedSchema<
  TBaseShape extends ZodRawShape,
  TSwitchKey extends keyof TBaseShape & string,
  TVariants extends Record<string, ZodRawShape>
>(
  baseSchema: ZodObject<TBaseShape>,
  switchKey: TSwitchKey,
  variants: TVariants
): SwitchedZodObject<TBaseShape, TSwitchKey, TVariants>

// Implementation
export function switchedSchema(
  baseSchema: ZodObject<any>,
  switchKey?: string,
  variants?: Record<string, ZodRawShape>
): any {
  // Simple case - no switching, just attach null metadata
  if (!switchKey || !variants) {
    const result = baseSchema as any
    result._switchMeta = null
    return result
  }

  const baseShape = { ...baseSchema.shape } as Record<string, ZodTypeAny>
  const switchEnumSchema = baseShape[switchKey]

  // Check if the switch key field is a ZodEnum (Zod v4 uses _def.type === 'enum')
  const defType = (switchEnumSchema as any)?._def?.type
  if (!switchEnumSchema || defType !== 'enum') {
    throw new Error(`switchedSchema: "${switchKey}" must be a z.enum() field in the base schema`)
  }

  // Zod v4 uses 'entries' instead of 'values'
  const enumEntries = (switchEnumSchema as any)._def?.entries
  const enumValues: string[] = enumEntries 
    ? (Array.isArray(enumEntries) ? enumEntries : Object.keys(enumEntries))
    : []

  if (enumValues.length === 0) {
    throw new Error(`switchedSchema: "${switchKey}" enum has no values`)
  }

  // Validate that all enum values have corresponding variants
  for (const val of enumValues) {
    if (!(val in variants)) {
      throw new Error(`switchedSchema: missing variant definition for: ${val}`)
    }
  }

  // Build discriminated union options for validation
  const options = enumValues.map((val) =>
    z.object({
      ...baseShape,
      [switchKey]: z.literal(val),
      ...(variants[val] ?? {})
    })
  )

  const validator = z.discriminatedUnion(switchKey as any, options as any)

  // Build combined shape for the "widest" object (base + all variant fields as optional)
  const allVariantFields: Record<string, ZodTypeAny> = {}
  Object.values(variants).forEach(variantShape => {
    Object.entries(variantShape).forEach(([key, schema]) => {
      if (!(key in allVariantFields)) {
        allVariantFields[key] = (schema as ZodTypeAny).optional()
      }
    })
  })

  const combinedShape = { ...baseShape, ...allVariantFields }
  const resultSchema = z.object(combinedShape) as any

  // Attach metadata
  resultSchema._switchMeta = {
    switchKey,
    variants,
    baseShape
  }

  // Override parse methods to use discriminated union validation
  resultSchema.safeParse = (data: unknown) => validator.safeParse(data)
  resultSchema.parse = (data: unknown) => validator.parse(data)

  return resultSchema
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime helpers for UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to check if a schema has switch metadata
 */
export function hasSwitchMeta(schema: unknown): schema is SwitchedZodObject {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '_switchMeta' in schema &&
    (schema as any)._switchMeta !== null
  )
}

/**
 * Get the variant field keys for a specific enum value
 */
export function getVariantFields(meta: SwitchMeta, enumValue: string): string[] {
  const variantShape = meta.variants[enumValue]
  return variantShape ? Object.keys(variantShape) : []
}

/**
 * Get all possible variant field keys across all enum values
 */
export function getAllVariantFields(meta: SwitchMeta): string[] {
  const allFields = new Set<string>()
  Object.values(meta.variants).forEach(shape => {
    Object.keys(shape).forEach(key => allFields.add(key))
  })
  return Array.from(allFields)
}

/**
 * Get the shared (base) field keys, excluding the switch key
 */
export function getSharedFields(meta: SwitchMeta): string[] {
  return Object.keys(meta.baseShape).filter(key => key !== meta.switchKey)
}
