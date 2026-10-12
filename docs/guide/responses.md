# Responses

A handler can return several kinds of values. This page covers all of them.

## JSON values

The simplest response is any JSON-serializable value. It is sent as
`application/json` with status 200.

```ts
'GET /api/user': { id: 'demo', name: 'Demo User' },
'GET /api/tags': ['a', 'b', 'c'],
```

## The `json()` helper

To change the status code, wrap the body in `json(body, status)`:

```ts
import { json } from '@avinlab/qmock';

'POST /api/orders': json({ id: 'order-1' }, 201),
'GET /api/missing': json({ error: 'Not found' }, 404),
```

::: tip JSON null
A bare `null` has a special meaning in overrides (it disables a mock, see
[Modifying responses](/guide/modifiers)). When you really want a JSON `null`
body, write `json(null)`.
:::

## Response envelopes

For full control (status, headers, text, or bytes) return an **envelope**, an
object with `kind: 'mock-response'`:

```ts
export default defineMockConfiguration({
  handlers: {
    'GET /message': { kind: 'mock-response', text: 'Hello' },

    'GET /download': {
      kind: 'mock-response',
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
      data: new Uint8Array([1, 2, 3]),
    },

    'GET /api/created': {
      kind: 'mock-response',
      status: 201,
      headers: { Location: '/api/items/42' },
      body: { id: 42 },
    },

    'DELETE /api/items/42': { kind: 'mock-response', status: 204 },
  },
});
```

### Envelope fields

| Field     | Meaning                                  |
| --------- | ---------------------------------------- |
| `kind`    | Always `'mock-response'`                 |
| `status`  | HTTP status. Defaults to `200`           |
| `headers` | Response headers                         |
| `body`    | A JSON value                             |
| `text`    | A text payload                           |
| `data`    | Bytes (`Uint8Array`)                     |

### Payload rules

If you provide more than one payload field, this is the order of precedence:

1. `data` (bytes)
2. `text`
3. `body` (JSON)

Content types are picked for you unless you set one yourself:

- `text` defaults to `text/plain; charset=utf-8`.
- `body` defaults to `application/json`.
- An envelope with **no payload** sends an empty response (useful for `204`).

### Examples

A plain-text health check:

```ts
'GET /health': { kind: 'mock-response', text: 'ok' },
```

HTML or XML needs an explicit content type:

```ts
'GET /feed.xml': {
  kind: 'mock-response',
  headers: { 'Content-Type': 'application/xml' },
  text: '<feed><entry>Hello</entry></feed>',
},
```

A redirect-style or cache-related header:

```ts
'GET /api/config': {
  kind: 'mock-response',
  headers: { 'Cache-Control': 'no-store' },
  body: { featureFlags: { newCheckout: true } },
},
```

An error with a body your UI can display:

```ts
'POST /api/pay': {
  kind: 'mock-response',
  status: 402,
  body: { code: 'card_declined', message: 'Your card was declined.' },
},
```

## Which shape should I use?

| You want…                          | Use                                   |
| ---------------------------------- | ------------------------------------- |
| JSON, status 200                   | a plain value                         |
| JSON, other status                 | `json(body, status)`                  |
| Headers, plain text, or bytes      | an envelope                           |
| A response that depends on input   | a function returning any of the above |

## Next

Handlers describe the happy path. To produce errors and variants on demand,
write [Overrides](/guide/overrides).
