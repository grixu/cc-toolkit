// The 31 change-type questions as they stood before the presence/character split and the intent request,
// kept so --variant v2 can re-ask them against the current labels.
export const V2_TYPES = {
  new_functionality: {
    instructions:
      '`diff` adds a capability that did not exist before, such as a new endpoint, page, component, job, command or module that callers or users can reach.',
  },
  behavior_change: {
    instructions: '`diff` changes what existing code does when it runs, including fixes to wrong conditions, values or crash paths.',
    criteria: {
      true: 'Existing logic now gives a different result, follows a different flow or uses different defaults, or a defect in it is fixed.',
      false:
        'Existing logic gives the same results as before; the diff adds new code, tests, docs or configuration, or restructures code without changing its results.',
    },
  },
  refactor: {
    instructions:
      '`diff` restructures existing code, such as extracting, deduplicating, inlining or moving logic, replacing literals with constants or tightening types.',
  },
  rename_or_move: {
    instructions: '`diff` renames or relocates files, directories, symbols, routes or keys and updates their references.',
  },
  code_removal: { instructions: '`diff` deletes functionality, endpoints, UI sections, files or dead code.' },
  error_handling_and_validation: {
    instructions: '`diff` changes how inputs are validated or how failures are detected, reported or recovered from.',
  },
  data_access: {
    instructions:
      '`diff` changes code that reads or writes persistent storage, such as queries, repositories, ORM calls, cache keys, or file and bucket I/O.',
  },
  schema_or_data_migration: {
    instructions: '`diff` changes a storage schema definition, a migration, or a backfill that rewrites stored data.',
  },
  api_contract: {
    instructions:
      '`diff` changes an interface other code consumes, such as endpoint paths or methods, request or response shapes, status codes, exported types or functions, or event payloads.',
    criteria: {
      true: 'Paths, methods, fields, types, signatures or payloads that callers rely on are added, removed or changed.',
      false: 'Callers see the same paths, fields, types and signatures; the change is in the implementation behind them.',
    },
  },
  authorization: {
    instructions:
      '`diff` changes who may do what, such as permission checks, roles, access policies, guards or access grants in infrastructure.',
  },
  authentication: {
    instructions:
      '`diff` changes how users or services sign in or prove their identity, such as login flows, sessions, token verification or identity federation.',
  },
  secret_handling: {
    instructions: '`diff` changes how credentials, keys, tokens or other secrets are issued, stored, rotated or redacted.',
    criteria: {
      true: 'Creates, moves, rotates, stores or redacts a credential, key, token or secret, or changes where one is kept.',
      false:
        'Reads an existing environment variable or secret the same way as before, or adds a configuration value that is not a credential.',
    },
  },
  ui_components: {
    instructions:
      '`diff` changes the structure of user-interface components or templates, such as markup, layout, component props or slots, or user-facing text.',
  },
  ui_interactions: {
    instructions:
      '`diff` changes how the user interface responds to the user, such as event handlers, client-side state, forms, navigation, or loading and error states.',
  },
  visual_styling: {
    instructions: '`diff` changes visual presentation, such as CSS, style classes, colours, spacing, sizing, icons or design tokens.',
  },
  unit_or_integration_tests: {
    instructions: '`diff` adds or changes unit or integration tests, their helpers, fixtures or runner configuration.',
  },
  e2e_tests: {
    instructions:
      '`diff` adds or changes end-to-end tests that drive the application through its UI or public API, including page objects and their fixtures.',
  },
  performance_tests: { instructions: '`diff` adds or changes load, stress or benchmark tests.' },
  infrastructure_tests: {
    instructions:
      '`diff` adds or changes tests of infrastructure code, access policies or deployed environments, such as policy tests, infrastructure-as-code tests or smoke checks.',
  },
  dependency_version_update: {
    instructions:
      '`diff` changes the version of a dependency that already exists, such as a package version, runtime version file, base image tag, pinned CI action or submodule pointer.',
  },
  dependency_added_or_removed: { instructions: '`diff` adds a third-party dependency to a manifest or removes one from it.' },
  ci_cd_pipeline: {
    instructions:
      '`diff` changes CI/CD pipeline definitions, such as workflow files, reusable actions, jobs, triggers, steps, caching or pipeline permissions.',
  },
  build_and_dev_tooling: {
    instructions:
      '`diff` changes how code is built, linted, type-checked, bundled or run locally, such as compiler or bundler config, monorepo task config, package scripts or developer scripts.',
  },
  cloud_infrastructure: {
    instructions: '`diff` changes cloud resources declared as code, such as networks, databases, queues, buckets, IAM bindings or DNS records.',
  },
  runtime_environment: {
    instructions:
      '`diff` changes how or where the application process runs, such as a container image, compose file, Kubernetes or Helm manifest, resource limits, replicas or health checks.',
  },
  configuration: {
    instructions:
      '`diff` changes runtime configuration of the application, such as config values and defaults, environment variables, config schemas or feature flags.',
  },
  observability: { instructions: '`diff` adds or changes logging, metrics, tracing, monitors, alerts or dashboards.' },
  generated_artifacts: {
    instructions: '`diff` includes machine-generated output, such as API specs or generated clients and types.',
    criteria: {
      true: 'A changed file carries a generated-code header or is the output of a code generator run from a spec or schema.',
      false: 'Every changed file is written by hand.',
    },
  },
  documentation: {
    instructions:
      '`diff` changes documentation for people, such as READMEs, guides, decision records, specs, runbooks or diagrams.',
  },
  ai_assistant_instructions: {
    instructions: '`diff` changes instructions, prompts, rules, skills or settings for AI coding assistants or LLM agents.',
  },
  release_metadata: {
    instructions: "`diff` changes release bookkeeping, such as changesets, changelog entries or the project's own version number.",
  },
}
