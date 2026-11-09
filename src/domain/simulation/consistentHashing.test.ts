import {
  DEFAULT_SETTINGS,
  PRESETS,
  assignKeys,
  ringPositions,
  simulate,
  type Settings,
} from '@/domain/simulation/consistentHashing';

const base = (over: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...over,
});
const add = { type: 'add' } as const;

describe('consistent hashing simulation', () => {
  it('T1: same seed and defaults give identical stats', () => {
    expect(simulate(base({ change: add }))).toEqual(
      simulate(base({ change: add })),
    );
  });

  it('T2: adding a node moves most keys with modulo, few with the ring', () => {
    const modulo = simulate(base({ strategy: 'modulo', change: add })).report!;
    const ring = simulate(
      base({ strategy: 'ring', virtualNodes: 100, change: add }),
    ).report!;
    expect(modulo.shareMoved).toBeGreaterThan(0.6);
    expect(ring.shareMoved).toBeLessThan(0.35);
  });

  it('T3: more virtual nodes even out the key counts', () => {
    const one = simulate(base({ ...PRESETS.noVirtualNodes })).before;
    const many = simulate(base({ virtualNodes: 100 })).before;
    expect(many.keyMaxAvg).toBeLessThan(one.keyMaxAvg);
  });

  it('T4: removing n2 moves only its keys, to several nodes', () => {
    const r = simulate(base({ ...PRESETS.removeNode, virtualNodes: 100 }));
    const n2Keys = r.before.nodes.find((n) => n.nodeId === 'n2')!.keys;
    expect(r.report!.keysMoved).toBe(n2Keys);
    const targets = Object.keys(r.report!.removedKeysTo);
    expect(targets.length).toBeGreaterThanOrEqual(3);
    expect(targets).not.toContain('n2');
    expect(
      Object.values(r.report!.removedKeysTo).reduce((a, b) => a + b, 0),
    ).toBe(n2Keys);
  });

  it('T5: rendezvous moves about a fifth of keys when a node joins', () => {
    const share = simulate(base({ strategy: 'rendezvous', change: add }))
      .report!.shareMoved;
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.3);
  });

  it('T6: the hot key owner has the highest request load', () => {
    for (const strategy of ['modulo', 'ring', 'rendezvous'] as const) {
      const { before } = simulate(base({ ...PRESETS.hotKey, strategy }));
      const top = [...before.nodes].sort(
        (a, b) => b.requestsPerTick - a.requestsPerTick,
      )[0];
      expect(top.nodeId).toBe(before.owners[0]);
    }
  });

  it('T7: one node owns every key without error', () => {
    const { before } = simulate(base({ nodeIds: ['n0'] }));
    expect(before.nodes).toEqual([
      { nodeId: 'n0', keys: 1000, requestsPerTick: 50 },
    ]);
  });

  it('T8: removing the last node or V=0 is rejected', () => {
    expect(() =>
      simulate(
        base({ nodeIds: ['n0'], change: { type: 'remove', nodeId: 'n0' } }),
      ),
    ).toThrow(/last node/);
    expect(() => simulate(base({ virtualNodes: 0 }))).toThrow(/virtualNodes/);
  });

  it('T9: ring positions are sorted, in [0,1) and tagged', () => {
    const positions = ringPositions({
      nodeIds: ['n0', 'n1', 'n2'],
      virtualNodes: 10,
    });
    expect(positions).toHaveLength(30);
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i].position).toBeGreaterThanOrEqual(0);
      expect(positions[i].position).toBeLessThan(1);
      if (i > 0)
        expect(positions[i].position).toBeGreaterThanOrEqual(
          positions[i - 1].position,
        );
    }
    for (const id of ['n0', 'n1', 'n2']) {
      const mine = positions.filter((p) => p.nodeId === id);
      expect(mine.map((p) => p.vnodeIndex).sort((a, b) => a - b)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
    }
  });

  it('strategies see the same keys and requests', () => {
    const totals = (s: Settings['strategy']) =>
      simulate(base({ strategy: s })).before.nodes.reduce(
        (a, n) => a + n.requestsPerTick,
        0,
      );
    expect(totals('modulo')).toBeCloseTo(50);
    expect(totals('ring')).toBeCloseTo(50);
    expect(totals('rendezvous')).toBeCloseTo(50);
    expect(assignKeys(base(), ['n0'])).toHaveLength(1000);
  });

  it('rejects invalid settings with a clear error', () => {
    expect(() => simulate(base({ nodeIds: [] }))).toThrow(/Invalid settings/);
    expect(() => simulate(base({ keys: 0 }))).toThrow(/keys/);
    expect(() => simulate(base({ virtualNodes: -1 }))).toThrow(/virtualNodes/);
  });
});
