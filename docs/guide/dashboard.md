# The dashboard

The dashboard is a standalone page served by the Vite dev server at
**`/__apiMocks`**, for example `http://localhost:5173/__apiMocks`. It is where
overrides become active scenarios.

## Layout

- The **catalog** lists your overrides as a tree that mirrors the folders under
  `src/mocks/overrides`. You can expand groups and search.
- The **Active** list holds the overrides currently in effect.

## Activating a scenario

1. Find an override in the catalog (expand folders, or use search).
2. Drag it into **Active**.
3. Reload or re-trigger the request in your app. The new response applies
   immediately.

## Configuring parameters

Click the **gear** button on an active row to open its parameters. Booleans are
checkboxes, strings are text fields, and strings with `options` are dropdowns.
Defaults come from the override's `params` declaration.

## Enabling, disabling, and removing

- The **checkbox** on an active row enables or disables that scenario. Disabled
  entries **stay in the list and keep their parameters**, so you can flip them
  back on later.
- To remove a scenario entirely, **drag the row back to the catalog**.

## Ordering matters

Active overrides run **from top to bottom**. Each one receives the response
produced by the ones above it. Drag rows to reorder.

A concrete example, using two overrides that both patch `GET /api/demo`:

```ts [overrides/sequence/first.ts]
export default defineMockOverride({
  name: 'Append A',
  override: () => ({
    'GET /api/demo': body => ({ ...body, sequence: `${body?.sequence ?? ''}A` }),
  }),
});
```

```ts [overrides/sequence/second.ts]
export default defineMockOverride({
  name: 'Append B',
  override: () => ({
    'GET /api/demo': body => ({ ...body, sequence: `${body?.sequence ?? ''}B` }),
  }),
});
```

| Active order           | `GET /api/demo` → `sequence` |
| ---------------------- | ---------------------------- |
| Append A, then Append B | `"AB"`                      |
| Append B, then Append A | `"BA"`                      |
| Only Append A          | `"A"`                        |

Real-life version: put "Slow response" above "Server error" or the other way
round, and combine them with an "Admin user" scenario. Order decides who sees
whose output.

## Keyboard support

Drag handles are keyboard accessible:

1. Focus a row.
2. **Space** picks it up.
3. **Arrow keys** move it.
4. **Space** drops it.
5. **Escape** cancels the drag.

## Saved state

The active list, including order, enabled flags, and parameters, is saved to
**`.mock-overrides.json`** in the Vite root and restored when the dev server
starts.

Decide what the file means for your team:

- **Personal settings:** add it to `.gitignore`.
- **A shared preset:** commit it, so everyone starts with the same scenario.

You can rename the file, or turn persistence off, with the `stateFile` option. See
[Configuration](/reference/configuration).

::: tip
Saved dashboard state applies only to the dev server. [Tests](/testing/overview)
never read it.
:::

## Next

Overrides have more tools than "replace" and "spread the body". See
[Modifying responses](/guide/modifiers).
