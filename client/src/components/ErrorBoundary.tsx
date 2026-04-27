import { Component, type ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-raised)] border border-[var(--border-subtle)]">
                <AlertCircle className="h-7 w-7 text-[var(--accent-loss)]" strokeWidth={1.5} />
              </div>
            </div>
            <h1 className="text-h2 mb-2">Something went wrong</h1>
            <p className="text-body text-[var(--text-secondary)] mb-6">
              The app encountered an unexpected error. Try refreshing the page.
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false })
                window.location.reload()
              }}
            >
              Refresh Page
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
