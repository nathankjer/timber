module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setupJest.cjs'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  }
};
