import { render, screen } from '@testing-library/react';
import { StatusChip } from '@/components/StatusChip';

describe('StatusChip', () => {
  it('renders the provided text and tone styling class', () => {
    render(<StatusChip tone="caution" text="caution" />);

    const chip = screen.getByText('caution');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('text-amber-200');
  });
});
