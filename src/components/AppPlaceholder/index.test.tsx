import React from 'react';
import { render, screen } from '@testing-library/react';
import AppPlaceholder from './index';
import { isLoadingShellE2EEnabled } from '../../utils/loadingShellE2E';

jest.mock('../ChromeLink', () => () => null);
jest.mock('../Footer/Footer', () => ({ __esModule: true, default: () => null }));
jest.mock('../Header/Logo', () => () => null);
jest.mock('../Navigation/Loader', () => () => null);
jest.mock('../../hooks/useBundle', () => ({ getUrl: () => '' }));
jest.mock('../../utils/loading-fallback', () => ({
  __esModule: true,
  default: <div data-testid="legacy-loading-fallback" />,
  LoadingShellChunkFallback: () => <div data-testid="loading-shell-startup-fallback" />,
}));
jest.mock('../../utils/loadingShellE2E', () => ({
  isLoadingShellE2EEnabled: jest.fn(),
}));
let mockSuspendStartup = false;
const mockStartupSuspension = new Promise<never>(() => {});

jest.mock('../LoadingShellPrototype', () => ({
  __esModule: true,
  LoadingShellStartup: () => {
    if (mockSuspendStartup) {
      throw mockStartupSuspension;
    }
    return <div data-testid="loading-shell-startup" />;
  },
}));

const mockIsLoadingShellE2EEnabled = jest.mocked(isLoadingShellE2EEnabled);

describe('AppPlaceholder', () => {
  beforeEach(() => {
    mockIsLoadingShellE2EEnabled.mockReset();
    mockSuspendStartup = false;
  });

  it('uses the startup shell when local E2E mode is enabled', async () => {
    mockIsLoadingShellE2EEnabled.mockReturnValue(true);

    render(<AppPlaceholder />);

    expect(await screen.findByTestId('loading-shell-startup')).toBeInTheDocument();
  });

  it('uses shell placeholders while the startup shell chunk is loading', () => {
    mockIsLoadingShellE2EEnabled.mockReturnValue(true);
    mockSuspendStartup = true;

    render(<AppPlaceholder />);

    expect(screen.getByTestId('loading-shell-startup-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-loading-fallback')).not.toBeInTheDocument();
  });

  it('keeps the existing placeholder when local E2E mode is disabled', () => {
    mockIsLoadingShellE2EEnabled.mockReturnValue(false);

    render(<AppPlaceholder />);

    expect(screen.getByTestId('legacy-loading-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-shell-startup')).not.toBeInTheDocument();
  });
});
