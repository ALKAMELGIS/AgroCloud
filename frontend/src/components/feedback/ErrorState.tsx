import { Box, Button, Typography } from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
      <ErrorOutlineIcon color="error" sx={{ fontSize: 48, mb: 1 }} />
      <Typography variant="h6">{title}</Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{description}</Typography>
      ) : null}
      {onRetry ? (
        <Button variant="outlined" sx={{ mt: 2 }} onClick={onRetry}>Retry</Button>
      ) : null}
    </Box>
  )
}
