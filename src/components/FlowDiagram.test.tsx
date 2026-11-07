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

  const rows = [
    { id: 'a', label: 'Row A', nodes: [{ id: 'n1', label: 'One' }] },
    { id: 'b', label: 'Row B', nodes: [{ id: 'n2', label: 'Two' }] },
  ];

  it('T5: two diagrams each keep their own description', () => {
    render(
      <>
        <FlowDiagram
          title="First"
          description="About one"
          rows={rows}
          arrows={[]}
        />
        <FlowDiagram
          title="Second"
          description="About two"
          rows={rows}
          arrows={[]}
        />
      </>,
    );
    expect(
      screen.getByRole('img', { name: 'First' }),
    ).toHaveAccessibleDescription('About one');
    expect(
      screen.getByRole('img', { name: 'Second' }),
    ).toHaveAccessibleDescription('About two');
  });

  it('T6: a map link has no arrowhead and a flow link does', () => {
    const { container } = render(
      <FlowDiagram
        title="Title"
        description="Description"
        rows={rows}
        arrows={[
          { from: 'n1', to: 'n2', kind: 'map' },
          { from: 'n1', to: 'n2' },
        ]}
      />,
    );
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toHaveAttribute('marker-end');
    expect(lines[1]).toHaveAttribute('marker-end');
  });
});
