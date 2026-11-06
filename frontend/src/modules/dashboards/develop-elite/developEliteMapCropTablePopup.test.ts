import { describe, expect, it } from 'vitest'
import {
  findDevelopEliteCropRowByFarmCode,
  mergeDevelopEliteCropTableIntoPopupProps,
} from './developEliteMapCropTablePopup'
import type { DevelopEliteLayerMeta } from './developEliteArcgisFetch'

const meta: DevelopEliteLayerMeta = {
  cropTypeLabels: new Map([['7001', 'Tomato Beef']]),
  fieldDomainLabels: new Map(),
}

const link = {
  joinField: 'Farm_Code',
  tableColumns: ['Farm_Code', 'Farm_Name', 'Crop_Type', 'ZONE_ID'],
  cropRows: [
    { Farm_Code: 'MH101', Farm_Name: 'NH-01', Crop_Type: '7001', ZONE_ID: 'MH' },
  ],
  formattedTableRows: [{ _rowId: '1', Farm_Code: 'MH101', _fieldKey: 'k1' }],
  cropMeta: meta,
}

describe('developEliteMapCropTablePopup', () => {
  it('finds crop row by normalized Farm_Code', () => {
    expect(findDevelopEliteCropRowByFarmCode(link, 'mh101')?.Farm_Name).toBe('NH-01')
  })

  it('merges table fields into popup props', () => {
    const { props, cropLinked } = mergeDevelopEliteCropTableIntoPopupProps(
      { Farm_Code: 'MH101', Structure_Type: 1000 },
      link,
    )
    expect(cropLinked).toBe(true)
    expect(props.Farm_Name).toBe('NH-01')
    expect(props.Crop_Type).toBe('Tomato Beef')
  })
})
