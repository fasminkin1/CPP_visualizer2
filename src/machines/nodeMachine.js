import { createMachine, assign } from 'xstate';
import { PROTOCOL } from '../constants/protocol';

export const nodeMachine = createMachine({
  id: 'node',
  initial: PROTOCOL.STATES.UNDEFINED,
  context: {
    ioStatus: true 
  },
  states: {
    [PROTOCOL.STATES.UNDEFINED]: {
      on: { 
        // По документации: включение питания
        POWER_ON: { target: PROTOCOL.STATES.UNCONFIGURED } 
      }
    },
    [PROTOCOL.STATES.UNCONFIGURED]: {
      on: {
        // Ждем OBJ_CFG от мастера
        RECEIVE_CFG: {
          target: PROTOCOL.STATES.ONLINE,
          guard: ({ context }) => context.ioStatus === true 
        },
        ERROR: { target: PROTOCOL.STATES.STALL }
      }
    },
    [PROTOCOL.STATES.ONLINE]: {
      on: {
        IO_ERROR: { target: PROTOCOL.STATES.STALL },
        RESET: { target: PROTOCOL.STATES.UNDEFINED }
      }
    },
    [PROTOCOL.STATES.STALL]: {
      on: { REBOOT: { target: PROTOCOL.STATES.UNDEFINED } }
    }
  }
});