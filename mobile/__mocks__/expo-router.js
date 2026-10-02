let localSearchParams = {};

const router = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
};

function useLocalSearchParams() {
  return localSearchParams;
}

function __setLocalSearchParams(params) {
  localSearchParams = params;
}

function __resetExpoRouterMock() {
  localSearchParams = {};
  router.replace.mockClear();
  router.push.mockClear();
  router.back.mockClear();
}

module.exports = {
  router,
  useLocalSearchParams,
  __setLocalSearchParams,
  __resetExpoRouterMock,
};
