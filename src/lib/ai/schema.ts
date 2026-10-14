/**
 * The small JSON-Schema subset used to describe AI tool inputs. The same schema goes to the model
 * (MCP, Anthropic, OpenAI-compatible APIs) and validates what the model sends back – model output is
 * untrusted input like any file.
 */

export type JsonSchema =
  | { type: 'string'; description?: string; enum?: readonly string[] }
  | { type: 'number'; description?: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: JsonSchema; maxItems?: number }
  | {
      type: 'object'
      description?: string
      properties: Record<string, JsonSchema>
      required?: readonly string[]
      /** Free-form values (e.g. page properties): any JSON value per key. */
      additionalProperties?: boolean
    }
  | { description?: string; type?: undefined }

export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}

/** Throws {@link InputError} with a message the model can act on. */
export function validate(schema: JsonSchema, value: unknown, at = 'input'): void {
  switch (schema.type) {
    case undefined:
      return
    case 'string':
      if (typeof value !== 'string') throw new InputError(`${at} muss ein Text sein`)
      if (schema.enum && !schema.enum.includes(value))
        throw new InputError(`${at} muss einer von ${schema.enum.join(', ')} sein`)
      return
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new InputError(`${at} muss eine Zahl sein`)
      if (schema.minimum !== undefined && value < schema.minimum)
        throw new InputError(`${at} muss ≥ ${schema.minimum} sein`)
      if (schema.maximum !== undefined && value > schema.maximum)
        throw new InputError(`${at} muss ≤ ${schema.maximum} sein`)
      return
    case 'boolean':
      if (typeof value !== 'boolean') throw new InputError(`${at} muss true oder false sein`)
      return
    case 'array':
      if (!Array.isArray(value)) throw new InputError(`${at} muss eine Liste sein`)
      if (schema.maxItems !== undefined && value.length > schema.maxItems)
        throw new InputError(`${at} darf höchstens ${schema.maxItems} Einträge haben`)
      value.forEach((item, i) => validate(schema.items, item, `${at}[${i}]`))
      return
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new InputError(`${at} muss ein Objekt sein`)
      const record = value as Record<string, unknown>
      for (const key of schema.required ?? [])
        if (record[key] === undefined) throw new InputError(`${at}.${key} fehlt`)
      for (const [key, item] of Object.entries(record)) {
        const prop = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined
        if (prop) validate(prop, item, `${at}.${key}`)
        else if (!schema.additionalProperties) throw new InputError(`${at}.${key} ist unbekannt`)
      }
      return
    }
  }
}
