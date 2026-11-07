import { render, screen } from '@testing-library/react';
import FlowDiagram from '@/components/FlowDiagram';

describe('FlowDiagram', () => {
  it('T4: data with no arrows still shows the nodes', () => {
    const { container } = render(
      <FlowDiagram
        title="Title"
        description="Description"
        rows={[
          { id: 'a', label: 'Row A', nodes: [{ id: 'n1', label: 'One' }] },
          { id: 'b', label: 'Row B', nodes: [{ id: 'n2', label: 'Two' }] },
        ]}
        arrows={[]}
      />,
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(container.querySelectorAll('line')).toHaveLength(0);
  });
});
