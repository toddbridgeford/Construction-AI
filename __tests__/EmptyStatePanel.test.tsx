import { render, screen } from '@testing-library/react';
import { EmptyStatePanel } from '@/components/EmptyStatePanel';

describe('EmptyStatePanel', () => {
  it('renders title and detail text', () => {
    render(<EmptyStatePanel title="No data" detail="Try selecting another filter." />);

    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Try selecting another filter.')).toBeInTheDocument();
  });
});
