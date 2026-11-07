import * as React from 'react'
import MuiButton from '@mui/material/Button'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}

function mapVariant(variant: ButtonVariant): {
  variant: 'contained' | 'outlined' | 'text'
  color: 'primary' | 'inherit' | 'error'
} {
  if (variant === 'primary') return { variant: 'contained', color: 'primary' }
  if (variant === 'danger') return { variant: 'contained', color: 'error' }
  if (variant === 'ghost') return { variant: 'text', color: 'inherit' }
  return { variant: 'outlined', color: 'primary' }
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', className, type, disabled, children, onClick, ...props },
  ref,
) {
  const mapped = mapVariant(variant)
  return (
    <MuiButton
      ref={ref}
      type={type ?? 'button'}
      className={className}
      disabled={disabled}
      onClick={onClick}
      variant={mapped.variant}
      color={mapped.color}
      size="medium"
      {...(props as object)}
    >
      {children}
    </MuiButton>
  )
})
