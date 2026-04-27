import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen w-full flex-col items-center justify-center p-8 bg-background-light text-secondary">
                    <div className="max-w-2xl w-full bg-surface border-2 border-accent-error shadow-hard p-8 flex flex-col items-center">
                        <span className="material-symbols-outlined text-accent-error text-5xl mb-4">error</span>
                        <h1 className="font-display text-2xl font-bold uppercase tracking-wider mb-2 text-center text-accent-error">
                            Encontramos um problema
                        </h1>
                        <p className="mb-6 text-center text-secondary/70">
                            A página não pôde ser carregada devido a um erro inesperado. Isso pode fazer com que a tela fique em branco.
                        </p>

                        {this.state.error && (
                            <div className="w-full bg-background p-4 border border-secondary/20 overflow-auto mb-6 text-sm font-mono text-secondary/80">
                                <p className="font-bold text-accent-error mb-2">{this.state.error.toString()}</p>
                                <div className="whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</div>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.href = '/login'}
                            className="bg-primary text-white font-display font-bold px-6 py-3 shadow-hard hover:shadow-none hover:translate-y-1 transition-all uppercase tracking-widest flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined">restart_alt</span>
                            Voltar ao Login
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
