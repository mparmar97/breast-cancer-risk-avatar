import CalculatorScreen from './components/CalculatorScreen';
import ChatInterface from './components/ChatInterface';
import ConsentScreen from './components/ConsentScreen';
import { useSession } from './hooks/useSession';

export default function App() {
  const {
    session,
    calculatorStatus,
    chatStatus,
    setConsentGiven,
    goToScreen,
    runMockRisk,
    sendMessage,
    resetSession,
    downloadSessionJson,
  } = useSession();

  return (
    <main className="app">
      {session.screen === 'consent' && (
        <ConsentScreen
          consentGiven={session.consentGiven}
          onConsentChange={setConsentGiven}
          onContinue={() => goToScreen('calculator')}
        />
      )}

      {session.screen === 'calculator' && (
        <CalculatorScreen
          onSelectScenario={runMockRisk}
          loading={calculatorStatus.loading}
          error={calculatorStatus.error}
        />
      )}

      {session.screen === 'chat' && session.riskResult && (
        <ChatInterface
          riskResult={session.riskResult}
          messages={session.messages}
          loading={chatStatus.loading}
          error={chatStatus.error}
          onSendMessage={sendMessage}
          onReset={resetSession}
          onDownload={downloadSessionJson}
        />
      )}
    </main>
  );
}
