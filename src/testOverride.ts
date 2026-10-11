import type { MockAnswer, MockRoute } from "./utils.js";

export const mockScopeHeader = "x-mock-scope";
export const testOverridePath = "/__apiMocks/test-override";

export type TestMockOverride = Partial<Record<MockRoute, MockAnswer | null>>;
