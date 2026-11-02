import { useApp } from '../store/app';
import { HistoryScreen } from './screens/HistoryScreen';
import { LiveScreen } from './screens/LiveScreen';
import { SetupScreen } from './screens/SetupScreen';

export function App() {
  const screen = useApp((s) => s.screen);
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col">
      {screen === 'setup' && <SetupScreen />}
      {screen === 'live' && <LiveScreen />}
      {screen === 'history' && <HistoryScreen />}
    </div>
  );
}
