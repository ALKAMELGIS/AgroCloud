import { AcpGisDataManager } from './AcpGisDataManager'

type Props = { onClose: () => void }

/** AgroCloud Platform “Add GIS Layer” entry — opens the shared GIS Data Manager with ACP ingest. */
export function AcpAddGisLayerPanel({ onClose }: Props) {
  return <AcpGisDataManager onClose={onClose} />
}
