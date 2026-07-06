import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validate, loadAndValidate, assertValid } from "../scripts/lib/validate.mjs";

const HERE = import.meta.dirname;
const SCHEMAS = join(HERE, "..", "schemas");
const FIXTURES = join(HERE, "fixtures", "artifacts");

const schemaPath = (name) => join(SCHEMAS, `${name}.schema.json`);
const fixturePath = (name) => join(FIXTURES, name);
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// Helper: does any error target this exact path?
const hasPath = (errors, path) => errors.some((e) => e.path === path);
const messageAt = (errors, path) => errors.find((e) => e.path === path)?.message ?? "";

// --- Per-schema fixtures: one accepted, one rejected with a meaningful path ---

const cases = [
  {
    schema: "feature-lock",
    valid: "feature-lock.valid.json",
    invalid: "feature-lock.invalid-unknown-key.json",
    invalidPath: "tasks.T-001.unexpectedField",
    invalidNeedle: "unknown property",
  },
  {
    schema: "state",
    valid: "state.valid.json",
    invalid: "state.invalid-missing-required.json",
    invalidPath: "",
    invalidNeedle: "manifest",
  },
  {
    schema: "fd-config",
    valid: "fd-config.valid.json",
    invalid: "fd-config.invalid-enum.json",
    invalidPath: "storage.mode",
    invalidNeedle: "enum",
  },
  {
    schema: "sc-map",
    valid: "sc-map.valid.json",
    invalid: "sc-map.invalid-hash.json",
    invalidPath: "generatedFrom.tasksHash",
    invalidNeedle: "anyOf",
  },
  {
    schema: "ac-map",
    valid: "ac-map.valid.json",
    invalid: "ac-map.invalid-covers.json",
    invalidPath: "acs.AC-5.covers[0]",
    invalidNeedle: "pattern",
  },
  {
    schema: "sources-map",
    valid: "sources-map.valid.json",
    invalid: "sources-map.invalid-source-type.json",
    invalidPath: "records[0].source.type",
    invalidNeedle: "enum",
  },
  {
    schema: "bounded-contexts",
    valid: "bounded-contexts.valid.json",
    invalid: "bounded-contexts.invalid-missing-required.json",
    invalidPath: "boundedContexts[0]",
    invalidNeedle: "contextFile",
  },
];

for (const c of cases) {
  test(`${c.schema}: valid fixture is accepted`, () => {
    const schema = readJson(schemaPath(c.schema));
    const value = readJson(fixturePath(c.valid));
    const { valid, errors } = validate(value, schema);
    assert.equal(valid, true, `expected valid, got errors: ${JSON.stringify(errors)}`);
  });

  test(`${c.schema}: invalid fixture is rejected with a meaningful path`, () => {
    const schema = readJson(schemaPath(c.schema));
    const value = readJson(fixturePath(c.invalid));
    const { valid, errors } = validate(value, schema);
    assert.equal(valid, false);
    assert.ok(hasPath(errors, c.invalidPath), `expected an error at path "${c.invalidPath}", got ${JSON.stringify(errors)}`);
    assert.match(messageAt(errors, c.invalidPath), new RegExp(c.invalidNeedle));
  });
}

// --- storage.docs optionality (decoupled docs location) ---

test("fd-config: storage.docs present is accepted", () => {
  const schema = readJson(schemaPath("fd-config"));
  const value = readJson(fixturePath("fd-config.valid-docs.json"));
  const { valid, errors } = validate(value, schema);
  assert.equal(valid, true, `expected valid, got errors: ${JSON.stringify(errors)}`);
});

test("fd-config: storage.docs absent is accepted (optional block)", () => {
  const schema = readJson(schemaPath("fd-config"));
  const value = readJson(fixturePath("fd-config.valid.json"));
  assert.equal("docs" in value.storage, false, "fixture must exercise the docs-absent path");
  const { valid, errors } = validate(value, schema);
  assert.equal(valid, true, `expected valid, got errors: ${JSON.stringify(errors)}`);
});

test("fd-config: storage.docs bad contextMode enum is rejected", () => {
  const schema = readJson(schemaPath("fd-config"));
  const value = readJson(fixturePath("fd-config.invalid-docs-mode.json"));
  const { valid, errors } = validate(value, schema);
  assert.equal(valid, false);
  assert.ok(hasPath(errors, "storage.docs.contextMode"), JSON.stringify(errors));
  assert.match(messageAt(errors, "storage.docs.contextMode"), /enum/);
});

// --- loadAndValidate + assertValid ---

test("loadAndValidate: reads file, parses, validates", () => {
  const { valid, errors, value } = loadAndValidate(fixturePath("state.valid.json"), schemaPath("state"));
  assert.equal(valid, true, JSON.stringify(errors));
  assert.equal(value.slug, "user-onboarding");
});

test("loadAndValidate: malformed JSON reports a clear parse error, no throw", () => {
  const { valid, errors, value } = loadAndValidate(fixturePath("malformed.json"), schemaPath("state"));
  assert.equal(valid, false);
  assert.equal(value, undefined);
  assert.match(errors[0].message, /Cannot parse JSON/);
});

test("assertValid: throws with formatted errors on invalid, silent on valid", () => {
  const schema = readJson(schemaPath("state"));
  assert.doesNotThrow(() => assertValid(readJson(fixturePath("state.valid.json")), schema, "state"));
  assert.throws(
    () => assertValid(readJson(fixturePath("state.invalid-missing-required.json")), schema, "state.json"),
    /state\.json failed schema validation/,
  );
});

// --- Validator subset unit cases ---

test("patternProperties: matching key validated, non-matching key rejected", () => {
  const schema = {
    type: "object",
    patternProperties: { "^AB-[0-9]+$": { type: "integer" } },
    additionalProperties: false,
  };
  assert.equal(validate({ "AB-1": 2 }, schema).valid, true);
  assert.deepEqual(validate({ "AB-1": "x" }, schema).errors.map((e) => e.path), ["AB-1"]);
  assert.deepEqual(validate({ XY: 1 }, schema).errors.map((e) => e.path), ["XY"]);
});

test("local $ref resolves against $defs", () => {
  const schema = {
    $defs: { hash: { type: "string", pattern: "^sha256:" } },
    type: "object",
    required: ["a"],
    additionalProperties: false,
    properties: { a: { $ref: "#/$defs/hash" } },
  };
  assert.equal(validate({ a: "sha256:x" }, schema).valid, true);
  const bad = validate({ a: "nope" }, schema);
  assert.equal(bad.valid, false);
  assert.ok(hasPath(bad.errors, "a"));
});

test("anyOf: at least one branch must match (null branch convention)", () => {
  const schema = { anyOf: [{ type: "null" }, { type: "string", pattern: "^x" }] };
  assert.equal(validate(null, schema).valid, true);
  assert.equal(validate("xyz", schema).valid, true);
  assert.equal(validate("abc", schema).valid, false);
  assert.equal(validate(5, schema).valid, false);
});

test("nullable via type array: pattern applies to strings, null passes, wrong type fails", () => {
  const schema = { type: ["string", "null"], pattern: "^sha256:" };
  assert.equal(validate(null, schema).valid, true);
  assert.equal(validate("sha256:ok", schema).valid, true);
  assert.equal(validate("bad", schema).valid, false); // pattern
  assert.equal(validate(5, schema).valid, false); // type
});

test("nullable integer via type array honours minimum only for numbers", () => {
  const schema = { type: ["integer", "null"], minimum: 1 };
  assert.equal(validate(null, schema).valid, true);
  assert.equal(validate(5, schema).valid, true);
  assert.equal(validate(0, schema).valid, false);
  assert.equal(validate("x", schema).valid, false);
});

test("items validates each element with indexed path", () => {
  const schema = { type: "array", items: { type: "integer" } };
  assert.equal(validate([1, 2], schema).valid, true);
  const bad = validate([1, "a", 3], schema);
  assert.equal(bad.valid, false);
  assert.ok(hasPath(bad.errors, "[1]"));
});

test("nested error paths compose object and array segments", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      list: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["n"],
          properties: { n: { type: "integer" } },
        },
      },
    },
  };
  const bad = validate({ list: [{ n: 1 }, { n: "x" }] }, schema);
  assert.ok(hasPath(bad.errors, "list[1].n"), JSON.stringify(bad.errors));
  const missing = validate({ list: [{}] }, schema);
  assert.ok(hasPath(missing.errors, "list[0]"), JSON.stringify(missing.errors));
});

test("additionalProperties:false accounts for both properties and patternProperties", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: { a: {} },
    patternProperties: { "^p": {} },
  };
  assert.equal(validate({ a: 1, p1: 2 }, schema).valid, true);
  const bad = validate({ a: 1, other: 3 }, schema);
  assert.equal(bad.valid, false);
  assert.ok(hasPath(bad.errors, "other"));
});

test("const and enum", () => {
  assert.equal(validate(1, { const: 1 }).valid, true);
  assert.equal(validate(2, { const: 1 }).valid, false);
  assert.equal(validate("a", { enum: ["a", "b"] }).valid, true);
  assert.equal(validate("c", { enum: ["a", "b"] }).valid, false);
});

test("minItems, minimum, maximum", () => {
  assert.equal(validate([], { type: "array", minItems: 1 }).valid, false);
  assert.equal(validate([1], { type: "array", minItems: 1 }).valid, true);
  const range = { type: "integer", minimum: 1, maximum: 10 };
  assert.equal(validate(0, range).valid, false);
  assert.equal(validate(5, range).valid, true);
  assert.equal(validate(11, range).valid, false);
});

test("integer type rejects non-integral numbers; number accepts them", () => {
  assert.equal(validate(3.5, { type: "integer" }).valid, false);
  assert.equal(validate(3.5, { type: "number" }).valid, true);
  assert.equal(validate(4, { type: "number" }).valid, true);
});
