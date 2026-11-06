import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/app/App';
import en from '@/content/locales/en.json';
import zhTW from '@/content/locales/zh-TW.json';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
  document.documentElement.lang = 'en';
  useLanguage.setState({ language: 'en' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const stageIds = [
  'one-person',
  'order-window',
  'more-hands',
  'long-line',
  'prep-shelf',
  'order-rail',
  'second-branch',
] as const;

describe('App', () => {
  it('T1: home lists seven stages in order, only the long line is a link', () => {
    render(<App />);
    const main = within(screen.getByRole('main'));
    const items = main.getAllByRole('listitem');
    expect(items).toHaveLength(7);
    stageIds.forEach((id, i) => {
      expect(items[i]).toHaveTextContent(en[`stage.${id}.title`]);
    });
    const links = main.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent(en['stage.long-line.title']);
  });

  it('T2: following the long line link shows the lesson', async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole('link', { name: en['stage.long-line.title'] }),
    );
    expect(
      await screen.findByRole('heading', { name: en['lesson.story.heading'] }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('game-area')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: en['lesson.term.heading'] }),
    ).toBeInTheDocument();
  });

  it('T3: switching to Chinese changes text and lang', async () => {
    render(<App />);
    await userEvent.click(
      screen.getByRole('button', { name: zhTW['lang.zh-TW'] }),
    );
    expect(
      screen.getByRole('heading', { name: zhTW['home.title'] }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-TW');
  });

  it('T4: a saved Chinese choice is used on start', () => {
    localStorage.setItem('systemlab.language', 'zh-TW');
    useLanguage.getState().hydrate();
    render(<App />);
    expect(
      screen.getByRole('heading', { name: zhTW['home.title'] }),
    ).toBeInTheDocument();
  });

  it('T5: storage errors do not stop the switch', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<App />);
    await userEvent.click(
      screen.getByRole('button', { name: zhTW['lang.zh-TW'] }),
    );
    expect(
      screen.getByRole('heading', { name: zhTW['home.title'] }),
    ).toBeInTheDocument();
  });

  it('T8: an unknown hash shows the home page', () => {
    window.location.hash = '#/somewhere/else';
    render(<App />);
    expect(
      screen.getByRole('heading', { name: en['home.title'] }),
    ).toBeInTheDocument();
  });
});
