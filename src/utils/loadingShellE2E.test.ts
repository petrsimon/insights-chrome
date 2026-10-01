import { isLoadingShellE2EEnabled } from './loadingShellE2E';

const originalNodeEnv = process.env.NODE_ENV;
const STORAGE_KEY = 'chrome:dev:loading-shell-e2e';
const DEV_SERVER_ORIGIN = 'https://stage.foo.redhat.com:1337';

describe('isLoadingShellE2EEnabled', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    jsdomReconfigure({ url: DEV_SERVER_ORIGIN });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('enables from the query string and persists across app navigation', () => {
    jsdomReconfigure({ url: `${DEV_SERVER_ORIGIN}/?loadingShell=1` });

    expect(isLoadingShellE2EEnabled()).toBe(true);

    jsdomReconfigure({ url: `${DEV_SERVER_ORIGIN}/insights/dashboard` });

    expect(isLoadingShellE2EEnabled()).toBe(true);
  });

  it('disables and clears the session opt-in when requested', () => {
    window.sessionStorage.setItem(STORAGE_KEY, 'true');
    jsdomReconfigure({ url: `${DEV_SERVER_ORIGIN}/?loadingShell=0` });

    expect(isLoadingShellE2EEnabled()).toBe(false);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('never enables in production', () => {
    process.env.NODE_ENV = 'production';
    jsdomReconfigure({ url: `${DEV_SERVER_ORIGIN}/?loadingShell=1` });

    expect(isLoadingShellE2EEnabled()).toBe(false);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
