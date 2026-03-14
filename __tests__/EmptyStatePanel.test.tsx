import { render, screen } from '@testing-library/react';
import { PerplexityDashboard } from '@/components/PerplexityDashboard';
import { describe, expect, it } from 'vitest';

describe('PerplexityDashboard core structure', () => {
  it('renders header and methodology section', () => {
    render(<PerplexityDashboard />);

    expect(screen.getByText('U.S. Construction Market')).toBeInTheDocument();
    expect(screen.getByText('Methodology')).toBeInTheDocument();
  });
});
