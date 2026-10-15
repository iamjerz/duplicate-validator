/**
 * Some source systems (this app was built against freight-invoice audit
 * exports) give every record a "Root Id" that is supposed to point at the
 * one shared root of its duplicate family - but in a multi-hop chain, one
 * record's Root Id instead points at a SIBLING record's own identifying
 * value (e.g. its "Invoice Id"), not at the family's ultimate shared root.
 * Record C's Root Id might equal record B's Invoice Id, while record B's
 * Root Id equals record A's Invoice Id - A, B and C are one family, but C's
 * Root Id never literally equals A's. A plain exact-value grouping on Root
 * Id alone would split such a family into two or three separate groups.
 *
 * This resolves those chains with a union-find, but ONLY among rows that
 * already agree on every OTHER SAME field (the caller's `restKey` grouping)
 * - it never looks at rows outside that bucket. That is what keeps it safe:
 * a coincidental value collision on some unrelated row elsewhere in the file
 * can never merge two genuinely different invoices, because that row would
 * never even reach the same bucket in the first place.
 */

interface UnionFind {
  find: (x: number) => number
  union: (a: number, b: number) => void
}

function createUnionFind(items: number[]): UnionFind {
  const parent = new Map<number, number>()
  for (const item of items) parent.set(item, item)

  function find(x: number): number {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }

  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  return { find, union }
}

/**
 * Resolves one restKey-bucket's rows into their final connected components:
 *  - rows sharing the exact same (non-blank) chain value are unioned, same
 *    as plain exact-match grouping would already do on its own.
 *  - a row is ALSO unioned with whichever other row in the bucket owns an
 *    identity value (a UNIQUE field's value) equal to this row's chain
 *    value - the "points at a sibling instead of the root" case.
 * A genuine collision (two rows in the bucket sharing the same identity
 * value) resolves to whichever row was seen last - a harmless fallback for
 * data where a "unique" field is not actually unique, not a correctness
 * concern for the common case this exists to solve.
 */
function resolveBucket<T extends string | number>(
  rowIndices: number[],
  chainValueOf: (rowIndex: number) => T,
  identityValuesOf: (rowIndex: number) => T[]
): number[][] {
  if (rowIndices.length <= 1) return [rowIndices]

  const uf = createUnionFind(rowIndices)

  const byChainValue = new Map<T, number[]>()
  for (const ri of rowIndices) {
    const value = chainValueOf(ri)
    const bucket = byChainValue.get(value)
    if (bucket) bucket.push(ri)
    else byChainValue.set(value, [ri])
  }
  for (const bucket of byChainValue.values()) {
    for (let k = 1; k < bucket.length; k++) uf.union(bucket[0], bucket[k])
  }

  const identityOwner = new Map<T, number>()
  for (const ri of rowIndices) {
    for (const identityValue of identityValuesOf(ri)) identityOwner.set(identityValue, ri)
  }
  for (const ri of rowIndices) {
    const owner = identityOwner.get(chainValueOf(ri))
    if (owner !== undefined && owner !== ri) uf.union(ri, owner)
  }

  const components = new Map<number, number[]>()
  for (const ri of rowIndices) {
    const root = uf.find(ri)
    const bucket = components.get(root)
    if (bucket) bucket.push(ri)
    else components.set(root, [ri])
  }
  return [...components.values()]
}

/**
 * Groups a set of already-"clean" (no blank required field) row indices,
 * first by `restKeyOf` (every SAME field except the chain field - rows that
 * disagree on any of those can never be one family regardless of chaining),
 * then resolves chained references within each resulting bucket via
 * `resolveBucket`. Bucket order and within-bucket row order are not
 * meaningful; callers needing a stable group order should sort afterward.
 */
export function groupRowsWithChaining<T extends string | number>(
  rowIndices: number[],
  restKeyOf: (rowIndex: number) => string,
  chainValueOf: (rowIndex: number) => T,
  identityValuesOf: (rowIndex: number) => T[]
): number[][] {
  const buckets = new Map<string, number[]>()
  for (const ri of rowIndices) {
    const key = restKeyOf(ri)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(ri)
    else buckets.set(key, [ri])
  }

  const groups: number[][] = []
  for (const bucket of buckets.values()) {
    groups.push(...resolveBucket(bucket, chainValueOf, identityValuesOf))
  }
  return groups
}
