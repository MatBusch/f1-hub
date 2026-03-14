# ADR 002: UI System

## Status

Accepted

## Decision

`f1-hub` uses:

- `shadcn/ui` for UI primitives
- Tailwind CSS v4
- CSS variables as the primary token and theming mechanism

## Why

This gives the project:

- a consistent component baseline
- accessible primitive patterns without inventing a component library from scratch
- a scalable token system for surfaces, states, and data-heavy views
- a clean path to product-wide theming without rewriting component internals

## Rules

1. Prefer `shadcn/ui` primitives and composition patterns for reusable UI.
2. Use Tailwind CSS v4 as the only utility framework.
3. Theme values should be expressed as CSS variables first.
4. Components should consume semantic tokens, not scattered hardcoded colors.
5. Inline styles should be limited to true data-driven rendering cases like chart coordinates or map positioning.

## Required Token Areas

- app background and foreground
- card and panel surfaces
- muted, accent, border, input, ring
- success, warning, destructive, info
- chart palette
- telemetry palette
- radius and layout values

## Consequences

- `apps/web` should initialize with Tailwind v4 and variable-based globals
- `packages/ui` should own reusable components and theme helpers
- future page work should not bypass the token layer unless there is a clear rendering reason
