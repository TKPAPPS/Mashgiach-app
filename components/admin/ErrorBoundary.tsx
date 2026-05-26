'use client'
import React from 'react'

type Props = { children: React.ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Tab error]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
          <p style={{ marginBottom: 12 }}>אירעה שגיאה בטעינת הלשונית.</p>
          <button
            className="button button--ghost button--sm"
            onClick={() => this.setState({ error: null })}>
            נסה שנית
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
