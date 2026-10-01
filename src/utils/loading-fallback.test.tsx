import { render, screen } from '@testing-library/react';
import LoadingFallback, { LoadingShellChunkFallback } from './loading-fallback';

const originalNodeEnv = process.env.NODE_ENV;
const DEV_SERVER_ORIGIN = 'https://stage.foo.redhat.com:1337';

describe('LoadingFallback', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    jsdomReconfigure({ url: DEV_SERVER_ORIGIN });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('renders shell placeholders synchronously while shell chunks load', () => {
    const { container } = render(<LoadingShellChunkFallback />);

    expect(screen.getByRole('status', { name: 'Loading application placeholders' })).toBeInTheDocument();
    expect(container.querySelector('[data-ouia-component-id="remote-module-loader"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.chr-c-loading-shell-fallback__card')).toHaveLength(8);
  });

  it('shows embedded shell content in local E2E mode without duplicating the Chrome frame', async () => {
    jsdomReconfigure({ url: `${DEV_SERVER_ORIGIN}/?loadingShell=1` });

    const { container } = render(LoadingFallback);

    expect(await screen.findByRole('status', { name: 'Loading application placeholders' })).toBeInTheDocument();
    expect(container.querySelector('.pf-v6-c-masthead')).not.toBeInTheDocument();
    expect(container.querySelector('footer')).not.toBeInTheDocument();
  });

  it('keeps the existing spinner when local E2E mode is disabled', () => {
    const { container } = render(LoadingFallback);

    expect(container.querySelector('[data-ouia-component-id="remote-module-loader"]')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading application placeholders' })).not.toBeInTheDocument();
  });
});
