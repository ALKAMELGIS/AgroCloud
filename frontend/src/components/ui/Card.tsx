import * as React from 'react'
import MuiCard from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  padded?: boolean
}

export function Card({ padded = true, className, children, ...props }: CardProps) {
  return (
    <MuiCard className={className} variant="outlined" {...(props as object)}>
      {padded ? <CardContent>{children}</CardContent> : children}
    </MuiCard>
  )
}
