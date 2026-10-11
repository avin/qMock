import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Customize response',
  description: 'Change the message, flag, and response mode.',
  params: {
    enabled: { type: 'boolean', default: true },
    message: { type: 'string', default: 'custom' },
    mode: { type: 'string', default: 'normal', options: ['normal', 'limited'] },
  },
  override: ({ enabled, message, mode }) => ({
    'GET /api/demo': body => ({ ...body, enabled, message, mode }),
  }),
});
