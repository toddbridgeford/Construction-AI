import { render, screen } from '@testing-library/react';
import { KPIGroupTable } from '@/components/KPIGroupTable';
import { KPIGroup } from '@/types';

describe('KPIGroupTable', () => {
  it('renders group title, metrics, and tone chip', () => {
    const group: KPIGroup = {
      id: '1',
      title: 'Critical KPIs',
      items: [
        {
          metric: 'Backlog',
          latest: '$2.1B',
          mom: '+2.1%',
          yoy: '+12.0%',
          takeaway: 'Pipeline remains strong',
          tone: 'positive'
        }
      ]
    };

    render(<KPIGroupTable group={group} />);

    expect(screen.getByRole('heading', { name: 'Critical KPIs' })).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Pipeline remains strong')).toBeInTheDocument();
    expect(screen.getByText('positive')).toBeInTheDocument();
  });
});
