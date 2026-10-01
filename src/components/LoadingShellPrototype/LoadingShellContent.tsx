import React from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@patternfly/react-core/dist/dynamic/components/Card';
import { Skeleton } from '@patternfly/react-core/dist/dynamic/components/Skeleton';
import { Gallery } from '@patternfly/react-core/dist/dynamic/layouts/Gallery';
import { Split, SplitItem } from '@patternfly/react-core/dist/dynamic/layouts/Split';
import { EllipsisVIcon } from '@patternfly/react-icons/dist/dynamic/icons/ellipsis-v-icon';
import { GripVerticalIcon } from '@patternfly/react-icons/dist/dynamic/icons/grip-vertical-icon';
import './LoadingShellPrototype.scss';

const APP_GALLERY_MIN_WIDTHS = { default: '280px', xl: '300px' } as const;
const COMPACT_GALLERY_MIN_WIDTHS = { default: '220px' } as const;

export type LoadingShellVariant = 'grid' | 'groups' | 'featured';
type CardSize = 'regular' | 'compact' | 'featured';

const PlaceholderCard = ({ size = 'regular' }: { size?: CardSize }) => (
  <Card className={`chr-prototype-loading-shell__card chr-prototype-loading-shell__card--${size}`} isFullHeight>
    <CardHeader
      className="chr-prototype-loading-shell__card-header"
      actions={{
        actions: (
          <div className="chr-prototype-loading-shell__card-actions" aria-hidden="true">
            <EllipsisVIcon className="chr-prototype-loading-shell__card-action" />
            <GripVerticalIcon className="chr-prototype-loading-shell__card-action" />
          </div>
        ),
        hasNoOffset: true,
      }}
    >
      <Split className="chr-prototype-loading-shell__card-heading" hasGutter aria-hidden="true">
        <SplitItem>
          <Skeleton shape="square" width="32px" height="32px" />
        </SplitItem>
        <SplitItem className="chr-prototype-loading-shell__card-title" isFilled>
          <CardTitle>
            <Skeleton width={size === 'compact' ? '72%' : '58%'} height="16px" />
          </CardTitle>
        </SplitItem>
      </Split>
    </CardHeader>
    <CardBody className="chr-prototype-loading-shell__card-body" isFilled aria-hidden="true">
      <div className="chr-prototype-loading-shell__card-copy">
        <Skeleton width="100%" height="10px" />
        {size !== 'compact' && <Skeleton width="74%" height="10px" />}
      </div>
    </CardBody>
  </Card>
);

const PagePlaceholders = () => (
  <>
    <div className="chr-prototype-loading-shell__page-heading" aria-hidden="true">
      <Skeleton width="260px" height="32px" />
      <Skeleton width="144px" height="36px" />
    </div>
    <div className="chr-prototype-loading-shell__page-toolbar" aria-hidden="true">
      <Skeleton className="chr-prototype-loading-shell__filter-placeholder" width="280px" height="36px" />
      <div className="chr-prototype-loading-shell__page-toolbar-actions">
        <Skeleton width="96px" height="32px" />
        <Skeleton shape="square" width="32px" height="32px" />
      </div>
    </div>
  </>
);

const ApplicationGrid = () => (
  <Gallery className="chr-prototype-loading-shell__application-grid" hasGutter minWidths={APP_GALLERY_MIN_WIDTHS} aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => (
      <PlaceholderCard key={index} />
    ))}
  </Gallery>
);

const GroupedApplications = () => (
  <div className="chr-prototype-loading-shell__groups" aria-hidden="true">
    {[0, 1].map((group) => (
      <section className="chr-prototype-loading-shell__group" key={group}>
        <Skeleton className="chr-prototype-loading-shell__group-title" width="184px" height="24px" />
        <Gallery hasGutter minWidths={APP_GALLERY_MIN_WIDTHS}>
          {[0, 1, 2, 3].map((card) => (
            <PlaceholderCard key={card} size="compact" />
          ))}
        </Gallery>
      </section>
    ))}
  </div>
);

const FeaturedApplications = () => (
  <div className="chr-prototype-loading-shell__featured-layout" aria-hidden="true">
    <div className="chr-prototype-loading-shell__featured-card">
      <PlaceholderCard size="featured" />
    </div>
    <Gallery className="chr-prototype-loading-shell__featured-side" hasGutter minWidths={COMPACT_GALLERY_MIN_WIDTHS}>
      <PlaceholderCard size="compact" />
      <PlaceholderCard size="compact" />
    </Gallery>
    <Gallery className="chr-prototype-loading-shell__featured-list" hasGutter minWidths={APP_GALLERY_MIN_WIDTHS}>
      {[0, 1, 2, 3].map((card) => (
        <PlaceholderCard key={card} size="compact" />
      ))}
    </Gallery>
  </div>
);

type LoadingShellContentProps = {
  variant?: LoadingShellVariant;
};

export const LoadingShellContent = ({ variant = 'grid' }: LoadingShellContentProps) => (
  <div className="chr-prototype-loading-shell__content">
    <PagePlaceholders />
    <div className="chr-prototype-loading-shell__loading-content" role="status" aria-label="Loading application placeholders">
      {variant === 'grid' && <ApplicationGrid />}
      {variant === 'groups' && <GroupedApplications />}
      {variant === 'featured' && <FeaturedApplications />}
    </div>
  </div>
);

export const LoadingShellRemoteContent = () => (
  <div className="chr-prototype-loading-shell chr-prototype-loading-shell--embedded">
    <LoadingShellContent />
  </div>
);
