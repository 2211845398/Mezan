import { PageListSkeleton } from '@/components/shared/PageListSkeleton';

/** Shown while lazy route chunks load — instant navigation with table-shaped placeholder. */
export default function RouteLoader() {
  return <PageListSkeleton />;
}
