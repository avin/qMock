# Introduction

QMock is a Vite plugin that serves mock API responses during development, plus a
dashboard for changing those responses without touching code or restarting
anything. The same mock definitions can be used in your automated tests.

## The problem

Front-end work constantly runs into the same situations:

- The backend is not ready yet, or is not reachable from your machine.
- You need to see the error state, the empty state, or the "admin" variant of a
  screen, and the real backend will not produce them on demand.
- Your tests hit a real or shared mock server, and one test's setup leaks into
  another's.

Hard-coding fake data into components solves none of this cleanly. QMock gives
you a structured place to put it.

## The model

QMock has three ideas. Everything else in this documentation is detail on top of
them.

### 1. Handlers: the base API

A **handler** maps a route such as `GET /api/user` to a response. Together, your
handlers describe how the API behaves when everything is fine.

```ts
'GET /api/user': { id: 'demo', name: 'Demo User' }
```

### 2. Overrides: scenarios on top

An **override** is a small module that changes some of those responses: it
returns an error, changes a field, or adds a route. Overrides can have
**parameters** (a checkbox, a text field, a dropdown) so one file covers many
variations.

### 3. The active list: composing scenarios

In the dashboard you drag overrides into an **Active** list. They run **from top
to bottom**, and each receives the response produced by the previous one. Order
is the composition mechanism: "slow user" followed by "user with error" behaves
differently from the reverse.

```text
Base handler      →  { id: 'demo', name: 'Demo User' }
  + User profile  →  { id: 'demo', name: 'Taylor', role: 'admin' }
  + Force error   →  503 { error: 'Service unavailable' }
```

## Two places to use it

| Where                      | How scenarios are chosen                         | Persisted?                           |
| -------------------------- | ------------------------------------------------ | ------------------------------------ |
| **Development** (Vite)     | You pick them in the dashboard at `/__apiMocks`   | Saved to `.mock-overrides.json`      |
| **Tests** (Vitest, Playwright, Cypress) | Each test lists the overrides it needs | No. Every test starts from a clean slate |

Dashboard settings never leak into tests, and test scenarios never touch your
saved dashboard state.

## What QMock is not

- It is **development-only**. Mocks and the dashboard are not included in your
  production build and are not served by `vite preview`.
- It is **not a standalone mock server**. It runs inside Vite's dev server, or
  inside your test runner's process or browser context.
- It requires **Vite** and **Node.js 22.12 or newer**. QMock is ESM.

## How to read this documentation

The guide is meant to be read in order:

1. [Getting started](/guide/getting-started): install and make your first
   request.
2. [Handlers and routes](/guide/handlers): how routes are matched.
3. [Responses](/guide/responses): status codes, headers, text, and binary data.
4. [Overrides](/guide/overrides): scenarios and parameters.
5. [The dashboard](/guide/dashboard): activating, ordering, and saving them.
6. [Modifying responses](/guide/modifiers): the full set of things an override
   can do.
7. [Recipes](/guide/recipes): complete examples for common situations.

Then the [Testing](/testing/overview) section shows how to use everything you
built in automated tests.
