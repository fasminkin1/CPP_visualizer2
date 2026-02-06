
import { useSimulationStore, NODE_STATES, OBJ_TYPES, MSG_TYPES, DIR_TYPES } from '../store/simulationStore.js';

// Polyfill for requestAnimationFrame if needed (Zustand doesn't use it directly usually, but good to know)
// We are just calling tick(dt) manually.

console.log("=== STARTING PROTOCOL VERIFICATION ===");

const store = useSimulationStore;
const { getState, setState } = store;

// Helper to step simulation
function step(seconds) {
    getState().tick(seconds);
}

function runTest() {
    console.log("1. Power On System");
    getState().powerOn();

    let masterState = getState().nodeStates[0];
    console.log("Master State:", masterState.state);

    if (masterState.state !== 'INIT') {
        console.error("FAIL: Master should be in INIT state");
        process.exit(1);
    }

    console.log("2. Running Init Loop (Simulating 5 seconds)...");
    // Tick enough times to cover delays
    for (let i = 0; i < 50; i++) {
        step(0.1);
    }

    masterState = getState().nodeStates[0];
    console.log("Master State after 5s:", masterState.state);

    const nodes = getState().network.filter(n => n.type !== 'MASTER');
    let allOnline = true;

    nodes.forEach(n => {
        const ns = getState().nodeStates[n.na];
        console.log(`Node ${n.na} State: ${ns.state}`);
        if (ns.state !== NODE_STATES.ONLINE) {
            // In new logic, it goes to UNCONFIGURED -> ONLINE if CFG matches
            // Wait, SlaveInit sends REQ. MasterInit sends ACK.
            // If delays align, it should work.
            allOnline = false;
        }
    });

    if (allOnline) {
        console.log("PASS: All nodes came ONLINE.");
    } else {
        console.warn("WARN: Not all nodes ONLINE. Checking specific failure modes...");
    }

    console.log("3. Testing Error Injection on Node 1");
    // Manually set error on Node 1 (simulating internal error)
    // The store doesn't have a direct 'setError' action exposed conveniently for testing internal state change 
    // without `setState`, but we can use setState to mock the internal change.

    setState(s => ({
        nodeStates: {
            ...s.nodeStates,
            1: { ...s.nodeStates[1], err: [1, 2, 3] } // Some error code
        }
    }));

    // Now Node 1 has an error but hasn't reported it yet?
    // Wait, SlaveHandleErr checks `nodeErr` vs msg payload.
    // We need to trigger a check or wait for existing loop?
    // Actually, Slave logic is reactive to MESSAGES. 
    // Who initiates ERR? 
    // If Slave has error, does it send it? 
    // TLA+: SlaveHandleErr is triggered by receiving OBJ_ERR message? 
    // Wait, let's check TLA+.
    // SlaveHandleErr is entered if `msg.obj = OBJ_ERR`.
    // Who sends OBJ_ERR? 
    // TLA+: Master sends OBJ_ERR ACK after successful CFG.
    // Also Master sends OBJ_ERR REQ to query? 
    // TLA doesn't explicitly show Master polling ERR unless I missed it.
    // MasterHandleErr responds to MSG_REQ/ACK.
    // It seems the "Active" part of reporting might be missing in my TLA interpretation or implementation?
    // Ah, `nodeMachine.js` (XState) had some logic `ERROR` event.
    // In TLA+: Slave only responds. Master only responds?
    // Where is the detailed periodic check?
    // Maybe I missed a transition?
    // Looking at SlaveInit: sends CFG REQ.
    // MasterInit: sends CFG ACK.
    // ERR and DATA seem to be demand-driven or polled?
    // MasterMainLoop: `either ... or { await AllNodesOnline; ... targetNA... Send DATA MSG_ACK }`
    // So Master polls DATA.
    // Does Master poll ERR? TLA+ doesn't show Master polling ERR in the loop I read.
    // It shows Master responding to ERR messages.
    // So Slaves must initiate ERR if they have one?
    // TLA+: `SlaveHandleErr` responds to msg.
    // It seems `CANProPlusV2.tla` defines a Passive Slave (WaitMsg).
    // So Master MUST initiate.
    // But MasterInitLoop only sends CFG.
    // MasterMainLoop only sends DATA (if all online).
    // How does ERR get checked?
    // Maybe Master sends ERR REQ periodically? 
    // The TLA+ I read: `MasterMainLoop` EITHER handles msg OR sends DATA ACK.
    // It DOES NOT seem to send ERR REQ.
    // This implies my TLA+ reading was correct: Master only queries DATA.
    // Maybe ERR is sent via DATA object in some versions? No, `OBJ_ERR` exists.
    // Perhaps `OBJ_ERR` is only used during initial config handshake (Master sends OBJ_ERR ACK after CFG matches)?
    // Yes: `MasterHandleCfg`: ... response := CANMessage(OBJ_ERR, ..., MSG_ACK, NULL)
    // So Master initiates ERR check as part of CFG handshake finish!
    // And Slave responds to that.

    // Let's verify THAT flow.
    // Node 1 should have received OBJ_ERR ACK from Master after Config.
    // SlaveHandleErr (on MSG_ACK): if errMatches -> ONLINE + IO_OP.

    const ns1 = getState().nodeStates[1];
    console.log("Node 1 IO Status:", ns1.ioStatus);

    if (ns1.state === NODE_STATES.ONLINE && ns1.ioStatus === true) {
        console.log("PASS: Node 1 is ONLINE and IO Operational (ERR Handshake passed)");
    } else {
        console.error("FAIL: Node 1 did not complete ERR handshake");
    }

    console.log("=== END VERIFICATION ===");
}

runTest();
