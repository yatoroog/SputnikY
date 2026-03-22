import ClientAppShell from '@/components/app/ClientAppShell';
import SafeMobileApp from '@/components/app/SafeMobileApp';
import { fetchSatelliteCatalog } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const safeParam = resolvedSearchParams.safe;
  const useSafeMobile =
    safeParam === '1' || (Array.isArray(safeParam) && safeParam.includes('1'));

  const initialCatalog = await fetchSatelliteCatalog().catch(() => ({
    satellites: [],
    catalogStatus: null,
    filterFacets: null,
  }));

  return (
    <div className="h-dvh w-screen bg-cosmos-bg">
      {useSafeMobile ? (
        <SafeMobileApp
          initialSatellites={initialCatalog.satellites}
          initialCatalogStatus={initialCatalog.catalogStatus}
        />
      ) : (
        <ClientAppShell
          initialSatellites={initialCatalog.satellites}
          initialCatalogStatus={initialCatalog.catalogStatus}
        />
      )}
    </div>
  );
}
