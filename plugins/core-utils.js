module.exports = {
  name: 'core',
  tools: {
    echo: {
      description: 'Echo back the provided text.',
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      run: async ({ text }) => ({ text }),
    },
    now: {
      description: 'Return the current ISO timestamp.',
      params: { type: 'object', properties: {} },
      run: async () => ({ now: new Date().toISOString() }),
    },
  },
};
