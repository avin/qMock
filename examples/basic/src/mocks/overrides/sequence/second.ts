import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Append B',
  description: 'Append B to the sequence.',
  override: () => ({
    'GET /api/demo': body => ({ ...body, sequence: `${body?.sequence ?? ''}B` }),
  }),
});
