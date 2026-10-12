# Modifying responses

Each entry in an override's returned object is a **route patch**. Patches come in
a few shapes, from "replace everything" to "tweak one field". This page explains
all of them.

## Patch types

| Patch                                     | Behavior                                                       |
| ----------------------------------------- | -------------------------------------------------------------- |
| JSON value or response envelope           | Replace or add a response                                      |
| `null`                                    | Disable the mock and pass the request to downstream middleware |
| `(body, { request, response }) => answer` | Modify the current response, synchronously or asynchronously   |
| Modifier returning `undefined`            | Keep the current response                                      |
| Modifier returning a JSON value           | Replace the body while preserving response metadata            |
| Modifier returning an envelope            | Replace the entire response                                    |

We will go through them one by one with the same base handler:

```ts
'GET /api/user': {
  kind: 'mock-response',
  status: 200,
  headers: { 'X-Source': 'mock' },
  body: { id: 'demo', name: 'Demo User' },
},
```

## Replace or add: a value or envelope

Use this when the scenario ignores what was there before:

```ts
override: () => ({
  'GET /api/user': { id: 'guest', name: 'Guest' },
  'GET /api/new-route': { hello: 'world' },   // adding a route also works
})
```

Both entries produce a full response. The second route did not exist in the base
handlers; the override adds it.

## Disable the mock: `null`

`null` removes the mock for that route, and the request falls through to Vite's
middleware and proxies. It is the way to say "for this scenario, use the real
backend for this endpoint".

```ts
export default defineMockOverride({
  name: 'Real user service',
  override: () => ({
    'GET /api/user': null,
  }),
});
```

## Modify: a function

A function receives the body so far and a context with the `request` and the
current `response`:

```ts
override: () => ({
  'GET /api/user': (body, { request, response }) => {
    // body     → the current body (an object here)
    // request  → the MockRequest (route, url, raw)
    // response → the current status, headers, and payload
    return { ...body, seenAt: request.url.pathname };
  },
})
```

Functions can be async, for example to add a delay:

```ts
'GET /api/user': async body => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  return body;                       // unchanged, but 2 seconds late
},
```

### What the return value means

**Return `undefined`: keep the response as is.** Useful when the modifier only
has side effects, or a condition decided not to change anything:

```ts
'GET /api/user': (body, { request }) => {
  if (request.url.searchParams.get('debug') === '1') {
    return { ...body, debug: true };
  }
  // implicit undefined: nothing changes
},
```

**Return a JSON value: replace the body, keep status and headers.** The status
200 and the `X-Source` header from the base handler survive:

```ts
'GET /api/user': body => ({ ...body, name: 'Taylor' }),
```

**Return an envelope: replace the whole response.** Use this when you also want
to change the status or headers, or switch between JSON, text, and binary:

```ts
'GET /api/user': () => ({
  kind: 'mock-response',
  status: 503,
  headers: { 'Retry-After': '30' },
  body: { error: 'Service unavailable' },
}),
```

The `json(body, status)` helper is shorthand for an envelope that only sets the
status:

```ts
'GET /api/user': () => json({ error: 'Service unavailable' }, 503),
```

## Edge cases worth knowing

### The body can be `undefined`

For routes that are **new** (added by the override) or **disabled** by an
earlier `null`, there is no current body. Modifiers receive `undefined`. Guard
against it:

```ts
'GET /api/notes': body => [...(body ?? []), { id: 'extra', text: 'Added' }],
```

### Non-object payloads

The body argument is for JSON objects. If the current response is text or bytes,
or you need the status and headers, use `context.response`:

```ts
'GET /api/user': (body, { response }) => {
  if (response.status !== 200) return;   // keep error responses untouched
  return { ...body, verified: true };
},
```

### Switching response types

When changing a JSON response into text or binary (or the reverse), return a full
envelope. Returning a bare value only swaps the JSON body.

```ts
'GET /api/report': () => ({
  kind: 'mock-response',
  headers: { 'Content-Type': 'text/csv' },
  text: 'id,name\n1,Taylor\n',
}),
```

### Real JSON `null`

Since `null` disables a mock, use `json(null)` when `null` is the body you want:

```ts
'GET /api/current-user': json(null),
```

## Stacking

Because each active override feeds the next, small modifiers compose. Three
overrides in this order:

1. **Admin user**: `body => ({ ...body, role: 'admin' })`
2. **Slow**: `async body => { await sleep(2000); return body; }`
3. **Maintenance**: `() => json({ error: 'Maintenance' }, 503)`

The request waits 2 seconds, and the final answer is the 503. Disable
**Maintenance** and you get a slow admin user, with no code changes.

## Next

See complete, copy-pasteable scenarios in [Recipes](/guide/recipes).
