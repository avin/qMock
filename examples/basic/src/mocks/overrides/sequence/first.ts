import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Append A',
  description: 'Append A to the sequence.',
  override: () => ({
    'GET /api/demo': body => ({ ...body, sequence: `${body?.sequence ?? ''}A` }),
  }),
});
