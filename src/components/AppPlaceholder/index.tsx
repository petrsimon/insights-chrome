import { Masthead, MastheadBrand, MastheadLogo, MastheadMain } from '@patternfly/react-core/dist/dynamic/components/Masthead';
import { Page, PageSidebar, PageSidebarBody } from '@patternfly/react-core/dist/dynamic/components/Page';

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import ChromeLink from '../ChromeLink';
import ChromeFooter from '../Footer/Footer';
import Logo from '../Header/Logo';
import NavLoader from '../Navigation/Loader';
import { getUrl } from '../../hooks/useBundle';
import { isLoadingShellE2EEnabled } from '../../utils/loadingShellE2E';
import LoadingFallback, { LoadingShellChunkFallback } from '../../utils/loading-fallback';

const LoadingShellStartup = React.lazy(() => import('../LoadingShellPrototype').then(({ LoadingShellStartup }) => ({ default: LoadingShellStartup })));

type AppPlaceholderFrameProps = {
  hideNavLoader: boolean;
  hideFooter: boolean;
  children: React.ReactNode;
};

const AppPlaceholderFrame = ({ hideNavLoader, hideFooter, children }: AppPlaceholderFrameProps) => (
  <Page
    className="chr-c-page"
    masthead={
      <Masthead className="chr-c-masthead">
        <MastheadMain className="pf-v6-u-pl-lg">
          <MastheadBrand data-codemods>
            <MastheadLogo data-codemods component={(props) => <ChromeLink {...props} appId="landing" href="/" />}>
              <Logo />
            </MastheadLogo>
          </MastheadBrand>
        </MastheadMain>
      </Masthead>
    }
    sidebar={
      hideNavLoader ? undefined : (
        <PageSidebar>
          <PageSidebarBody>
            <NavLoader />
          </PageSidebarBody>
        </PageSidebar>
      )
    }
  >
    <div className="chr-render">
      {children}
      {!hideFooter && <ChromeFooter />}
    </div>
  </Page>
);

// Component that is displayed as a placeholder before auth init is finished
const AppPlaceholder = () => {
  const hideNavLoader = [undefined, '', 'landing', 'allservices', 'favoritedservices', 'learning-resources', 'lightwell'].includes(getUrl('bundle'));
  const hideFooter = ['lightwell'].includes(getUrl('bundle'));

  return (
    <MemoryRouter>
      {isLoadingShellE2EEnabled() ? (
        <React.Suspense
          fallback={
            <AppPlaceholderFrame hideNavLoader={hideNavLoader} hideFooter={hideFooter}>
              <LoadingShellChunkFallback />
            </AppPlaceholderFrame>
          }
        >
          <LoadingShellStartup showNavigation={!hideNavLoader} />
        </React.Suspense>
      ) : (
        <AppPlaceholderFrame hideNavLoader={hideNavLoader} hideFooter={hideFooter}>
          {LoadingFallback}
        </AppPlaceholderFrame>
      )}
    </MemoryRouter>
  );
};

export default AppPlaceholder;
