import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Review from "./pages/Review";
import Processing from "./pages/Processing";
import Analysis from "./pages/Analysis";
import ImagingResult from "./pages/ImagingResult";
import History from "./pages/History";
import Login from "./pages/Login";

function Router() {
  return (
    <Switch>
      {/* MedSuite — fluxo principal */}
      <Route path="/" component={Home} />
      <Route path="/review/:documentId" component={Review} />
      <Route path="/processing/:documentId" component={Processing} />

      {/* Resultados */}
      <Route path="/analysis/:sessionId" component={Analysis} />
      <Route path="/imaging/:reportId" component={ImagingResult} />

      {/* Histórico unificado */}
      <Route path="/history" component={History} />

      {/* Autenticação */}
      <Route path="/login" component={Login} />

      {/* Fallback */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
