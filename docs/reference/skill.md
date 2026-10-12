# Agent skill

QMock ships a `qmock` skill that helps coding agents (Cursor, Claude Code, and
others that read skill folders) set up QMock and write scenarios in your project.

## Install

```sh
npx qmock install-skills
```

Choose a different agent's skill directory with `--target`:

```sh
npx qmock install-skills --target .claude/skills
```

The default destination is `.agents/skills`. Installation **refuses to overwrite**
an existing skill, so remove the old copy first when updating.

## What it covers

- Vite integration
- Handlers
- Parameterized overrides
- Dashboard usage
- Isolated tests

## Installing by hand

The skill is self-contained and needs no other skills. Copy
`node_modules/@avinlab/qmock/skills/qmock` into your project's skill directory.

## Example prompts

Once installed, you can ask an agent things like:

- "Add QMock to this project and mock the `/api/products` endpoints."
- "Write an override that makes `GET /api/orders` return a 503, with the status
  as a parameter."
- "Add a Playwright test that checks the empty-orders state using QMock."
