import { create } from 'zustand';

const DEVICE_TEMPLATES = {
  CSC4: [
    { la: 0, type: 'PHYS', io: ['System Core'] },
    { la: 2, type: 'TEMP', io: ['T1', 'T2', 'T3', 'T4'] },
    { la: 5, type: 'DISC', io: ['DOUT1', 'DOUT2'] }
  ],
  MD846: [
    { la: 0, type: 'PHYS', io: ['Core'] },
    { la: 1, type: 'DI', io: ['IN1-8'] },
    { la: 2, type: 'DI', io: ['IN9-16'] }
  ],
  MA444: [
    { la: 0, type: 'PHYS', io: ['Core'] },
    { la: 1, type: 'AO', io: ['CH1', 'CH2', 'CH3', 'CH4'] }
  ]
};

export const useBusStore = create((set) => ({
  network: [
    { na: 0, name: "MASTER_PLC", type: "MASTER", nodes: [] }, // NA:0 зарезервирован под Мастера
    { na: 1, name: "CSC4_Unit", type: "CSC4", nodes: DEVICE_TEMPLATES.CSC4 },
    { na: 2, name: "MD846_Input", type: "MD846", nodes: DEVICE_TEMPLATES.MD846 },
    { na: 3, name: "MA444_Output", type: "MA444", nodes: DEVICE_TEMPLATES.MA444 }
  ],
  
  addController: (typeName) => set((s) => ({
    network: [...s.network, { 
      na: s.network.length, 
      name: `${typeName}_${s.network.length}`, 
      type: typeName,
      nodes: DEVICE_TEMPLATES[typeName] || DEVICE_TEMPLATES.CSC4 
    }]
  }))
}));