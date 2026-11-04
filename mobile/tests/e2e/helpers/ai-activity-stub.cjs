// Answers the ai-activity function at the browser's HTTP boundary, in mock mode.
// These are browser tests with a simulated backend, not live results.
const fixture = require("../../../lib/fixtures/mock-intentions.json");

const MOCK_MODE = { mode: "mock", available: true, contentVersion: null, labels: null };

function aiActivityStub(request) {
  if (request.method() === "GET") return MOCK_MODE;
  const body = request.postDataJSON();
  return { kind: body.kind, provider: "mock", result: { intentions: fixture.intentions } };
}

module.exports = { MOCK_MODE, aiActivityStub };
