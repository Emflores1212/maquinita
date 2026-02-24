import { useEffect } from 'react';
import { useKioskStore } from './store/kioskStore'
import IdleScreen from './screens/IdleScreen'
import ShoppingScreen from './screens/ShoppingScreen'
import CheckoutScreen from './screens/CheckoutScreen'
import MenuScreen from './screens/MenuScreen'

function App() {
  const { machineState, connectWebSocket } = useKioskStore();

  useEffect(() => {
    // Conectamos a la máquina local (ID 1)
    connectWebSocket(1);
  }, [connectWebSocket]);

  // Switch de navegación según el estado de la máquina
  const renderScreen = () => {
    switch (machineState) {
      case 'idle':
        return <IdleScreen />;
      case 'menu':
        return <MenuScreen />;
      case 'authorizing':
        return <div className="text-white text-3xl font-bold h-full flex flex-col items-center justify-center"><div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />Autorizando Módulo...</div>;
      case 'shopping':
        return <ShoppingScreen />;
      case 'checkout':
      case 'processing_payment':
        return <CheckoutScreen />;
      default:
        return <div className="text-white">Estado: {machineState}</div>;
    }
  }

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 overflow-hidden selection:bg-primary-500/30">
      {renderScreen()}
    </div>
  )
}

export default App
