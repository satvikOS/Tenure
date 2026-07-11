const nextJest = require("next/jest.js")

const createJestConfig = nextJest({ dir: "./" })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // e2e/ belongs to Playwright, not Jest
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/e2e/"],
}

module.exports = createJestConfig(config)
