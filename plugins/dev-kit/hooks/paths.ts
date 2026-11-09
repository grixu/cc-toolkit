export const PROSE_FILE = /(^|\/)\.changeset\/|\.(md|mdx|markdown|txt|rst|adoc|mmd|mermaid|puml)$/i
export const AGENT_FILE = /(^|\/)(CLAUDE|AGENTS|SKILL)\.md$|(^|\/)\.(claude|cursor|github\/prompts)\/|(^|\/)(commands|agents|skills|rules)\/[^/]+\.mdx?$/i
export const TEST_FILE = /(^|\/)(__tests__|tests?|spec|e2e|e2e-[^/]+|__mocks__|mocks?|fixtures?|__fixtures__|page-?objects?|test-?utils|testing|cypress|playwright)\/|[._-](test|spec|stories)\.[^/]+$|(^|\/)(vitest|jest|playwright|cypress)\.(config|setup)[^/]*$/i
