import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

type Props = {
  tickerActive: boolean
  children: ReactNode
} & HTMLAttributes<HTMLDivElement>

/** Clips the list while Play uses transform-based airport-board scroll. */
export const DevelopEliteListTickerViewport = forwardRef<HTMLDivElement, Props>(
  function DevelopEliteListTickerViewport({ tickerActive, children, className = '', ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={`develop-elite__list-viewport${
          tickerActive ? ' develop-elite__list-viewport--ticker' : ''
        }${className ? ` ${className}` : ''}`}
        {...rest}
      >
        {children}
      </div>
    )
  },
)
