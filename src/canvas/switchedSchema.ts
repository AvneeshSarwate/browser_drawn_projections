/**
 * switchedSchema.ts - Conditional Field Schemas for Zod 4
 *
 * PROBLEM THIS SOLVES:
 * --------------------
 * Sometimes you want a schema where certain fields only appear based on the value
 * of another field (the "discriminator"). For example:
 *
 *   { fillAnim: 'dropAndScroll', textInd: 0, minCharsDrop: 5 }  // minCharsDrop only for dropAndScroll
 *   { fillAnim: 'matterExplode', textInd: 0 }                   // no extra fields for matterExplode
 *
 * Zod provides `z.discriminatedUnion()` for this, but it has limitations:
 *   1. It doesn't expose all possible fields for UI generation (each variant is separate)
 *   2. It requires the discriminator field to be present before applying defaults
 *
 * WHY THIS CUSTOM SOLUTION:
 * -------------------------
 * We need a schema that:
 *   1. Validates correctly (only allows fields valid for the current discriminator value)
 *   2. Exposes ALL possible fields (from all variants) for automatic UI generation
 *   3. Provides metadata so the UI knows which fields to show/hide based on discriminator
 *   4. Supports `schema.parse({})` to get default values (for auto-populating new entities)
 *
 * HOW IT WORKS:
 * -------------
 * switchedSchema creates a hybrid schema that combines two approaches:
 *
 *   1. VALIDATION: Uses a discriminatedUnion internally for strict validation
 *      - Ensures only fields valid for the current variant are accepted
 *      - e.g., rejects { fillAnim: 'matterExplode', minCharsDrop: 5 }
 *
 *   2. TYPE/UI SHAPE: Returns a ZodObject with ALL fields (base + all variants)
 *      - Variant-specific fields are marked optional
 *      - Allows UI to introspect all possible fields via schema.shape
 *      - Attaches _switchMeta for UI to know which fields belong to which variant
 *
 *   3. DEFAULTS HANDLING: Pre-processes input through base schema before validation
 *      - discriminatedUnion requires the discriminator to be present before validation
 *      - We first apply base schema defaults (including the discriminator's default)
 *      - Then pass the result to the discriminatedUnion validator
 *
 * USAGE EXAMPLE:
 * --------------
 *   const schema = switchedSchema(
 *     z.object({
 *       fillAnim: z.enum(['dropAndScroll', 'matterExplode']).default('dropAndScroll'),
 *       textInd: z.number().default(0)
 *     }),
 *     'fillAnim',  // The discriminator field
 *     {
 *       dropAndScroll: { minCharsDrop: z.number().optional() },  // Extra fields for this variant
 *       matterExplode: {}                                         // No extra fields
 *     }
 *   )
 *
 *   schema.parse({})                    // { fillAnim: 'dropAndScroll', textInd: 0 }
 *   schema.parse({ fillAnim: 'matterExplode', textInd: 1 })  // Valid
 *   schema.parse({ fillAnim: 'matterExplode', minCharsDrop: 5 })  // Error! minCharsDrop not allowed
 *
 *   // For UI generation:
 *   schema.shape                        // Has all fields: fillAnim, textInd, minCharsDrop
 *   schema._switchMeta.variants         // { dropAndScroll: {...}, matterExplode: {} }
 *
 * ZOD 4 NOTES:
 * ------------
 * - Enum values accessed via `_def.entries` (not `_def.values` like Zod 3)
 * - Default wrappers use `_def.type === 'default'` with `_def.innerType` for unwrapping
 * - discriminatedUnion API unchanged from Zod 3
 */

import { z, ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Type Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a ZodRawShape (record of field name -> Zod schema) to its inferred TypeScript type.
 * Example: { name: z.string(), age: z.number() } -> { name: string, age: number }
 */
type ShapeToType<S extends ZodRawShape> = {
  [K in keyof S]: z.infer<S[K]>
}

/**
 * Utility type that converts a union to an intersection.
 * Used to merge all variant shapes into one combined shape.
 * Example: { a: number } | { b: string } -> { a: number } & { b: string }
 */
type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

/**
 * Merges all variant shapes into a single shape containing all fields.
 * Example: { dropAndScroll: { minChars: z.number() }, matterExplode: {} }
 *       -> { minChars: z.number() }
 */
type AllVariantShape<TVariants extends Record<string, ZodRawShape>> =
  UnionToIntersection<TVariants[keyof TVariants]> extends infer R extends ZodRawShape
    ? R
    : {}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata Types (attached to schema for UI introspection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata attached to switched schemas for runtime introspection.
 * Used by UI components to determine which fields to show/hide.
 */
export type SwitchMeta<
  TBaseShape extends ZodRawShape = ZodRawShape,
  TSwitchKey extends string = string,
  TVariants extends Record<string, ZodRawShape> = Record<string, ZodRawShape>
> = {
  switchKey: TSwitchKey           // The field name that controls which variant is active
  variants: TVariants             // Map of enum value -> extra fields for that variant
  baseShape: TBaseShape           // The original base schema's shape (for reference)
}

/**
 * The return type of switchedSchema() - a ZodObject with _switchMeta attached.
 * The shape includes base fields + all variant fields (variant fields as optional).
 */
export type SwitchedZodObject<
  TBaseShape extends ZodRawShape = ZodRawShape,
  TSwitchKey extends string = string,
  TVariants extends Record<string, ZodRawShape> = Record<string, ZodRawShape>
> = ZodObject<TBaseShape & AllVariantShape<TVariants>> & {
  _switchMeta: SwitchMeta<TBaseShape, TSwitchKey, TVariants>
}

// ─────────────────────────────────────────────────────────────────────────────
// InferFlat - Type inference helper for external use
// ─────────────────────────────────────────────────────────────────────────────

type AnySwitched = ZodObject<any> & { _switchMeta: SwitchMeta<any, any, any> | null }

/**
 * Infers a "flat" TypeScript type from a schema where all fields are optional.
 * For switched schemas, this includes base fields + all variant fields.
 * Useful for typing partial/draft data before validation.
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
// Main Function: switchedSchema
// ─────────────────────────────────────────────────────────────────────────────

// Overload: Simple case - no conditional fields, just wraps schema with null metadata
export function switchedSchema<TBaseShape extends ZodRawShape>(
  baseSchema: ZodObject<TBaseShape>
): ZodObject<TBaseShape> & { _switchMeta: null }

// Overload: With conditional fields based on discriminator
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
  // ─────────────────────────────────────────────────────────────────────────
  // Simple case: No switching, just attach null metadata and return as-is
  // ─────────────────────────────────────────────────────────────────────────
  if (!switchKey || !variants) {
    const result = baseSchema as any
    result._switchMeta = null
    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Extract and validate the discriminator field from base schema
  // ─────────────────────────────────────────────────────────────────────────
  const baseShape = { ...baseSchema.shape } as Record<string, ZodTypeAny>
  let switchEnumSchema = baseShape[switchKey]

  // If the discriminator has a .default() wrapper, unwrap to get the underlying enum
  // Zod 4 structure: z.string().default('x') -> { _def: { type: 'default', innerType: <original> } }
  let defType = (switchEnumSchema as any)?._def?.type
  if (defType === 'default') {
    switchEnumSchema = (switchEnumSchema as any)._def.innerType
    defType = (switchEnumSchema as any)?._def?.type
  }

  // Verify the discriminator is a z.enum()
  if (!switchEnumSchema || defType !== 'enum') {
    throw new Error(`switchedSchema: "${switchKey}" must be a z.enum() field in the base schema`)
  }

  // Extract enum values (Zod 4 uses 'entries' property)
  const enumEntries = (switchEnumSchema as any)._def?.entries
  const enumValues: string[] = enumEntries
    ? (Array.isArray(enumEntries) ? enumEntries : Object.keys(enumEntries))
    : []

  if (enumValues.length === 0) {
    throw new Error(`switchedSchema: "${switchKey}" enum has no values`)
  }

  // Ensure every enum value has a corresponding variant definition
  for (const val of enumValues) {
    if (!(val in variants)) {
      throw new Error(`switchedSchema: missing variant definition for: ${val}`)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build the discriminatedUnion validator
  // This enforces that only fields valid for the active variant are present
  // ─────────────────────────────────────────────────────────────────────────
  const options = enumValues.map((val) =>
    z.object({
      ...baseShape,
      [switchKey]: z.literal(val),  // Lock this variant to this specific enum value
      ...(variants[val] ?? {})       // Add variant-specific fields
    })
  )

  const validator = z.discriminatedUnion(switchKey as any, options as any)

  // ─────────────────────────────────────────────────────────────────────────
  // Build the combined shape for UI introspection
  // This includes ALL fields from ALL variants (variant fields marked optional)
  // ─────────────────────────────────────────────────────────────────────────
  const allVariantFields: Record<string, ZodTypeAny> = {}
  Object.values(variants).forEach(variantShape => {
    Object.entries(variantShape).forEach(([key, schema]) => {
      if (!(key in allVariantFields)) {
        // Mark variant fields as optional since they don't apply to all variants
        allVariantFields[key] = (schema as ZodTypeAny).optional()
      }
    })
  })

  const combinedShape = { ...baseShape, ...allVariantFields }
  const resultSchema = z.object(combinedShape) as any

  // Attach metadata for UI introspection
  resultSchema._switchMeta = {
    switchKey,
    variants,
    baseShape
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Override parse/safeParse to handle defaults correctly
  //
  // PROBLEM: discriminatedUnion requires the discriminator field to be present
  // BEFORE it can route to the correct variant and apply that variant's defaults.
  // So `schema.parse({})` fails because there's no discriminator to match against.
  //
  // SOLUTION: First parse through the base schema to apply its defaults
  // (including the discriminator's default), then validate with discriminatedUnion.
  // ─────────────────────────────────────────────────────────────────────────
  // Preserve variant fields while applying base defaults.
  // Zod object parsing strips unknown keys by default, so if we only parse with baseSchema
  // we would drop variant-specific fields (e.g., melodyMap.column) before the discriminated
  // union runs. That silently rewrites metadata back to defaults on every validation.
  // Using passthrough keeps extra keys intact while still applying base defaults, then the
  // union validator enforces the correct variant shape.
  const baseDefaultsSchema = baseSchema.passthrough()
  const applyBaseDefaults = (data: unknown) => {
    if (typeof data !== 'object' || data === null) return data
    const baseResult = baseDefaultsSchema.safeParse(data)
    return baseResult.success ? baseResult.data : data
  }

  resultSchema.safeParse = (data: unknown) => validator.safeParse(applyBaseDefaults(data))
  resultSchema.parse = (data: unknown) => validator.parse(applyBaseDefaults(data))

  return resultSchema
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Helpers for UI Components
// These help UI code inspect switched schemas to show/hide conditional fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard to check if a schema has switch metadata attached.
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
 * Get the field keys that are specific to a particular enum variant.
 * Used by UI to show only relevant fields for the current discriminator value.
 */
export function getVariantFields(meta: SwitchMeta, enumValue: string): string[] {
  const variantShape = meta.variants[enumValue]
  return variantShape ? Object.keys(variantShape) : []
}

/**
 * Get all possible variant field keys across all enum values.
 * Used by UI to know which fields are conditional (vs always shown).
 */
export function getAllVariantFields(meta: SwitchMeta): string[] {
  const allFields = new Set<string>()
  Object.values(meta.variants).forEach(shape => {
    Object.keys(shape).forEach(key => allFields.add(key))
  })
  return Array.from(allFields)
}

/**
 * Get the shared (base) field keys, excluding the discriminator itself.
 * These fields are always shown regardless of discriminator value.
 */
export function getSharedFields(meta: SwitchMeta): string[] {
  return Object.keys(meta.baseShape).filter(key => key !== meta.switchKey)
}
