import HomeIcon from '@mui/icons-material/Home'
import MapIcon from '@mui/icons-material/Map'
import StorageIcon from '@mui/icons-material/Storage'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { agroTokens } from '@/theme/tokens'

const tabs = [
  { value: '/', label: 'Home', icon: <HomeIcon />, match: (p: string) => p === '/' },
  { value: '/satellite/gis', label: 'Map', icon: <MapIcon />, match: (p: string) => p.includes('/gis') || p.includes('/satellite') },
  { value: '/data/ec-ph', label: 'Data', icon: <StorageIcon />, match: (p: string) => p.startsWith('/data') },
  { value: '/admin/users', label: 'More', icon: <MoreHorizIcon />, match: (p: string) => p.startsWith('/admin') || p.startsWith('/account') },
]

export function MobileBottomNav({ onMore }: { onMore?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname

  const current =
    tabs.find((t) => t.match(path))?.value ??
    (path.startsWith('/admin') || path.startsWith('/account') ? '/admin/users' : '/')

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (t) => t.zIndex.appBar,
        pb: 'env(safe-area-inset-bottom, 0px)',
        display: { xs: 'block', md: 'none' },
      }}
    >
      <BottomNavigation
        value={current}
        onChange={(_, v) => {
          if (v === '/admin/users' && onMore) {
            onMore()
            return
          }
          navigate(v)
        }}
        showLabels
        sx={{ minHeight: agroTokens.bottomNavHeight }}
      >
        {tabs.map((t) => (
          <BottomNavigationAction key={t.value} label={t.label} value={t.value} icon={t.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
