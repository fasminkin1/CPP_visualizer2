import { create } from 'zustand';

// --- CONSTANTS FROM TLA+ ---
const OBJ_TYPES = { ERR: 0, DATA: 1, CFG: 14, ID: 15 };
const MSG_TYPES = { REQ: 0, ACK: 1 };
const DIR_TYPES = { TO_SLAVE: 0, TO_MASTER: 1 };
const NODE_STATES = { UNDEFINED: 'UNDEFINED', UNCONFIGURED: 'UNCONFIGURED', ONLINE: 'ONLINE', STALL: 'STALL' };
const MASTER_STATES = { INIT: 'INIT', IDLE: 'IDLE' };

// TLA+ DataMatches equivalent
const dataMatches = (d1, d2) => JSON.stringify(d1) === JSON.stringify(d2);

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

    nodeStates: {
        0: { state: MASTER_STATES.IDLE, shadow: {} }, // Master with Shadow DB
        1: { state: NODE_STATES.UNDEFINED, cfg: null, err: null, ioStatus: false },
        2: { state: NODE_STATES.UNDEFINED, cfg: null, err: null, ioStatus: false },
        3: { state: NODE_STATES.UNDEFINED, cfg: null, err: null, ioStatus: false },
        4: { state: NODE_STATES.UNDEFINED, cfg: null, err: null, ioStatus: false }
    },

    messages: [],

    // Master Logic Internal State
    masterInternal: {
        state: 'STOPPED', // STOPPED, INIT_LOOP, RUNNING
        nextInitAddr: { na: 1, la: 0 },
        timer: 0
    },

    // --- ACTIONS ---

    powerOn: () => {
        set(s => {
            const initNodeStates = {};
            s.network.forEach(n => {
                if (n.type === 'MASTER') {
                    initNodeStates[n.na] = { state: MASTER_STATES.INIT, shadow: {} };
                } else {
                    // Start as UNCONFIGURED per SlaveInit
                    initNodeStates[n.na] = {
                        state: NODE_STATES.UNCONFIGURED,
                        cfg: null,
                        err: null,
                        ioStatus: false // Default TLA+ init is FALSE
                    };
                }
            });

            // SlaveInit: Send REQ CFG for each slave
            const initialMessages = [];
            s.network.forEach(n => {
                if (n.type !== 'MASTER') {
                    // SlaveInit action: send CFG REQ
                    n.nodes.forEach(node => {
                        initialMessages.push(createMessage(OBJ_TYPES.CFG, DIR_TYPES.TO_MASTER, n.na, node.la, MSG_TYPES.REQ, null));
                    });
                }
            });

            return {
                isPlaying: true,
                currentTime: 0,
                messages: initialMessages,
                nodeStates: initNodeStates,
                masterInternal: {
                    state: 'INIT_LOOP',
                    nextInitAddr: { na: 1, la: 0 },
                    timer: 0
                },
                history: [{
                    time: 0,
                    nodeStates: initNodeStates,
                    messages: [],
                    masterInternal: { state: 'INIT_LOOP', nextInitAddr: { na: 1, la: 0 }, timer: 0 }
                }]
            };
        });
    },

    addNode: (type) => set((s) => {
        const newNA = s.network.length;
        const newNode = { na: newNA, type, nodes: TEMPLATES[type] || [] };
        return {
            network: [...s.network, newNode],
            network: [...s.network, newNode],
            nodeStates: { ...s.nodeStates, [newNA]: { state: NODE_STATES.UNDEFINED, cfg: null, err: null, ioStatus: false } }
        };
    }),

    sendMessage: (obj, dir, na, la, type, payload) => {
        const msg = createMessage(obj, dir, na, la, type, payload);
        set(s => ({ messages: [...s.messages, msg] }));
    },

    // --- MAIN LOOP ---
    tick: (dt) => {
        const { isPlaying, messages, nodeStates, currentTime, playbackSpeed, history, network, masterInternal } = get();
        if (!isPlaying) return;

        const newTime = currentTime + dt * playbackSpeed;

        // 1. Update Messages
        const nextMsgs = [];
        const arrivedMsgs = [];

        messages.forEach(m => {
            const p = m.progress + dt * 0.5 * playbackSpeed;
            if (p >= 1) arrivedMsgs.push(m);
            else nextMsgs.push({ ...m, progress: p });
        });

        // 2. Process Protocol Logic
        const nextNodeStates = JSON.parse(JSON.stringify(nodeStates));
        const nextMasterInternal = { ...masterInternal };

        // --- MASTER INIT LOOP LOGIC ---
        if (nextMasterInternal.state === 'INIT_LOOP') {
            nextMasterInternal.timer += dt * playbackSpeed;
            if (nextMasterInternal.timer > 0.1) { // Throttle sending to every 0.1s
                const { na, la } = nextMasterInternal.nextInitAddr;

                // Send CFG ACK
                // Check if NA exists
                const targetNode = network.find(n => n.na === na);
                if (targetNode) {
                    get().sendMessage(OBJ_TYPES.CFG, DIR_TYPES.TO_SLAVE, na, la, MSG_TYPES.ACK, null);

                    // Next Address
                    // Logic: Increment LA. If LA > max for this NA, go next NA, LA=0.
                    // Visualizer simplifies this: just check TEMPLATES or standard ranges.
                    // Let's rely on TEMPLATES to skip invalid LAs for better visuals?
                    // TLA+ iterates ALL PROBABLE LAs (0..MAX).
                    // To act nicely, let's iterate 0..14.
                    // But for visual speed, let's just do LAs that exist in our definitions + maybe 1 extra?
                    // Let's stick to iterating all logic nodes present in `targetNode.nodes`.

                    // Find index of current LA in nodes
                    const laIndex = targetNode.nodes.findIndex(n => n.la === la);
                    if (laIndex !== -1 && laIndex < targetNode.nodes.length - 1) {
                        // Go to next LA in this node
                        nextMasterInternal.nextInitAddr = { na, la: targetNode.nodes[laIndex + 1].la };
                    } else {
                        // Go to next Node
                        // Check if next NA exists
                        const nextNA = na + 1;
                        if (network.some(n => n.na === nextNA)) {
                            // Find first LA of next NA
                            const nextNodeCfg = network.find(n => n.na === nextNA);
                            nextMasterInternal.nextInitAddr = { na: nextNA, la: nextNodeCfg.nodes[0] ? nextNodeCfg.nodes[0].la : 0 };
                        } else {
                            // Done
                            nextMasterInternal.state = 'RUNNING';
                            nextNodeStates[0].state = MASTER_STATES.IDLE;
                        }
                    }
                } else {
                    // Should not happen if logic is correct, but safe exit
                    nextMasterInternal.state = 'RUNNING';
                    nextNodeStates[0].state = MASTER_STATES.IDLE;
                }

                nextMasterInternal.timer = 0;
            }
        }

        // --- MASTER DATA POLL CHECK ---
        // equivalent to TLA+ "or { await AllNodesOnline; ... }"
        // Check if all known nodes are ONLINE (based on shadow state? TLA check nodeState directly in define)
        // TLA: AllNodesOnline == \A addr \in NodeAddrs : nodeState[addr] = STATE_ONLINE
        const allNodesOnline = network.filter(n => n.type !== 'MASTER').every(n => nodeStates[n.na]?.state === NODE_STATES.ONLINE);

        // Simple mechanism to trigger DATA poll if idle and all online
        if (allNodesOnline && nextMsgs.length === 0 && arrivedMsgs.length === 0 && nextMasterInternal.state === 'RUNNING') {
            // In TLA+ this is non-deterministic "either/or". We can simulate it by a small probability or timer.
            // Let's do it if we are idle for a bit to avoid flooding
            if (Math.random() < 0.05) { // 5% chance per tick to start data cycle if idle
                // Send DATA ACK to all logic nodes
                network.forEach(n => {
                    if (n.type !== 'MASTER') {
                        n.nodes.forEach(node => {
                            get().sendMessage(OBJ_TYPES.DATA, DIR_TYPES.TO_SLAVE, n.na, node.la, MSG_TYPES.ACK, []);
                        });
                    }
                });
            }
        }


        // --- MESSAGE HANDLING ---
        arrivedMsgs.forEach(msg => {
            if (msg.dir === DIR_TYPES.TO_SLAVE) {
                // =================
                // SLAVE LOGIC
                // =================
                const nodeState = nextNodeStates[msg.na];
                if (!nodeState) return;

                // Helper for response
                const send = (obj, type, payload) => {
                    get().sendMessage(obj, DIR_TYPES.TO_MASTER, msg.na, msg.la, type, payload);
                }

                if (msg.obj === OBJ_TYPES.CFG) {
                    // SLC Handle Cfg
                    const myCfg = nodeState.cfg;
                    const cfgMatches = dataMatches(msg.payload, myCfg) || myCfg === null;

                    if (msg.type === MSG_TYPES.REQ) {
                        nodeState.cfg = msg.payload; // Always save on REQ
                        if (cfgMatches) {
                            send(OBJ_TYPES.CFG, MSG_TYPES.ACK, msg.payload);
                        } else {
                            send(OBJ_TYPES.CFG, MSG_TYPES.REQ, msg.payload);
                        }
                    } else if (msg.type === MSG_TYPES.ACK) {
                        if (cfgMatches) {
                            if (nodeState.ioStatus) {
                                nodeState.state = NODE_STATES.ONLINE;
                            } else {
                                nodeState.state = NODE_STATES.STALL;
                            }
                            send(OBJ_TYPES.CFG, MSG_TYPES.ACK, nodeState.cfg);
                        } else {
                            send(OBJ_TYPES.CFG, MSG_TYPES.REQ, nodeState.cfg);
                        }
                    }

                } else if (msg.obj === OBJ_TYPES.ERR) {
                    // SLC Handle Err
                    if ([NODE_STATES.UNCONFIGURED, NODE_STATES.ONLINE, NODE_STATES.STALL].includes(nodeState.state)) {
                        const myErr = nodeState.err;
                        const errMatches = dataMatches(msg.payload, myErr) || myErr === null;

                        if (msg.type === MSG_TYPES.REQ) {
                            if (errMatches) {
                                send(OBJ_TYPES.ERR, MSG_TYPES.ACK, myErr);
                            } else {
                                nodeState.state = NODE_STATES.STALL;
                                send(OBJ_TYPES.ERR, MSG_TYPES.REQ, myErr);
                            }
                        } else if (msg.type === MSG_TYPES.ACK) {
                            if (errMatches) {
                                nodeState.state = NODE_STATES.ONLINE;
                                nodeState.ioStatus = true;
                                send(OBJ_TYPES.ERR, MSG_TYPES.ACK, myErr);
                            } else {
                                send(OBJ_TYPES.ERR, MSG_TYPES.REQ, myErr);
                            }
                        }
                    }

                } else if (msg.obj === OBJ_TYPES.DATA) {
                    // SLC Handle Data
                    if (nodeState.state === NODE_STATES.ONLINE) {
                        if (msg.type === MSG_TYPES.REQ) {
                            send(OBJ_TYPES.DATA, MSG_TYPES.ACK, []);
                        } else if (msg.type === MSG_TYPES.ACK) {
                            send(OBJ_TYPES.DATA, MSG_TYPES.REQ, []);
                        }
                    }

                } else if (msg.obj === OBJ_TYPES.ID) {
                    // SLC Handle ID (LA=0 only)
                    if (msg.la === 0) {
                        send(OBJ_TYPES.ID, MSG_TYPES.ACK, msg.na);
                    }
                }

            } else if (msg.dir === DIR_TYPES.TO_MASTER) {
                // =================
                // MASTER LOGIC
                // =================
                const masterState = nextNodeStates[0];
                const targetKey = `${msg.na}:${msg.la}`;
                if (!masterState.shadow[targetKey]) {
                    masterState.shadow[targetKey] = { is_configured: false, cfg: null, err_status: null, io_operational: false };
                }
                const shadow = masterState.shadow[targetKey];

                // Mock MasterDB (Ideally this should come from a central config definitions)
                // We use the node templates as the "Golden Source" (MasterDB)
                const targetNodeDef = network.find(n => n.na === msg.na);
                // In TLA+, MasterDB has a fixed config. Here we assume the template is the config.
                // For simplified visualizer, let's assume MasterDB always expects "Correct" config unless we inject errors.
                // Or better: let's treat the message payload as truth if we don't have a rigid DB store, 
                // BUT TLA says Master compares against MasterDB. 
                // Let's assume MasterDB.cfg is simply what the node *should* be (TEMPLATES).
                // For now, to match "DataMatches", we can say MasterDB config is null or matches whatever we expect.
                // Let's just assume Master "knows" the config from the start.
                // We'll use the payload from the message itself if it's an ACK to 'learn' or validate? 
                // TLA: checks `DataMatches(msg.payload, masterDB[..].cfg)`
                // Let's assume MasterDB contains the template structure for that node.
                const masterDbCfg = null; // In TLA default is DEFAULT_CFG. 
                // Implementing full DB might be overkill, but let's at least support the flow.

                // Helper for Master Response
                const sendM = (obj, type, payload) => {
                    get().sendMessage(obj, DIR_TYPES.TO_SLAVE, msg.na, msg.la, type, payload);
                }

                if (msg.obj === OBJ_TYPES.CFG) {
                    // MasterHandleCfg
                    if (msg.type === MSG_TYPES.REQ) {
                        // TLA: if DataMatches(payload, db.cfg) -> ACK, unch shadow
                        //      else -> REQ, shadow.is_configured = FALSE
                        // Simplified: Always ACK with what we think is right (or echo if we are loose)
                        sendM(OBJ_TYPES.CFG, MSG_TYPES.ACK, msg.payload);
                    } else if (msg.type === MSG_TYPES.ACK) {
                        // TLA: if DataMatches -> shadow.is_configured=TRUE, shadow.cfg=payload, Send OBJ_ERR ACK
                        //      else -> shadow.is_configured=FALSE, Send OBJ_CFG REQ
                        shadow.is_configured = true;
                        shadow.cfg = msg.payload;
                        sendM(OBJ_TYPES.ERR, MSG_TYPES.ACK, null);
                    }

                } else if (msg.obj === OBJ_TYPES.ERR) {
                    // MasterHandleErr
                    if (msg.type === MSG_TYPES.REQ) {
                        // Respond ACK with db.err
                        sendM(OBJ_TYPES.ERR, MSG_TYPES.ACK, null);
                    } else if (msg.type === MSG_TYPES.ACK) {
                        // Update Shadow
                        shadow.err_status = msg.payload;
                        shadow.io_operational = true;
                    }

                } else if (msg.obj === OBJ_TYPES.ID) {
                    // MasterHandleId - skip
                } else if (msg.obj === OBJ_TYPES.DATA) {
                    // MasterHandleData - skip
                }
            }
        });

        // 3. Save History
        let nextHistory = history;
        if (history.length === 0 || newTime - history[history.length - 1].time > 0.1) {
            nextHistory = [...history, {
                time: newTime,
                nodeStates: JSON.parse(JSON.stringify(nextNodeStates)),
                messages: nextMsgs,
                masterInternal: { ...nextMasterInternal }
            }];
        }

        set({
            currentTime: newTime,
            maxTime: Math.max(get().maxTime, newTime),
            messages: nextMsgs,
            nodeStates: nextNodeStates,
            masterInternal: nextMasterInternal,
            history: nextHistory
        });
    },

    seek: (time) => {
        const { history } = get();
        const snap = history.reduce((prev, curr) =>
            Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
            , history[0]);

        if (snap) {
            set({
                isPlaying: false,
                currentTime: snap.time,
                nodeStates: snap.nodeStates,
                messages: snap.messages,
                masterInternal: snap.masterInternal || { state: 'STOPPED' }
            });
        }
    },

    togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
    setSpeed: (speed) => set({ playbackSpeed: speed })

}));

export { OBJ_TYPES, MSG_TYPES, DIR_TYPES, NODE_STATES, MASTER_STATES, TEMPLATES };
