module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setupJest.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  }
};
