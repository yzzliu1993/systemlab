import { render, screen, within } from '@testing-library/react';
import en from '@/content/locales/en.json';
import RoadmapHome from '@/features/roadmap-view/RoadmapHome';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const stage = (
  id: 'one-person' | 'long-line' | 'prep-shelf',
  open: boolean,
) => ({
  id,
  title: `stage.${id}.title`,
  summary: `stage.${id}.summary`,
  prerequisites: [],
  open,
});

describe('RoadmapHome', () => {
  it('T1: the shipped roadmap shows only the long line, as a link', () => {
    render(<RoadmapHome />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(en['stage.long-line.title']);
  });

  it('T2: two open stages show numbered 1 and 2 in order', () => {
    render(
      <RoadmapHome
        nodes={[
          stage('one-person', true),
          stage('prep-shelf', false),
          stage('long-line', true),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/1$/)).toBeInTheDocument();
    expect(items[0]).toHaveTextContent(en['stage.one-person.title']);
    expect(within(items[1]).getByText(/2$/)).toBeInTheDocument();
    expect(items[1]).toHaveTextContent(en['stage.long-line.title']);
  });

  it('T3: no open stage shows the title and no list', () => {
    render(<RoadmapHome nodes={[stage('one-person', false)]} />);
    expect(
      screen.getByRole('heading', { name: en['home.title'] }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
