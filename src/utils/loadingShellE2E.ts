/** Dev-only E2E opt-in. Query activation persists for the tab across SSO redirects and route changes. */
const STORAGE_KEY = 'chrome:dev:loading-shell-e2e';
const QUERY_PARAMETER = 'loadingShell';

export const isLoadingShellE2EEnabled = (): boolean => {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const requestedMode = new URLSearchParams(window.location.search).get(QUERY_PARAMETER);
  if (requestedMode === '1') {
    window.sessionStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }

  if (requestedMode === '0') {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return false;
  }

  return window.sessionStorage.getItem(STORAGE_KEY) === 'true';
};
