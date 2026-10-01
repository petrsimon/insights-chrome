import React, { useCallback, useEffect } from 'react';
import { Button } from '@patternfly/react-core/dist/dynamic/components/Button';
import { Masthead, MastheadBrand, MastheadContent, MastheadLogo, MastheadMain } from '@patternfly/react-core/dist/dynamic/components/Masthead';
import { Page, PageSection, PageSidebar, PageSidebarBody } from '@patternfly/react-core/dist/dynamic/components/Page';
import { Skeleton } from '@patternfly/react-core/dist/dynamic/components/Skeleton';
import { Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem } from '@patternfly/react-core/dist/dynamic/components/Toolbar';
import { useSearchParams } from 'react-router-dom';
import ChromeFooter from '../Footer/Footer';
import { Header } from '../Header/Header';
import Logo from '../Header/Logo';
import NavLoader from '../Navigation/Loader';
import { LoadingShellContent, LoadingShellVariant } from './LoadingShellContent';

const VARIANTS: { id: LoadingShellVariant; label: string }[] = [
  { id: 'grid', label: 'A · Application grid' },
  { id: 'groups', label: 'B · Grouped applications' },
  { id: 'featured', label: 'C · Featured + list' },
];

type LoadingPhase = 'startup' | 'remote';

const StartupMasthead = () => (
  <>
    <MastheadMain className="pf-v6-u-pl-lg">
      <MastheadBrand data-codemods>
        <MastheadLogo data-codemods>
          <Logo />
        </MastheadLogo>
        <Skeleton className="chr-prototype-loading-shell__brand-placeholder" width="152px" height="24px" screenreaderText="Loading console header" />
      </MastheadBrand>
    </MastheadMain>
    <MastheadContent className="pf-v6-u-mx-0">
      <Toolbar isFullHeight>
        <ToolbarContent>
          <ToolbarGroup className="chr-prototype-loading-shell__toolbar-workspace" variant="filter-group">
            <ToolbarItem className="pf-v6-m-hidden pf-v6-m-visible-on-xl">
              <Skeleton width="156px" height="32px" aria-hidden="true" />
            </ToolbarItem>
          </ToolbarGroup>
          <ToolbarGroup className="chr-prototype-loading-shell__toolbar-controls pf-v6-u-flex-grow-1" variant="filter-group">
            <ToolbarItem className="chr-prototype-loading-shell__toolbar-search">
              <Skeleton width="280px" height="32px" aria-hidden="true" />
            </ToolbarItem>
            <ToolbarItem className="chr-prototype-loading-shell__toolbar-actions">
              <Skeleton shape="square" width="32px" height="32px" aria-hidden="true" />
              <Skeleton shape="square" width="32px" height="32px" aria-hidden="true" />
              <Skeleton shape="circle" width="32px" height="32px" aria-hidden="true" />
            </ToolbarItem>
          </ToolbarGroup>
        </ToolbarContent>
      </Toolbar>
    </MastheadContent>
  </>
);

const RemoteMasthead = () => (
  <Header
    breadcrumbsProps={{ hideNav: true }}
    toolbarConfig={{
      settingsGroups: {
        showPreview: true,
        showSettingsGroup: true,
        showIAM: true,
        showTheme: true,
        showColorScheme: true,
        showContrastMode: true,
      },
      userMenu: {
        showMyProfile: true,
        showMyUserAccess: true,
        showUserPreferences: true,
        showInternal: true,
        showLogout: true,
      },
    }}
  />
);

export const LoadingShellStartup = ({ showNavigation }: { showNavigation: boolean }) => (
  <div className="chr-prototype-loading-shell">
    <Page
      className="chr-c-page chr-prototype-loading-shell__page"
      isContentFilled
      masthead={
        <Masthead className="chr-c-masthead" display={{ sm: 'stack', '2xl': 'inline' }}>
          <StartupMasthead />
        </Masthead>
      }
      sidebar={
        showNavigation ? (
          <PageSidebar>
            <PageSidebarBody>
              <NavLoader />
            </PageSidebarBody>
          </PageSidebar>
        ) : undefined
      }
    >
      <div className="chr-render">
        <PageSection className="chr-prototype-loading-shell__main" hasBodyWrapper={false} padding={{ default: 'noPadding' }}>
          <LoadingShellContent />
        </PageSection>
        <ChromeFooter />
      </div>
    </Page>
  </div>
);

const LoadingShellPrototype = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVariant = searchParams.get('variant');
  const variantIndex = VARIANTS.findIndex(({ id }) => id === requestedVariant);
  const currentVariantIndex = variantIndex < 0 ? 0 : variantIndex;
  const currentVariant = VARIANTS[currentVariantIndex] ?? VARIANTS[0];
  const phase: LoadingPhase = searchParams.get('phase') === 'remote' ? 'remote' : 'startup';

  const updateParam = useCallback(
    (key: string, value: string) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set(key, value);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const cycleVariant = useCallback(
    (direction: number) => {
      const nextIndex = (currentVariantIndex + direction + VARIANTS.length) % VARIANTS.length;
      updateParam('variant', VARIANTS[nextIndex].id);
    },
    [currentVariantIndex, updateParam]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleVariant(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleVariant(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleVariant]);

  return (
    <div className="chr-prototype-loading-shell">
      <Page
        className="chr-c-page chr-prototype-loading-shell__page"
        isContentFilled
        masthead={
          <Masthead className="chr-c-masthead" display={{ sm: 'stack', '2xl': 'inline' }}>
            {phase === 'startup' ? <StartupMasthead /> : <RemoteMasthead />}
          </Masthead>
        }
      >
        <div className="chr-render">
          <PageSection className="chr-prototype-loading-shell__main" hasBodyWrapper={false} padding={{ default: 'noPadding' }}>
            <LoadingShellContent variant={currentVariant.id} />
          </PageSection>
          <ChromeFooter />
        </div>
      </Page>
      {process.env.NODE_ENV !== 'production' && (
        <div className="chr-prototype-loading-shell__switcher" role="group" aria-label="Loading shell prototype controls">
          <span className="chr-prototype-loading-shell__prototype-label">Loading shell · Prototype</span>
          <div className="chr-prototype-loading-shell__phase-controls" role="group" aria-label="Loading phase">
            <Button
              type="button"
              variant={phase === 'startup' ? 'primary' : 'tertiary'}
              onClick={() => updateParam('phase', 'startup')}
              aria-pressed={phase === 'startup'}
            >
              Startup
            </Button>
            <Button
              type="button"
              variant={phase === 'remote' ? 'primary' : 'tertiary'}
              onClick={() => updateParam('phase', 'remote')}
              aria-pressed={phase === 'remote'}
            >
              Remote app
            </Button>
          </div>
          <div className="chr-prototype-loading-shell__variant-controls" role="group" aria-label="Loading layout">
            <Button type="button" variant="tertiary" onClick={() => cycleVariant(-1)} aria-label="Previous layout">
              ←
            </Button>
            <span className="chr-prototype-loading-shell__variant-label" aria-live="polite">
              {currentVariant.label}
            </span>
            <Button type="button" variant="tertiary" onClick={() => cycleVariant(1)} aria-label="Next layout">
              →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadingShellPrototype;
