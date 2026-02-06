import { createMachine, assign } from 'xstate';
import { PROTOCOL } from '../constants/protocol';

const { OBJECTS, TYPES, DIRS, STATES } = PROTOCOL;

/**
 * Validates data payload.
 * For this sim, we compare JSON stringified versions or nulls.
 * Master expects specific structure from TEMPLATES.
 */
const dataMatches = (d1, d2) => {
    if (d1 === null && d2 === null) return true;
    return JSON.stringify(d1) === JSON.stringify(d2);
};

export const createProtocolMachine = (na, la, type, initialCfg, isMaster = false) => createMachine({
    id: `node-${na}-${la}`,
    type: 'parallel',
    context: {
        na,
        la,
        type,
        isMaster,

        // Internal State Data
        myCfg: null,
        myErr: null,
        myUsage: [], // For Data

        // Master Specific
        expectedCfg: initialCfg, // What this node SHOULD be

        ioStatus: false, // Hardware Ready?
        online: false,

        // Output Callback (injected via input usually, but we can assign to context)
        sendMessage: (obj, dir, na, la, type, payload) => console.log('Mock Send', obj, type)
    },
    states: {
        // ========================================================================
        // 1. CONFIGURATION OBJECT (OBJ_CFG = 14)
        // ========================================================================
        cfg: {
            initial: 'unconfigured',
            states: {
                unconfigured: {
                    entry: assign({ myCfg: null, online: false }),
                    on: {
                        // --- SLAVE BEHAVIOR ---
                        // Slave Init -> Send REQ
                        INIT: { actions: 'sendCfgReq' },
                        // Receive REQ (Master -> Slave): Save Config, if match -> Ack, else -> Req
                        RX_CFG_REQ: {
                            actions: ['saveConfig', 'startCfgHandshake']
                        },
                        // Receive ACK (Master -> Slave): Check match
                        RX_CFG_ACK: {
                            target: 'checking',
                            actions: ['checkCfgMatch']
                        },

                        // --- MASTER BEHAVIOR ---
                        // Master Init -> Send ACK (Null) logic handled by external loop usually, 
                        // but here we can model it.
                        M_INIT_LOOP: { actions: 'sendCfgAck' },

                        M_RX_CFG_REQ: { actions: 'masterHandleCfgReq' },

                        // Master receives ACK: If valid -> Configured
                        M_RX_CFG_ACK: {
                            target: 'configured',
                            guard: 'isCfgValid',
                            actions: ['masterHandleCfgAck', 'triggerErrCheck']
                        },
                        M_RX_CFG_ACK_INVALID: {
                            // guard fell through
                            actions: ['masterHandleCfgAck', 'sendCfgReq']
                        }
                    }
                },
                checking: {
                    always: [
                        { target: 'configured', guard: 'isCfgMatched' },
                        { target: 'unconfigured', actions: 'sendCfgReq' }
                    ]
                },
                configured: {
                    on: {
                        // Slave: If we get new REQ, update and re-check
                        RX_CFG_REQ: {
                            target: 'unconfigured',
                            actions: ['saveConfig', 'sendCfgReq'] // Assume mismatch initially or re-verify
                        },
                        RX_CFG_ACK: {
                            target: 'checking', // Re-verify
                            actions: ['checkCfgMatch']
                        },

                        // Master
                        M_RX_CFG_REQ: { actions: 'masterHandleCfgReq' }, // Might degrade if Slave lost config
                        M_RX_CFG_ACK: { actions: ['masterHandleCfgAck', 'triggerErrCheck'] }
                    }
                }
            }
        },

        // ========================================================================
        // 2. ERROR OBJECT (OBJ_ERR = 0)
        // ========================================================================
        err: {
            initial: 'idle',
            states: {
                idle: {
                    on: {
                        CHECK_ERR: 'checking'
                    }
                },
                checking: {
                    entry: ['checkHardware'],
                    on: {
                        // Slave receiving Req/Ack for Err
                        RX_ERR_REQ: { actions: 'sendErrAck' }, // Assuming no error for now
                        RX_ERR_ACK: {
                            target: 'active',
                            actions: ['setOnline', 'sendErrAck']
                        },

                        // Master
                        M_RX_ERR_REQ: { actions: 'sendErrAck' },
                        M_RX_ERR_ACK: { target: 'active', actions: 'markSlaveOperational' }
                    }
                },
                active: {
                    on: {
                        RX_ERR_REQ: { actions: 'sendErrAck' },
                        RX_ERR_ACK: { actions: 'sendErrAck' }
                        // Errors occurring?
                    }
                }
            }
        },

        // ========================================================================
        // 3. ID and DATA (Simplified)
        // ========================================================================
        ops: {
            initial: 'idle',
            states: {
                idle: {},
                running: {}
            }
        }
    },
}, {
    actions: {
        // --- SLAVE ACTIONS ---
        sendCfgReq: ({ context }) => {
            const { na, la, sendMessage } = context;
            sendMessage(OBJECTS.CFG, DIRS.TO_MASTER, na, la, TYPES.REQ, context.myCfg);
        },
        saveConfig: assign(({ context, event }) => {
            return { myCfg: event.payload };
        }),
        startCfgHandshake: ({ context, event }) => {
            const { na, la, sendMessage, myCfg } = context;
            const matches = dataMatches(event.payload, myCfg) || myCfg === null;
            if (matches) {
                sendMessage(OBJECTS.CFG, DIRS.TO_MASTER, na, la, TYPES.ACK, event.payload);
            } else {
                sendMessage(OBJECTS.CFG, DIRS.TO_MASTER, na, la, TYPES.REQ, event.payload);
            }
        },
        checkCfgMatch: ({ context, event }) => {
            const { na, la, sendMessage, myCfg } = context;
            const matches = dataMatches(event.payload, myCfg);

            if (matches) {
                sendMessage(OBJECTS.CFG, DIRS.TO_MASTER, na, la, TYPES.ACK, myCfg);
            } else {
                sendMessage(OBJECTS.CFG, DIRS.TO_MASTER, na, la, TYPES.REQ, myCfg);
            }
        },

        // --- MASTER ACTIONS ---
        sendCfgAck: ({ context }) => {
            const { na, la, sendMessage } = context;
            sendMessage(OBJECTS.CFG, DIRS.TO_SLAVE, na, la, TYPES.ACK, null);
        },

        masterHandleCfgReq: ({ context, event }) => {
            const { na, la, sendMessage, expectedCfg } = context;
            if (dataMatches(event.payload, expectedCfg)) {
                sendMessage(OBJECTS.CFG, DIRS.TO_SLAVE, na, la, TYPES.ACK, event.payload);
            } else {
                sendMessage(OBJECTS.CFG, DIRS.TO_SLAVE, na, la, TYPES.REQ, expectedCfg);
            }
        },

        masterHandleCfgAck: ({ context, event }) => {
            const { na, la, sendMessage, expectedCfg } = context;
            if (dataMatches(event.payload, expectedCfg)) {
                sendMessage(OBJECTS.ERR, DIRS.TO_SLAVE, na, la, TYPES.ACK, null);
            } else {
                sendMessage(OBJECTS.CFG, DIRS.TO_SLAVE, na, la, TYPES.REQ, expectedCfg);
            }
        },

        // --- ERROR ACTIONS ---
        checkHardware: ({ context }) => {
            // console.log("Checking hardware...");
        },
        sendErrAck: ({ context, event }) => {
            const { na, la, sendMessage, myErr, isMaster } = context;
            sendMessage(OBJECTS.ERR, isMaster ? DIRS.TO_SLAVE : DIRS.TO_MASTER, na, la, TYPES.ACK, myErr);
        },

        markSlaveOperational: ({ context }) => {
            // console.log("Slave Marked Operational");
        },

        setOnline: assign({ online: true, ioStatus: true }),
        triggerErrCheck: ({ context }) => { /* Internal Evt */ }
    },
    guards: {
        isCfgMatched: ({ context }) => dataMatches(context.myCfg, context.expectedCfg),
        isCfgValid: ({ context }, { payload }) => dataMatches(payload, context.expectedCfg),
        isErrMatched: () => true
    }
});
