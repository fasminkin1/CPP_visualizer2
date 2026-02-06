import { create } from 'zustand';
import { createActor } from 'xstate';
import { createProtocolMachine } from '../machines/canProtocolMachine';
import { PROTOCOL } from '../constants/protocol';

// Alias constants for compatibility with existing components
const OBJ_TYPES = PROTOCOL.OBJECTS;
const MSG_TYPES = PROTOCOL.TYPES;
const DIR_TYPES = PROTOCOL.DIRS;
const NODE_STATES = PROTOCOL.STATES;
const MASTER_STATES = { INIT: 'INIT', IDLE: 'IDLE' };

const TEMPLATES = {
    MD846: [
        { la: 0, type: 'PHYS', io: [{ label: 'SYS', type: 'DI' }] },
        { la: 1, type: 'DI', io: Array.from({ length: 8 }, (_, i) => ({ label: `IN ${i + 1}`, type: 'DI' })) },
        { la: 2, type: 'DO', io: Array.from({ length: 10 }, (_, i) => ({ label: `OUT ${i + 1}`, type: 'DO' })) }
    ],
    MD808: [
        { la: 0, type: 'PHYS', io: [{ label: 'SYS', type: 'DI' }] },
        { la: 1, type: 'DI', io: Array.from({ length: 8 }, (_, i) => ({ label: `IN ${i + 1}`, type: 'DI' })) },
        { la: 2, type: 'DO', io: Array.from({ length: 8 }, (_, i) => ({ label: `OUT ${i + 1}`, type: 'DO' })) }
    ],
    MA444: [
        { la: 0, type: 'PHYS', io: [{ label: 'SYS', type: 'DI' }] },
        { la: 1, type: 'AI', io: Array.from({ length: 4 }, (_, i) => ({ label: `AI ${i + 1}`, type: 'AI' })) },
        { la: 2, type: 'T', io: Array.from({ length: 4 }, (_, i) => ({ label: `T ${i + 1}`, type: 'T' })) },
        { la: 3, type: 'AO', io: Array.from({ length: 2 }, (_, i) => ({ label: `AO ${i + 1}`, type: 'AO' })) },
        { la: 4, type: 'AO', io: Array.from({ length: 2 }, (_, i) => ({ label: `AO ${i + 1}`, type: 'AO' })) }
    ],
    MA844: [
        { la: 0, type: 'PHYS', io: [{ label: 'SYS', type: 'DI' }] },
        { la: 1, type: 'AI', io: Array.from({ length: 4 }, (_, i) => ({ label: `AI ${i + 1}`, type: 'AI' })) },
        { la: 2, type: 'T', io: Array.from({ length: 4 }, (_, i) => ({ label: `T ${i + 1}`, type: 'T' })) },
        { la: 3, type: 'AO', io: Array.from({ length: 4 }, (_, i) => ({ label: `AO ${i + 1}`, type: 'AO' })) },
        { la: 4, type: 'AO', io: Array.from({ length: 2 }, (_, i) => ({ label: `AO ${i + 1}`, type: 'AO' })) },
        { la: 5, type: 'AI', io: Array.from({ length: 4 }, (_, i) => ({ label: `AI ${i + 5}`, type: 'AI' })) }
    ]
};

// --- HELPER FUNCTIONS ---
function createMessage(obj, dir, na, la, type, payload) {
    return {
        id: Math.random(),
        obj, // OBJ_TYPES
        dir, // DIR_TYPES
        na,
        la,
        type, // MSG_TYPES
        payload,
        from: dir === DIR_TYPES.TO_SLAVE ? 0 : na,
        to: dir === DIR_TYPES.TO_SLAVE ? na : 0,
        progress: 0
    };
}

// Store for Actors (outside Zustand to avoid reactivity loops/proxy issues)
const actors = {};

export const useSimulationStore = create((set, get) => ({
    // --- STATE ---
    isPlaying: false,
    currentTime: 0,
    maxTime: 0,
    playbackSpeed: 1,

    history: [],

    network: [
        { na: 0, type: "MASTER", nodes: [] },
        { na: 1, type: "MD808", nodes: TEMPLATES.MD808 },
        { na: 2, type: "MD846", nodes: TEMPLATES.MD846 },
        { na: 3, type: "MA844", nodes: TEMPLATES.MA844 },
        { na: 4, type: "MA444", nodes: TEMPLATES.MA444 }
    ],

    // UI Representation of State (updated from actors)
    nodeStates: {},

    messages: [],
    trafficLog: [],

    // Master Logic Internal State (Legacy / High Level Control)
    masterInternal: {
        state: 'STOPPED',
        nextInitAddr: { na: 1, la: 0 },
        timer: 0
    },

    // --- ACTIONS ---

    powerOn: () => {
        set(s => {
            // 1. Cleanup old actors
            Object.values(actors).forEach(a => a.stop());
            for (let key in actors) delete actors[key];

            const initNodeStates = {};
            const store = get();

            // Helper to wrap sendMessage for context
            const sendCallback = (obj, dir, na, la, type, payload) => {
                // Access store directly to capture current time/state at moment of send
                useSimulationStore.getState().sendMessage(obj, dir, na, la, type, payload);
            };

            // 2. Initialize Nodes & Actors
            s.network.forEach(n => {
                if (n.type === 'MASTER') {
                    initNodeStates[n.na] = { state: MASTER_STATES.INIT, shadow: {} };

                    // Create Master Logic Actors for each Slave Node it expects to manage
                    s.network.forEach(slave => {
                        if (slave.type !== 'MASTER') {
                            slave.nodes.forEach(node => {
                                const key = `MASTER:${slave.na}:${node.la}`;
                                const machine = createProtocolMachine(slave.na, node.la, node.type, node, true, sendCallback);
                                const actor = createActor(machine);
                                actor.start();
                                actors[key] = actor;

                                // Init Master Logic (Trigger Init Loop equivalent)
                                actor.send({ type: 'M_INIT_LOOP' });
                            });
                        }
                    });

                } else {
                    // SLAVE NODES
                    initNodeStates[n.na] = {
                        state: NODE_STATES.UNCONFIGURED,
                        cfg: null,
                        err: null,
                        ioStatus: false
                    };

                    n.nodes.forEach(node => {
                        const key = `${n.na}:${node.la}`;
                        const machine = createProtocolMachine(n.na, node.la, node.type, null, false, sendCallback);
                        const actor = createActor(machine);
                        actor.start();
                        actors[key] = actor;

                        // Trigger Slave Init
                        actor.send({ type: 'INIT' });
                    });
                }
            });

            return {
                isPlaying: true,
                currentTime: 0,
                messages: [],
                trafficLog: [],
                nodeStates: initNodeStates
            };
        });
    },

    addNode: (type) => set((s) => {
        const newNA = s.network.length;
        const newNode = { na: newNA, type, nodes: TEMPLATES[type] || [] };
        return {
            network: [...s.network, newNode],
            nodeStates: { ...s.nodeStates, [newNA]: { state: NODE_STATES.UNDEFINED } }
        };
    }),

    sendMessage: (obj, dir, na, la, type, payload) => {
        const msg = createMessage(obj, dir, na, la, type, payload);
        const logEntry = { ...msg, time: get().currentTime };
        set(s => ({
            messages: [...s.messages, msg],
            trafficLog: [logEntry, ...s.trafficLog]
        }));
    },

    // --- MAIN LOOP ---
    tick: (dt) => {
        const { isPlaying, messages, currentTime, playbackSpeed, history } = get();
        if (!isPlaying) return;

        const newTime = currentTime + dt * playbackSpeed;

        // 1. Update Messages & Detect Arrivals
        const nextMsgs = [];
        const arrivedMsgs = [];

        messages.forEach(m => {
            const p = m.progress + dt * 0.5 * playbackSpeed;
            if (p >= 1) arrivedMsgs.push(m);
            else nextMsgs.push({ ...m, progress: p });
        });

        // 2. Route Arrived Messages to Actors
        arrivedMsgs.forEach(msg => {
            if (msg.dir === DIR_TYPES.TO_SLAVE) {
                // Message for Slave
                const key = `${msg.na}:${msg.la}`;
                if (actors[key]) {
                    const objName = Object.keys(OBJ_TYPES).find(k => OBJ_TYPES[k] === msg.obj);
                    const typeName = msg.type === MSG_TYPES.REQ ? 'REQ' : 'ACK';
                    const evtType = `RX_${objName}_${typeName}`;

                    actors[key].send({ type: evtType, payload: msg.payload });
                }
            } else {
                // Message for Master
                // Master has many actors. Which one? The one corresponding to the Sender (NA:LA).
                const key = `MASTER:${msg.na}:${msg.la}`;
                if (actors[key]) {
                    const objName = Object.keys(OBJ_TYPES).find(k => OBJ_TYPES[k] === msg.obj);
                    const typeName = msg.type === MSG_TYPES.REQ ? 'REQ' : 'ACK';
                    const evtType = `M_RX_${objName}_${typeName}`;

                    actors[key].send({ type: evtType, payload: msg.payload });
                }
            }
        });

        // 3. Update Visual State from Actors
        const nextNodeStates = { ...get().nodeStates };

        get().network.forEach(n => {
            if (n.type !== 'MASTER') {
                // Aggregate state from main logic node (0) for visualization
                if (n.nodes.length > 0) {
                    const actorKey = `${n.na}:${n.nodes[0].la}`;
                    if (actors[actorKey]) {
                        const snap = actors[actorKey].getSnapshot();
                        if (snap) {
                            nextNodeStates[n.na] = {
                                state: snap.context.online ? NODE_STATES.ONLINE : NODE_STATES.UNCONFIGURED,
                                cfg: snap.context.myCfg,
                                err: snap.context.myErr,
                                ioStatus: snap.context.ioStatus
                            };
                        }
                    }
                }
            }
        });

        // 4. Save History
        let nextHistory = history;
        if (history.length === 0 || newTime - history[history.length - 1].time > 0.1) {
            nextHistory = [...history, {
                time: newTime,
                nodeStates: JSON.parse(JSON.stringify(nextNodeStates)),
                messages: nextMsgs,
                masterInternal: { ...get().masterInternal }
            }];
        }

        set({
            currentTime: newTime,
            messages: nextMsgs,
            nodeStates: nextNodeStates,
            history: nextHistory
        });
    },

    seek: (time) => { },
    togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
    setSpeed: (speed) => set({ playbackSpeed: speed })

}));

export { OBJ_TYPES, MSG_TYPES, DIR_TYPES, NODE_STATES, MASTER_STATES, TEMPLATES, createProtocolMachine };
