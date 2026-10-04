import { useState, type ReactNode } from 'react'
import {
  AppBar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import { NavLink, useLocation } from 'react-router-dom'
import { useLanguage } from '@/core/localization/i18n'
import { useMergedNavigation } from '@/core/state/SystemSettingsContext'
import { agroTokens } from '@/theme/tokens'
import { MobileBottomNav } from '../navigation/MobileBottomNav'

type MuiAppShellProps = {
  children: ReactNode
  mainClassName?: string
  onLogout?: () => void
}

export function MuiAppShell({ children, mainClassName, onLogout }: MuiAppShellProps) {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [mobileOpen, setMobileOpen] = useState(false)
  const { home, groups } = useMergedNavigation()
  const { language } = useLanguage()
  const location = useLocation()
  const label = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const isExternalEmbed = mainClassName?.includes('content--external-embed')

  const drawer = (
    <Box sx={{ width: agroTokens.drawerWidth, pt: 1 }} role="navigation" aria-label="Main">
      <List dense>
        <ListItemButton component={NavLink} to={home.path} selected={location.pathname === home.path}>
          <ListItemText primary={label(home.labelEn, home.labelAr)} />
        </ListItemButton>
        {groups.map((g) => (
          <Box key={g.id}>
            <Typography variant="overline" sx={{ px: 2, py: 1, display: 'block' }} color="text.secondary">
              {label(g.labelEn, g.labelAr)}
            </Typography>
            {g.children.map((leaf) => (
              <ListItemButton
                key={leaf.id}
                component={NavLink}
                to={leaf.path}
                selected={location.pathname === leaf.path || location.pathname.startsWith(`${leaf.path}/`)}
                onClick={() => !isDesktop && setMobileOpen(false)}
              >
                <ListItemText primary={label(leaf.labelEn, leaf.labelAr)} />
              </ListItemButton>
            ))}
          </Box>
        ))}
      </List>
      <Divider />
      {onLogout ? (
        <ListItemButton onClick={onLogout} sx={{ mt: 1 }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={language === 'ar' ? 'تسجيل الخروج' : 'Logout'} />
        </ListItemButton>
      ) : null}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ minHeight: agroTokens.headerHeight, pt: 'env(safe-area-inset-top, 0px)' }}>
          {!isDesktop ? (
            <IconButton edge="start" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            AGROCLOUD
          </Typography>
        </Toolbar>
      </AppBar>

      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: agroTokens.drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: {
              width: agroTokens.drawerWidth,
              boxSizing: 'border-box',
              top: agroTokens.headerHeight,
              height: `calc(100% - ${agroTokens.headerHeight}px)`,
            },
          }}
        >
          {drawer}
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ [`& .MuiDrawer-paper`]: { width: agroTokens.drawerWidth } }}
        >
          {drawer}
        </Drawer>
      )}

      <Box
        component="main"
        className={mainClassName}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          pt: `calc(${agroTokens.headerHeight}px + env(safe-area-inset-top, 0px))`,
          pb: isExternalEmbed
            ? 0
            : { xs: `calc(${agroTokens.bottomNavHeight}px + env(safe-area-inset-bottom, 0px))`, md: 2 },
          px: isExternalEmbed ? 0 : { xs: 1.5, sm: 2, md: 3 },
        }}
      >
        {children}
      </Box>

      <MobileBottomNav onMore={() => setMobileOpen(true)} />
    </Box>
  )
}
