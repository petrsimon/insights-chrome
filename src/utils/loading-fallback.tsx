import { Bullseye } from '@patternfly/react-core/dist/dynamic/layouts/Bullseye';
import { Spinner } from '@patternfly/react-core/dist/dynamic/components/Spinner';
import React, { Suspense } from 'react';
import { isLoadingShellE2EEnabled } from './loadingShellE2E';

import './loading-fallback.scss';

const LoadingFallbackSpinner = (
  <Bullseye className="pf-v6-u-p-xl chr-c-loading-fallback">
    <Spinner data-ouia-component-id="remote-module-loader" size="xl" />
  </Bullseye>
);

/** Keep this fallback eager so Suspense can render it before the shell chunks arrive. */
export const LoadingShellChunkFallback = () => (
  <div className="chr-c-loading-shell-fallback" role="status" aria-label="Loading application placeholders">
    <div className="chr-c-loading-shell-fallback__heading" aria-hidden="true">
      <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__heading-title" />
      <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__heading-action" />
    </div>
    <div className="chr-c-loading-shell-fallback__toolbar" aria-hidden="true">
      <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__filter" />
      <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__toolbar-action" />
    </div>
    <div className="chr-c-loading-shell-fallback__grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="chr-c-loading-shell-fallback__card" key={index}>
          <div className="chr-c-loading-shell-fallback__card-heading">
            <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__card-icon" />
            <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__card-title" />
            <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__card-action" />
          </div>
          <div className="chr-c-loading-shell-fallback__card-body">
            <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__card-line" />
            <span className="pf-v6-c-skeleton chr-c-loading-shell-fallback__card-line chr-c-loading-shell-fallback__card-line--short" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const LoadingShellRemoteContent = React.lazy(() =>
  import('../components/LoadingShellPrototype/LoadingShellContent').then(({ LoadingShellRemoteContent }) => ({ default: LoadingShellRemoteContent }))
);

const LoadingShellFallback = (
  <Suspense fallback={<LoadingShellChunkFallback />}>
    <LoadingShellRemoteContent />
  </Suspense>
);

/**
 * This fallback has to be a React node, not a component, so it stays persistent and its animation doesn't reset when parents switch.
 */
const LoadingFallbackContent = () => (isLoadingShellE2EEnabled() ? LoadingShellFallback : LoadingFallbackSpinner);

const LoadingFallback = <LoadingFallbackContent />;

export default LoadingFallback;
