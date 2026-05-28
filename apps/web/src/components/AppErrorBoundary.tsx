import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Collaborate frontend crashed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex h-full items-center justify-center px-6">
          <section className="surface-panel flex w-full max-w-sm flex-col items-center gap-6 rounded-xl p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
              <AlertTriangle size={28} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Room UI crashed</h1>
              <p className="text-sm text-gray-500">
                Reload the page to restore the board from the server state.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              Reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
