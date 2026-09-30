import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  onReset?: () => void
}

type State = {
  error: Error | null
}

export class AcpMapToolErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[AcpMapTool]', error, info.componentStack)
    }
  }

  private reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="acp-map-panel acp-map-panel--tool-error" role="alert">
          <header className="acp-map-panel__head">
            <h2 className="acp-map-panel__title">Tool unavailable</h2>
          </header>
          <div className="acp-map-panel__body">
            <p className="acp-map-panel__empty">
              This map tool could not load. The map and layers remain active.
            </p>
            <button type="button" className="acp-map-panel__retry" onClick={this.reset}>
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
