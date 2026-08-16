# Versioned contracts

This directory contains the language-neutral artifacts produced by FO-03. They are the source
of truth for the application API, the internal solver API, and the shared scheduling rule
catalog.

## Layout

```text
contracts/
├── app-api/v1/openapi.json       Angular to NestJS API contract
├── solver-api/v1/openapi.json    NestJS to FastAPI API contract
├── shared/v1/components.json     Schemas shared by both APIs
├── rules/1.0.0/catalog.json      Scheduling rule catalog
├── rules/catalog.schema.json     Rule catalog JSON Schema
├── fixtures/v1/                  Versioned contract examples
└── manifest.json                 Published artifact versions and locations
```

OpenAPI 3.1 JSON documents are the source of truth for HTTP payloads. Runtime-specific
TypeScript and Python models must be derived from, or checked against, these documents rather
than becoming independent contract definitions.

The API major version is carried in its URL. Artifact and rule catalog versions use semantic
versioning independently. Published rule identifiers are never renamed or reused with a
different meaning.

## Scope

These files define contracts and examples only. Persistence, HTTP handlers, deterministic rule
evaluation, and CP-SAT modeling belong to the downstream tasks that consume FO-03.
