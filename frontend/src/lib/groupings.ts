import type {
  BreakdownItem,
  MetricRange,
  Satellite,
  SatelliteGrouping,
} from '@/types';

const MIN_GROUPING_SIZE = 2;

type GroupRule = {
  id: string;
  label: string;
  patterns: RegExp[];
};

const GROUP_RULES: GroupRule[] = [
  {
    id: 'iss-complex',
    label: 'ISS / околостанционный комплекс',
    patterns: [
      /^ISS\b/i,
      /^POISK\b/i,
      /^SOYUZ-MS\b/i,
      /^PROGRESS-MS\b/i,
      /^CREW DRAGON\b/i,
      /^HTV-X\b/i,
    ],
  },
  {
    id: 'css-complex',
    label: 'CSS / околостанционный комплекс',
    patterns: [/^CSS\b/i, /^TIANZHOU\b/i, /^SHENZHOU\b/i, /^SZ-\d+\s+MODULE\b/i],
  },
  {
    id: 'rocket-bodies',
    label: 'Ракетные ступени и объекты запуска',
    patterns: [
      /\bR\/B\b/i,
      /\bDEB\b/i,
      /^SL-\d+/i,
      /^CZ-\d+/i,
      /^ARIANE\b/i,
      /^DELTA\b/i,
      /^ATLAS\b/i,
      /^THOR\b/i,
      /^FREGAT\b/i,
      /^TITAN\b/i,
      /^GSLV\b/i,
    ],
  },
  {
    id: 'gps',
    label: 'GPS / Navstar',
    patterns: [/^GPS\b/i],
  },
  {
    id: 'cosmos',
    label: 'COSMOS',
    patterns: [/^COSMOS\b/i],
  },
  {
    id: 'fengyun',
    label: 'FengYun',
    patterns: [/^FENGYUN\b/i],
  },
  {
    id: 'tianmu-1',
    label: 'TIANMU-1',
    patterns: [/^TIANMU-1\b/i],
  },
  {
    id: 'tevel-2',
    label: 'TEVEL-2',
    patterns: [/^TEVEL2-/i],
  },
  {
    id: 'cygnss',
    label: 'CYGNSS',
    patterns: [/^CYGFM\d+/i],
  },
  {
    id: 'navic',
    label: 'NavIC / IRNSS',
    patterns: [/^(IRNSS|NVS)\b/i],
  },
  {
    id: 'qzss',
    label: 'QZSS',
    patterns: [/^QZS-\d+/i],
  },
  {
    id: 'noaa',
    label: 'NOAA / JPSS',
    patterns: [/^NOAA\b/i],
  },
  {
    id: 'goes',
    label: 'GOES',
    patterns: [/^GOES\b/i, /^EWS-G2\b/i],
  },
  {
    id: 'meteosat',
    label: 'Meteosat',
    patterns: [/^METEOSAT\b/i],
  },
  {
    id: 'meteor',
    label: 'Meteor-M',
    patterns: [/^METEOR\b/i],
  },
  {
    id: 'himawari',
    label: 'Himawari',
    patterns: [/^HIMAWARI\b/i],
  },
  {
    id: 'insat',
    label: 'INSAT',
    patterns: [/^INSAT\b/i],
  },
  {
    id: 'dmsp',
    label: 'DMSP',
    patterns: [/^DMSP\b/i],
  },
  {
    id: 'starlink',
    label: 'Starlink',
    patterns: [/^STARLINK\b/i],
  },
  {
    id: 'oneweb',
    label: 'OneWeb',
    patterns: [/^ONEWEB\b/i],
  },
  {
    id: 'iridium',
    label: 'Iridium',
    patterns: [/^IRIDIUM\b/i],
  },
  {
    id: 'globalstar',
    label: 'Globalstar',
    patterns: [/^GLOBALSTAR\b/i],
  },
  {
    id: 'orbcomm',
    label: 'Orbcomm',
    patterns: [/^ORBCOMM\b/i],
  },
];

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'other'
  );
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, 'ru'));
}

function uniqNonEmpty(values: string[]): string[] {
  return sortStrings(
    Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
  );
}

function buildBreakdown(values: string[]): BreakdownItem[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label, 'ru')
    );
}

function buildRange(values: number[]): MetricRange | null {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }

  return {
    min: Math.min(...filtered),
    max: Math.max(...filtered),
  };
}

function buildAverage(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) {
    return 0;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function deriveFallbackLabel(name: string): string {
  const cleaned = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Прочие';
  }

  const tokens = cleaned.split(' ');
  const [first = '', second = '', third = ''] = tokens;

  if (!second) {
    return first;
  }

  if (second === 'OBJECT') {
    return third ? `${first} ${second}` : first;
  }

  if (third === 'R/B' || third === 'DEB') {
    return `${first} ${second} ${third}`;
  }

  if (second === 'R/B' || second === 'DEB') {
    return `${first} ${second}`;
  }

  if (/^\d/.test(second)) {
    return first;
  }

  if (/^[A-Z0-9/-]+$/.test(second) && second.length <= 4) {
    return `${first} ${second}`;
  }

  return first;
}

function resolveGrouping(name: string): { id: string; label: string } {
  for (const rule of GROUP_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(name))) {
      return { id: rule.id, label: rule.label };
    }
  }

  const fallbackLabel = deriveFallbackLabel(name);
  return {
    id: `auto-${slugify(fallbackLabel)}`,
    label: fallbackLabel,
  };
}

function sortSatellites(satellites: Satellite[]): Satellite[] {
  return [...satellites].sort(
    (left, right) =>
      left.name.localeCompare(right.name, 'ru') || left.noradId - right.noradId
  );
}

function buildGrouping(
  id: string,
  label: string,
  satellites: Satellite[]
): SatelliteGrouping {
  const sortedSatellites = sortSatellites(satellites);
  const orbitTypeBreakdown = buildBreakdown(
    sortedSatellites.map((satellite) => satellite.orbitType)
  );

  return {
    id,
    label,
    satellites: sortedSatellites,
    satelliteCount: sortedSatellites.length,
    countries: uniqNonEmpty(sortedSatellites.map((satellite) => satellite.country)),
    purposes: uniqNonEmpty(sortedSatellites.map((satellite) => satellite.purpose)),
    orbitTypes: uniqNonEmpty(sortedSatellites.map((satellite) => satellite.orbitType)),
    countryBreakdown: buildBreakdown(
      sortedSatellites.map((satellite) => satellite.country)
    ),
    purposeBreakdown: buildBreakdown(
      sortedSatellites.map((satellite) => satellite.purpose)
    ),
    orbitTypeBreakdown,
    altitudeRange: buildRange(
      sortedSatellites.map((satellite) => satellite.altitude)
    ),
    inclinationRange: buildRange(
      sortedSatellites.map((satellite) => satellite.inclination)
    ),
    periodRange: buildRange(sortedSatellites.map((satellite) => satellite.period)),
    velocityRange: buildRange(
      sortedSatellites.map((satellite) => satellite.velocity)
    ),
    averageAltitude: buildAverage(
      sortedSatellites.map((satellite) => satellite.altitude)
    ),
    averageInclination: buildAverage(
      sortedSatellites.map((satellite) => satellite.inclination)
    ),
    averagePeriod: buildAverage(sortedSatellites.map((satellite) => satellite.period)),
    averageVelocity: buildAverage(
      sortedSatellites.map((satellite) => satellite.velocity)
    ),
    primaryOrbitType: orbitTypeBreakdown[0]?.label ?? '',
  };
}

export function buildSatelliteGroupings(
  satellites: Satellite[]
): SatelliteGrouping[] {
  const buckets = new Map<
    string,
    {
      label: string;
      satellites: Satellite[];
    }
  >();

  for (const satellite of satellites) {
    const grouping = resolveGrouping(satellite.name);
    const bucket = buckets.get(grouping.id);

    if (bucket) {
      bucket.satellites.push(satellite);
      continue;
    }

    buckets.set(grouping.id, {
      label: grouping.label,
      satellites: [satellite],
    });
  }

  return Array.from(buckets.entries())
    .map(([id, bucket]) => buildGrouping(id, bucket.label, bucket.satellites))
    .filter((grouping) => grouping.satelliteCount >= MIN_GROUPING_SIZE)
    .sort(
      (left, right) =>
        right.satelliteCount - left.satelliteCount ||
        left.label.localeCompare(right.label, 'ru')
    );
}

export function formatGroupingBreakdown(
  items: BreakdownItem[],
  limit: number = 3
): string {
  if (items.length === 0) {
    return '—';
  }

  return items
    .slice(0, limit)
    .map((item) => `${item.label} ${item.count}`)
    .join(' · ');
}

export function formatMetricRange(
  range: MetricRange | null,
  formatter: (value: number) => string
): string {
  if (!range) {
    return '—';
  }

  if (Math.abs(range.max - range.min) < 0.05) {
    return formatter(range.min);
  }

  return `${formatter(range.min)} - ${formatter(range.max)}`;
}
