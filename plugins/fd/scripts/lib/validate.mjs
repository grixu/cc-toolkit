import { readFileSync } from "node:fs";

// Dependency-free validator for the JSON-Schema subset the fd artifact family uses.
// Supported keywords: type (string or array — a "null" member expresses nullability),
// properties, required, additionalProperties (boolean only), patternProperties,
// items (single schema), enum, const, pattern, minimum, maximum, minItems, anyOf,
// and local $ref ("#/$defs/...") backed by $defs. Nothing else is honoured; a schema
// leaning on any other keyword is out of contract and will validate too permissively.

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value; // "string" | "boolean" | "object"
}

// "integer" is a number that happens to be integral; the reverse must also hold —
// an integral value satisfies a "number" type.
function typeMatches(value, name) {
  const t = jsonType(value);
  if (name === "number") return t === "integer" || t === "number";
  return t === name;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function joinPath(base, key) {
  return base ? `${base}.${key}` : key;
}

function resolveRef(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error(`Unsupported $ref (local "#/..." only): ${ref}`);
  }
  let node = root;
  for (const segment of ref.slice(2).split("/")) {
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node == null || typeof node !== "object" || !(key in node)) {
      throw new Error(`Unresolvable $ref: ${ref}`);
    }
    node = node[key];
  }
  return node;
}

function validateNode(value, schema, root, path, errors) {
  if (schema.$ref !== undefined) {
    validateNode(value, resolveRef(root, schema.$ref), root, path, errors);
    return;
  }

  if (schema.type !== undefined) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!names.some((n) => typeMatches(value, n))) {
      errors.push({ path, message: `expected type ${names.join(" | ")}, got ${jsonType(value)}` });
      return; // a type mismatch makes deeper keyword checks noise
    }
  }

  if (schema.anyOf !== undefined) {
    const ok = schema.anyOf.some((sub) => {
      const branch = [];
      validateNode(value, sub, root, path, branch);
      return branch.length === 0;
    });
    if (!ok) errors.push({ path, message: "does not match any schema in anyOf" });
  }

  if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(value, e))) {
    errors.push({ path, message: `value not in enum ${JSON.stringify(schema.enum)}` });
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push({ path, message: `value must equal ${JSON.stringify(schema.const)}` });
  }

  if (schema.pattern !== undefined && typeof value === "string") {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `string does not match pattern ${schema.pattern}` });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `must be >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `must be <= ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must have at least ${schema.minItems} items` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => validateNode(item, schema.items, root, `${path}[${i}]`, errors));
    }
  }

  if (jsonType(value) === "object") {
    if (schema.required !== undefined) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({ path, message: `missing required property "${key}"` });
        }
      }
    }
    const props = schema.properties ?? {};
    const patternProps = schema.patternProperties ?? {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = joinPath(path, key);
      let matched = false;
      if (key in props) {
        matched = true;
        validateNode(child, props[key], root, childPath, errors);
      }
      for (const [pattern, subSchema] of Object.entries(patternProps)) {
        if (new RegExp(pattern).test(key)) {
          matched = true;
          validateNode(child, subSchema, root, childPath, errors);
        }
      }
      if (!matched && schema.additionalProperties === false) {
        errors.push({ path: childPath, message: `unknown property "${key}"` });
      }
    }
  }
}

export function validate(value, schema) {
  const errors = [];
  validateNode(value, schema, schema, "", errors);
  return { valid: errors.length === 0, errors };
}

export function loadAndValidate(filePath, schemaPath) {
  let value;
  try {
    value = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    return { valid: false, errors: [{ path: "", message: `Cannot parse JSON at ${filePath}: ${err.message}` }], value: undefined };
  }
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const { valid, errors } = validate(value, schema);
  return { valid, errors, value };
}

export function assertValid(value, schema, label) {
  const { valid, errors } = validate(value, schema);
  if (!valid) {
    const lines = errors.map((e) => `  - ${e.path || "<root>"}: ${e.message}`).join("\n");
    throw new Error(`${label} failed schema validation:\n${lines}`);
  }
}
