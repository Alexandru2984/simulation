import { Component } from 'react'

// Keeps a crash in one part of the UI (usually WebGL) from blanking the page.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('UI error', error, info?.componentStack)
  }

  render() {
    if (this.state.error) return this.props.fallback?.(this.state.error) ?? null
    return this.props.children
  }
}
