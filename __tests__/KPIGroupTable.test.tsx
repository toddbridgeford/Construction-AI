import { render, screen } from '@testing-library/react';
import { PerplexityDashboard } from '@/components/PerplexityDashboard';
import { describe, expect, it } from 'vitest';

describe('PerplexityDashboard KPI strip', () => {
  it('renders compact KPI cards', () => {
    render(<PerplexityDashboard />);

    expect(screen.getByText('Total Market Index')).toBeInTheDocument();
    expect(screen.getByText('Building Permits')).toBeInTheDocument();
    expect(screen.getByText('Housing Starts')).toBeInTheDocument();
  });
});
