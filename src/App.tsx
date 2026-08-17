import CalculatorScreen from './components/CalculatorScreen';
import ChatInterface from './components/ChatInterface';
import ConsentScreen from './components/ConsentScreen';
import { useSession } from './hooks/useSession';

export default function App() {
  const {
    session,
    calculatorStatus,
    chatStatus,
    configStatus,
    setConsentGiven,
    goToScreen,
    runMockRisk,
    runCalculatedRisk,
    sendMessage,
    resetSession,
    downloadSessionJson,
    downloadSessionCsv,
    setLiveAvatarExportMeta,
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
          onSubmitInputs={runCalculatedRisk}
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
          latestDiagnostics={session.latestDiagnostics}
          configStatus={configStatus}
          onSendMessage={sendMessage}
          onReset={resetSession}
          onDownloadJson={downloadSessionJson}
          onDownloadCsv={downloadSessionCsv}
          onLiveAvatarExportMeta={setLiveAvatarExportMeta}
        />
      )}
    </main>
  );
}
