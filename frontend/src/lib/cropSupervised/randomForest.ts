export type RandomForestModel = {
  trees: DecisionTree[]
  classIndices: number[]
  featureCount: number
}

type DecisionTree = {
  nodes: TreeNode[]
}

type TreeNode = {
  feature: number
  threshold: number
  left: number
  right: number
  classIndex: number
  isLeaf: boolean
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function gini(labels: number[]): number {
  if (!labels.length) return 0
  const counts = new Map<number, number>()
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1)
  let impurity = 1
  for (const c of counts.values()) {
    const p = c / labels.length
    impurity -= p * p
  }
  return impurity
}

function majorityClass(labels: number[]): number {
  const counts = new Map<number, number>()
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1)
  let best = labels[0] ?? 0
  let bestC = -1
  for (const [l, c] of counts) {
    if (c > bestC) {
      bestC = c
      best = l
    }
  }
  return best
}

function buildTree(
  X: Float32Array[],
  y: number[],
  featureCount: number,
  rng: () => number,
  maxDepth: number,
  minSamplesSplit: number,
  featureSubset: number,
): DecisionTree {
  const nodes: TreeNode[] = []

  const grow = (indices: number[], depth: number): number => {
    const labels = indices.map(i => y[i]!)
    const nodeIdx = nodes.length
    nodes.push({
      feature: -1,
      threshold: 0,
      left: -1,
      right: -1,
      classIndex: majorityClass(labels),
      isLeaf: true,
    })

    const unique = new Set(labels)
    if (unique.size === 1 || depth >= maxDepth || indices.length < minSamplesSplit) {
      return nodeIdx
    }

    const featPool = Array.from({ length: featureCount }, (_, i) => i)
    for (let i = featPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[featPool[i], featPool[j]] = [featPool[j]!, featPool[i]!]
    }
    const feats = featPool.slice(0, Math.max(1, Math.min(featureSubset, featureCount)))

    let bestFeat = -1
    let bestThr = 0
    let bestGain = -1
    const parentGini = gini(labels)

    for (const f of feats) {
      const vals = indices.map(i => X[i]![f]!).sort((a, b) => a - b)
      const uniqThr = new Set<number>()
      for (let i = 0; i < vals.length - 1; i += 1) {
        uniqThr.add((vals[i]! + vals[i + 1]!) / 2)
      }
      for (const thr of uniqThr) {
        const left: number[] = []
        const right: number[] = []
        for (const idx of indices) {
          if (X[idx]![f]! <= thr) left.push(y[idx]!)
          else right.push(y[idx]!)
        }
        if (!left.length || !right.length) continue
        const gain =
          parentGini -
          (left.length / labels.length) * gini(left) -
          (right.length / labels.length) * gini(right)
        if (gain > bestGain) {
          bestGain = gain
          bestFeat = f
          bestThr = thr
        }
      }
    }

    if (bestFeat < 0 || bestGain <= 0) return nodeIdx

    const leftIdx: number[] = []
    const rightIdx: number[] = []
    for (const idx of indices) {
      if (X[idx]![bestFeat]! <= bestThr) leftIdx.push(idx)
      else rightIdx.push(idx)
    }
    if (!leftIdx.length || !rightIdx.length) return nodeIdx

    nodes[nodeIdx] = {
      feature: bestFeat,
      threshold: bestThr,
      left: -1,
      right: -1,
      classIndex: majorityClass(labels),
      isLeaf: false,
    }
    nodes[nodeIdx]!.left = grow(leftIdx, depth + 1)
    nodes[nodeIdx]!.right = grow(rightIdx, depth + 1)
    return nodeIdx
  }

  const allIdx = X.map((_, i) => i)
  grow(allIdx, 0)
  return { nodes }
}

function predictTree(tree: DecisionTree, x: Float32Array): number {
  let node = 0
  while (!tree.nodes[node]!.isLeaf) {
    const n = tree.nodes[node]!
    node = x[n.feature]! <= n.threshold ? n.left : n.right
    if (node < 0) break
  }
  return tree.nodes[node]!.classIndex
}

export function trainRandomForest(
  X: Float32Array[],
  y: number[],
  opts?: { nTrees?: number; maxDepth?: number; minSamplesSplit?: number; seed?: number },
): RandomForestModel {
  const nTrees = opts?.nTrees ?? 40
  const maxDepth = opts?.maxDepth ?? 10
  const minSamplesSplit = opts?.minSamplesSplit ?? 2
  const featureCount = X[0]?.length ?? 0
  const classIndices = Array.from(new Set(y)).sort((a, b) => a - b)
  const featureSubset = Math.max(1, Math.floor(Math.sqrt(featureCount)))
  const trees: DecisionTree[] = []

  for (let t = 0; t < nTrees; t += 1) {
    const rng = mulberry32((opts?.seed ?? 42) + t * 9973)
    const boot: number[] = []
    for (let i = 0; i < X.length; i += 1) boot.push(Math.floor(rng() * X.length))
    const bx = boot.map(i => X[i]!)
    const by = boot.map(i => y[i]!)
    trees.push(buildTree(bx, by, featureCount, rng, maxDepth, minSamplesSplit, featureSubset))
  }

  return { trees, classIndices, featureCount }
}

export function predictRandomForest(
  model: RandomForestModel,
  x: Float32Array,
): { classIndex: number; confidence: number } {
  const votes = new Map<number, number>()
  for (const tree of model.trees) {
    const c = predictTree(tree, x)
    votes.set(c, (votes.get(c) || 0) + 1)
  }
  let best = model.classIndices[0] ?? 0
  let bestV = -1
  for (const [c, v] of votes) {
    if (v > bestV) {
      bestV = v
      best = c
    }
  }
  return { classIndex: best, confidence: bestV / model.trees.length }
}

export function predictBatch(
  model: RandomForestModel,
  X: Float32Array[],
): Array<{ classIndex: number; confidence: number }> {
  return X.map(x => predictRandomForest(model, x))
}

/** Stratified train/test split preserving class proportions. */
export function stratifiedSplit(
  y: number[],
  testFraction: number,
  seed = 42,
): { train: number[]; test: number[] } {
  const rng = mulberry32(seed)
  const byClass = new Map<number, number[]>()
  y.forEach((label, i) => {
    const arr = byClass.get(label) || []
    arr.push(i)
    byClass.set(label, arr)
  })
  const train: number[] = []
  const test: number[] = []
  for (const indices of byClass.values()) {
    const shuffled = [...indices]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    const testN = Math.max(1, Math.round(shuffled.length * testFraction))
    test.push(...shuffled.slice(0, testN))
    train.push(...shuffled.slice(testN))
  }
  if (!train.length && test.length > 1) {
    train.push(test.pop()!)
  }
  return { train, test }
}
