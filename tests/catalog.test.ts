import { describe, expect, it } from 'vitest';
import * as catalog from '../src/overrideCatalog.js';
import type { MockOverride, MockOverrideParamsSchema } from '../src/utils.js';

const schema = { enabled: { type: 'boolean', default: false }, mode: { type: 'string', default: 'short', options: ['short', 'long'] }, message: { type: 'string', default: 'hello' } } satisfies MockOverrideParamsSchema;
const leaf = { kind: 'override' as const, id: 'group/failure', name: 'Failure', description: 'Returns an error', params: catalog.serializeParamsSchema(schema) };
const tree = [{ kind: 'group' as const, id: 'group', name: 'Orders', children: [leaf] }];

describe('override catalog and UI state helpers', () => {
  it.each(['_private.ts', 'case.test.ts', 'case.d.ts', 'file.txt'])('excludes non-catalog file %s', file => {
    expect(catalog.isOverrideModuleFileName(file)).toBe(false);
  });
  it('recognizes module exports and rejects ambiguous named exports', () => {
    const value: MockOverride = { name: 'Override', override: () => ({}) };
    expect(catalog.readExportedMockOverride({ default: value, other: value })).toBe(value);
    expect(catalog.readExportedMockOverride({ only: value, other: 1 })).toBe(value);
    expect(catalog.readExportedMockOverride({ first: value, second: value })).toBeUndefined();
    expect(catalog.readExportedMockOverride({ default: { name: 'Invalid' } })).toBeUndefined();
    expect(catalog.isMockOverride(null)).toBe(false);
    expect(catalog.toPosixPath('orders\\failure.ts')).toBe('orders/failure.ts');
  });
  it('serializes and reconstructs parameter schemas without sharing mutable options', () => {
    const info = catalog.serializeParamsSchema(schema);
    expect(catalog.paramsSchemaFromInfo(info)).toEqual(schema);
    expect(catalog.serializeParamsSchema(undefined)).toEqual([]);
    expect(info[1]).not.toBe(schema.mode);
    expect((info[1] as { options: string[] }).options).not.toBe(schema.mode.options);
  });
  it.each([undefined, null, 1, [], {}])('uses defaults for absent or invalid stored params %s', stored => {
    expect(catalog.resolveOverrideParams(schema, stored)).toEqual({ enabled: false, mode: 'short', message: 'hello' });
  });
  it('accepts valid values, rejects invalid enum and type values, drops unknown keys', () => {
    expect(catalog.resolveOverrideParams(schema, { enabled: true, mode: 'long', message: '', extra: 'x' })).toEqual({ enabled: true, mode: 'long', message: '' });
    expect(catalog.resolveOverrideParams(schema, { enabled: 'true', mode: 'other', message: 1 })).toEqual({ enabled: false, mode: 'short', message: 'hello' });
    expect(catalog.resolveOverrideParams(undefined, { value: true })).toEqual({});
  });
  it.each(['failure', 'group/failure', ' ERROR ', 'orders'])('searches metadata and group names case-insensitively: %s', query => {
    expect(catalog.filterOverrideTreeByQuery(tree, query)).toEqual(tree);
  });
  it('flattens leaves, collects nested groups and prunes unrelated search branches', () => {
    const nested = [...tree, { kind: 'group' as const, id: 'other', name: 'Other', children: [{ ...leaf, id: 'other/success', name: 'Success', description: undefined }] }];
    expect(catalog.flattenOverrideLeaves(nested)).toHaveLength(2);
    expect(catalog.collectGroupIds(nested)).toEqual(['group', 'other']);
    expect(catalog.filterOverrideTreeByQuery(nested, 'error')).toEqual(tree);
    expect(catalog.filterOverrideTreeByQuery(tree, 'missing')).toEqual([]);
    expect(catalog.filterOverrideTreeByQuery(tree, ' ')).toBe(tree);
  });
  it('parses untrusted state, discards malformed entries and moves last duplicate to its latest position', () => {
    expect(catalog.parseOverrideStateFile(null)).toEqual([]);
    expect(catalog.parseOverrideStateFile({ active: [null, 'bad', { id: 1 }, { id: 'a' }, { id: 'b', params: { x: true }, isEnabled: false }, { id: 'a', params: null }] })).toEqual([
      { id: 'b', params: { x: true }, isEnabled: false }, { id: 'a', params: {}, isEnabled: true },
    ]);
    const active = catalog.createActiveOverrideEntry(leaf, { mode: 'long' });
    expect(JSON.parse(catalog.serializeOverrideStateFile([active]))).toEqual({ active: [active] });
    expect(catalog.serializeOverrideStateFile([]).endsWith('\n')).toBe(true);
  });
  it('normalizes entries against the current catalog and schema', () => {
    const override: MockOverride = { name: 'Failure', params: schema, override: () => ({}) };
    expect(catalog.normalizeActiveOverrides([
      { id: 'unknown', params: {}, isEnabled: true },
      { id: leaf.id, params: { mode: 'long' }, isEnabled: false },
      { id: leaf.id, params: {}, isEnabled: true },
    ], new Map([[leaf.id, override]]))).toEqual([{ id: leaf.id, params: { enabled: false, mode: 'long', message: 'hello' }, isEnabled: false }]);
  });
  it('moves entries without losing settings, inserts defaults and clamps target indexes without mutating input', () => {
    const a = { id: 'a', params: { message: 'saved' }, isEnabled: false };
    const b = { id: 'b', params: {}, isEnabled: true };
    const c = { id: 'c', params: {}, isEnabled: true };
    const active = [a, b];
    expect(catalog.placeActiveOverride(active, 'a', 2, () => c)).toEqual([b, a]);
    expect(catalog.placeActiveOverride(active, 'b', -100, () => c)).toEqual([b, a]);
    expect(catalog.placeActiveOverride(active, 'c', 100, () => c)).toEqual([a, b, c]);
    expect(active).toEqual([a, b]);
    expect(catalog.updateActiveOverrideParams(active, 'a', { message: 'changed' })[0].params.message).toBe('changed');
    expect(catalog.setActiveOverrideEnabled(active, 'a', true)[0].isEnabled).toBe(true);
    expect(catalog.removeActiveOverride(active, 'a')).toEqual([b]);
    expect(catalog.createActiveOverrideEntry(leaf)).toEqual({ id: leaf.id, params: { enabled: false, mode: 'short', message: 'hello' }, isEnabled: true });
  });
});
