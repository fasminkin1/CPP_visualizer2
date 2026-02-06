export const PROTOCOL = {
  // Координата OBJ
  OBJECTS: { ERR: 0, DATA: 1, CFG: 14, ID: 15 },
  // Типы посылок
  TYPES: { REQ: 0, ACK: 1 },
  // Направления
  DIRS: { TO_SLAVE: 0, TO_MASTER: 1 },
  // Состояния (из TLA+)
  STATES: { UNDEFINED: 'UNDEF', UNCONFIGURED: 'UNCFG', ONLINE: 'ON', STALL: 'STALL' }
};