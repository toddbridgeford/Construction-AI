import { NextRequest, NextResponse } from 'next/server';
import { buildDashboardDataset } from '@/lib/dashboard-data';
import { GeographyLevel, IndicatorKey } from '@/types/live-data';

const isGeography = (value: string): value is GeographyLevel => ['US', 'Region', 'State', 'City/Metro'].includes(value);
const isIndicator = (value: string): value is IndicatorKey => ['permits', 'spending', 'residentialProxy', 'labor', 'materials', 'mortgage'].includes(value);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const geography = searchParams.get('geography') ?? 'US';
  const region = searchParams.get('region') ?? 'South';
  const state = searchParams.get('state') ?? 'TX';
  const metro = searchParams.get('metro') ?? 'Dallas-Fort Worth';
  const indicator = searchParams.get('indicator') ?? 'permits';

  if (!isGeography(geography) || !isIndicator(indicator)) {
    return NextResponse.json({ error: 'Invalid query parameters.' }, { status: 400 });
  }

  const dataset = await buildDashboardDataset(indicator, geography, region, state, metro);
  return NextResponse.json(dataset, { status: 200 });
}
