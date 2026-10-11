import { defineMockConfiguration } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/demo': { message: 'base', enabled: false, mode: 'normal', sequence: '' },
  },
});
