import { beforeEach, describe, expect, it } from 'vitest'
import {
  listChartableFtwAoiSessions,
  listFtwAoiSessions,
  pruneStaleFtwAoiSessions,
  saveFtwAoiSession,
} from './ftwAoiTrainingPersistence'
import { emptyFtwAoiSession } from './ftwAoiTrainingTypes'

const STORAGE_KEY = 'agrocloud.ftwAoiTraining.v1'

describe('ftwAoiTrainingPersistence pruning', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY)
  })

  it('prunes idle polygon-edit stubs but keeps trained sessions', () => {
    const stub = emptyFtwAoiSession('draw:poly-a', 'Active AOI (Edit)')
    stub.areaHa = 12
    saveFtwAoiSession(stub)

    const trained = emptyFtwAoiSession('draw:poly-b', 'Active AOI (Edit)')
    trained.datasetId = 'ds-1'
    trained.dataset = { train: 7, validation: 2, test: 1, total: 10 }
    saveFtwAoiSession(trained)

    expect(listFtwAoiSessions()).toHaveLength(2)

    pruneStaleFtwAoiSessions(['draw:poly-a'])

    expect(listFtwAoiSessions()).toHaveLength(2)
    expect(listChartableFtwAoiSessions('draw:poly-a')).toHaveLength(2)
  })

  it('drops unstored idle stubs when not in keep list', () => {
    const stub = emptyFtwAoiSession('draw:poly-old', 'Active AOI (Edit)')
    stub.areaHa = 5
    saveFtwAoiSession(stub)

    pruneStaleFtwAoiSessions([])

    expect(listFtwAoiSessions()).toHaveLength(0)
  })
})
