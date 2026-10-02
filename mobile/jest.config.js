module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/__tests__/**/*.test.js"],
  moduleNameMapper: {
    "^expo-router$": "<rootDir>/__mocks__/expo-router.js",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  clearMocks: true,
};
