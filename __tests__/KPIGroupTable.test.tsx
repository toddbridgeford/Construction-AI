import React from 'react';
import { render, screen } from '@testing-library/react';
import { PerplexityDashboard } from '@/components/PerplexityDashboard';
import { describe, expect, it } from 'vitest';

describe('PerplexityDashboard KPI strip', () => {
  it('renders compact KPI cards', () => {
    render(<PerplexityDashboard />);

    expect(screen.getByText('Permits Level')).toBeInTheDocument();
    expect(screen.getByText('Forecast (3mo)')).toBeInTheDocument();
    expect(screen.getByText('Model Spread')).toBeInTheDocument();
  });
});
