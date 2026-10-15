import { describe, it, expect } from 'vitest'
import { groupRowsWithChaining } from '../ChainedFieldResolver'

/** Fixture row: [restKey, chainValue, ...identityValues]. */
function setup(fixture: { restKey: string; chainValue: string; identityValues?: string[] }[]) {
  const restKeyOf = (ri: number) => fixture[ri].restKey
  const chainValueOf = (ri: number) => fixture[ri].chainValue
  const identityValuesOf = (ri: number) => fixture[ri].identityValues ?? []
  const rowIndices = fixture.map((_, i) => i)
  return groupRowsWithChaining(rowIndices, restKeyOf, chainValueOf, identityValuesOf)
}

function sortedBySize(groups: number[][]): number[][] {
  return groups.map((g) => [...g].sort((a, b) => a - b)).sort((a, b) => a.length - b.length || a[0] - b[0])
}

describe('groupRowsWithChaining', () => {
  it('reproduces plain exact-match grouping when nothing chains', () => {
    const groups = setup([
      { restKey: 'A', chainValue: 'root-1', identityValues: ['id-1'] },
      { restKey: 'A', chainValue: 'root-1', identityValues: ['id-2'] },
      { restKey: 'A', chainValue: 'root-9', identityValues: ['id-3'] },
    ])
    expect(sortedBySize(groups)).toEqual([[2], [0, 1]])
  })

  it('never merges rows with different rest keys, even if chain values match', () => {
    const groups = setup([
      { restKey: 'A', chainValue: 'root-1', identityValues: ['id-1'] },
      { restKey: 'B', chainValue: 'root-1', identityValues: ['id-2'] },
    ])
    expect(sortedBySize(groups)).toEqual([[0], [1]])
  })

  it('connects a record whose chain value points at a sibling\'s identity instead of the shared root', () => {
    // A is the family's root (self-referencing). B's Root Id points at A's
    // identity. C's Root Id points at B's identity, not at A directly - a
    // two-hop chain. All three share the same rest key (every other SAME
    // field already agrees).
    const groups = setup([
      { restKey: 'A', chainValue: 'root-1', identityValues: ['root-1'] }, // A
      { restKey: 'A', chainValue: 'root-1', identityValues: ['id-b'] }, // B -> A
      { restKey: 'A', chainValue: 'id-b', identityValues: ['id-c'] }, // C -> B
    ])
    expect(sortedBySize(groups)).toEqual([[0, 1, 2]])
  })

  it('does not connect two different families that happen to share a rest key', () => {
    const groups = setup([
      { restKey: 'A', chainValue: 'root-1', identityValues: ['id-1'] },
      { restKey: 'A', chainValue: 'root-1', identityValues: ['id-2'] },
      { restKey: 'A', chainValue: 'root-9', identityValues: ['id-9'] },
      { restKey: 'A', chainValue: 'root-9', identityValues: ['id-10'] },
    ])
    expect(sortedBySize(groups)).toEqual([
      [0, 1],
      [2, 3],
    ])
  })

  it('a lone row with no chain partner is its own group', () => {
    const groups = setup([{ restKey: 'A', chainValue: 'root-1', identityValues: ['id-1'] }])
    expect(groups).toEqual([[0]])
  })

  it('a genuine identity collision resolves without throwing (last writer wins, never corrupts other rows)', () => {
    const groups = setup([
      { restKey: 'A', chainValue: 'root-1', identityValues: ['dup-id'] },
      { restKey: 'A', chainValue: 'root-2', identityValues: ['dup-id'] },
      { restKey: 'A', chainValue: 'dup-id', identityValues: [] },
    ])
    // The third row chains to whichever of the first two owns "dup-id" last -
    // either is an acceptable, non-corrupting outcome for this edge case.
    expect(groups.length).toBe(2)
    expect(groups.flat().sort()).toEqual([0, 1, 2])
  })
})
