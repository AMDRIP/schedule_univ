import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { StoreProvider, useStore } from '../hooks/useStore';
import Dashboard from '../components/Dashboard';
import SplashScreen from '../components/SplashScreen';
import GenerationShowcaseModal from '../components/GenerationShowcaseModal';
import { Role } from '../types';

declare global { interface Window { __store: ReturnType<typeof useStore>; __enter: () => void; } }
const Harness = () => {
    const store = useStore(); const [splash, setSplash] = useState(true);
    useEffect(() => { window.__store = store; window.__enter = () => setSplash(false); }, [store]);
    return splash ? <SplashScreen onFinish={() => setSplash(false)} /> : <DndProvider backend={HTML5Backend}><Dashboard currentRole={Role.Admin} /><GenerationShowcaseModal /></DndProvider>;
};
createRoot(document.getElementById('root')!).render(<StoreProvider><Harness /></StoreProvider>);
