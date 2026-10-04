import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import { DevelopEliteMapDataLayerList } from './DevelopEliteMapDataLayerList'

type Props = {
  order: DevelopEliteMapDataLayerId[]
  visibility: Record<DevelopEliteMapDataLayerId, boolean>
  onOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  onVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
}

export function DevelopEliteMapLayersPanel({
  order,
  visibility,
  onOrderChange,
  onVisibilityChange,
}: Props) {
  return (
    <div className="develop-elite-map__layers-panel">
      <DevelopEliteMapDataLayerList
        order={order}
        visibility={visibility}
        onOrderChange={onOrderChange}
        onVisibilityChange={onVisibilityChange}
      />
    </div>
  )
}
