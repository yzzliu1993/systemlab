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

describe('App header site name', () => {
  it('T1: English header shows System Design', () => {
    render(<App />);
    const header = within(screen.getByRole('banner'));
    expect(header.getByText('System Design')).toBeInTheDocument();
  });

  it('T2: Chinese header shows System Design', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<App />);
    const header = within(screen.getByRole('banner'));
    expect(header.getByText('System Design')).toBeInTheDocument();
  });
});

describe('App', () => {
  it('T1: home lists the load-balancing chapter as a link', () => {
    render(<App />);
    const main = within(screen.getByRole('main'));
    const links = main.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Load balancing');
    expect(links[0]).toHaveAttribute('href', '#/chapter/load-balancing');
    expect(links[1]).toHaveTextContent('Message queue');
    expect(links[1]).toHaveAttribute('href', '#/chapter/message-queue');
  });

  it('T2: following the chapter link shows the chapter page', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'Load balancing' }));
    expect(
      await screen.findByRole('heading', {
        name: en['chapter.section.situation'],
      }),
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

  it('T6: an unknown chapter or old lesson hash shows the home page', () => {
    window.location.hash = '#/lesson/long-line';
    render(<App />);
    expect(
      screen.getByRole('heading', { name: en['home.title'] }),
    ).toBeInTheDocument();
  });
});
