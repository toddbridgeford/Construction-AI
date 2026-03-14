'use client';

import React, { useEffect, useMemo, useState } from 'react';

type GeoGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

type GeoFeature = {
  id: string;
  properties?: { name?: string };
  geometry: GeoGeometry;
};

type Props = {
  selectedState: string;
  mapValues: Record<string, number>;
  onSelectState: (state: string) => void;
  indicatorOffset: number;
};

const topoJsonScriptUrl = 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
const usAtlasUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL','02': 'AK','04': 'AZ','05': 'AR','06': 'CA','08': 'CO','09': 'CT','10': 'DE','11': 'DC','12': 'FL','13': 'GA',
  '15': 'HI','16': 'ID','17': 'IL','18': 'IN','19': 'IA','20': 'KS','21': 'KY','22': 'LA','23': 'ME','24': 'MD','25': 'MA',
  '26': 'MI','27': 'MN','28': 'MS','29': 'MO','30': 'MT','31': 'NE','32': 'NV','33': 'NH','34': 'NJ','35': 'NM','36': 'NY',
  '37': 'NC','38': 'ND','39': 'OH','40': 'OK','41': 'OR','42': 'PA','44': 'RI','45': 'SC','46': 'SD','47': 'TN','48': 'TX',
  '49': 'UT','50': 'VT','51': 'VA','53': 'WA','54': 'WV','55': 'WI','56': 'WY'
};

function tone(v: number) {
  if (v >= 80) return '#8af5ff';
  if (v >= 70) return '#43deff';
  if (v >= 60) return '#11b8ff';
  if (v >= 50) return '#3179f6';
  return '#2c3b5a';
}

function projectCoordinate(lon: number, lat: number, stateCode: string) {
  if (stateCode === 'AK') {
    return {
      x: ((lon + 180) * 1.8) + 40,
      y: ((72 - lat) * 1.8) + 245
    };
  }

  if (stateCode === 'HI') {
    return {
      x: ((lon + 161) * 5.2) + 180,
      y: ((24 - lat) * 5.2) + 295
    };
  }

  return {
    x: ((lon + 125) / 59) * 620,
    y: ((49.5 - lat) / 25.5) * 360
  };
}

function ringToPath(ring: number[][], stateCode: string) {
  if (!ring.length) return '';
  const [firstLon, firstLat] = ring[0];
  const first = projectCoordinate(firstLon, firstLat, stateCode);
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 1; i < ring.length; i += 1) {
    const [lon, lat] = ring[i];
    const p = projectCoordinate(lon, lat, stateCode);
    d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  d += ' Z';
  return d;
}

function geometryToPath(feature: GeoFeature, stateCode: string) {
  if (feature.geometry.type === 'Polygon') {
    return (feature.geometry.coordinates as number[][][]).map((ring) => ringToPath(ring, stateCode)).join(' ');
  }
  return (feature.geometry.coordinates as number[][][][])
    .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, stateCode)))
    .join(' ');
}

declare global {
  interface Window {
    topojson?: {
      feature: (topology: unknown, object: unknown) => { features: GeoFeature[] };
    };
  }
}

export function USStateChoropleth({ selectedState, mapValues, onSelectState, indicatorOffset }: Props) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [hover, setHover] = useState<{ code: string; value: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMap() {
      if (!window.topojson) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = topoJsonScriptUrl;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load topojson-client script.'));
          document.head.appendChild(script);
        });
      }

      const response = await fetch(usAtlasUrl);
      if (!response.ok) {
        throw new Error(`Map geometry request failed with ${response.status}`);
      }
      const topology = await response.json();
      const stateFeatures = window.topojson?.feature(topology, topology.objects.states).features ?? [];
      if (mounted) {
        setFeatures(stateFeatures);
      }
    }

    void loadMap().catch(() => {
      if (mounted) {
        setFeatures([]);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const statesWithPath = useMemo(() => {
    return features
      .map((feature) => {
        const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
        if (!code) return null;
        return {
          code,
          name: feature.properties?.name ?? code,
          path: geometryToPath(feature, code)
        };
      })
      .filter((item): item is { code: string; name: string; path: string } => item !== null);
  }, [features]);

  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 620 360" className="h-full w-full" role="img" aria-label="U.S. state choropleth map">
        <rect x="0" y="0" width="620" height="360" fill="#0a1220" rx="14" />
        {statesWithPath.map((state) => {
          const value = (mapValues[state.code] ?? 46) + indicatorOffset;
          const selected = state.code === selectedState;
          return (
            <path
              key={state.code}
              d={state.path}
              fill={tone(value)}
              stroke={selected ? '#f8fafc' : 'rgba(148,163,184,0.65)'}
              strokeWidth={selected ? 1.9 : 0.7}
              opacity={0.98}
              className="cursor-pointer transition-opacity"
              onClick={() => onSelectState(state.code)}
              onMouseMove={(event) => setHover({ code: state.code, value, x: event.clientX, y: event.clientY })}
              onMouseLeave={() => setHover(null)}
              aria-label={`Select ${state.name}`}
            />
          );
        })}
      </svg>

      {hover ? (
        <div
          className="pointer-events-none fixed z-20 rounded-md border border-white/20 bg-[#0b1324] px-2 py-1 text-[11px] text-slate-100 shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="font-semibold">{hover.code}</p>
          <p>{hover.value.toFixed(1)}</p>
        </div>
      ) : null}
    </div>
  );
}
