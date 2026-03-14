import { render, screen } from '@testing-library/react';
import { PerplexityDashboard } from '@/components/PerplexityDashboard';
import { describe, expect, it } from 'vitest';

describe('PerplexityDashboard map/chart layout', () => {
  it('renders choropleth map label and time-series label', () => {
    render(<PerplexityDashboard />);

    expect(screen.getByText('U.S. State Choropleth')).toBeInTheDocument();
    expect(screen.getByText('Construction Market Time Series')).toBeInTheDocument();
  });
});
