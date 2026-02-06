---- MODULE CANProPlusV2 ----
EXTENDS Integers, Sequences, TLC

\* ============================================================================
\* РљРћРќРЎРўРђРќРўР«
\* ============================================================================
CONSTANTS
    NUM_CONTROLLERS,        \* РљРѕР»РёС‡РµСЃС‚РІРѕ РєРѕРЅС‚СЂРѕР»Р»РµСЂРѕРІ РІ СЃРµС‚Рё (NA: 1..N)
    MAX_LOGICAL_NODES,      \* РњР°РєСЃРёРјСѓРј Р»РѕРіРёС‡РµСЃРєРёС… СѓР·Р»РѕРІ РЅР° РєРѕРЅС‚СЂРѕР»Р»РµСЂ (LA: 0..MAX)
    DEFAULT_CFG,           \* РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ
    NULL                  \* РџСѓСЃС‚РѕРµ Р·РЅР°С‡РµРЅРёРµ

ASSUME NUM_CONTROLLERS > 0
ASSUME MAX_LOGICAL_NODES >= 0 /\ MAX_LOGICAL_NODES <= 14

\* ============================================================================
\* РўР�РџР« РћР‘РЄР•РљРўРћР’ (OBJ РїРѕР»Рµ РІ CAN ID)
\* ============================================================================
OBJ_ERR == 0              \* РћР±СЉРµРєС‚ РѕС€РёР±РѕРє
OBJ_DATA == 1             \* РћР±СЉРµРєС‚ РѕР±С‰РёС… РґР°РЅРЅС‹С…
OBJ_CFG == 14             \* РћР±СЉРµРєС‚ РєРѕРЅС„РёРіСѓСЂР°С†РёРё
OBJ_ID == 15              \* РћР±СЉРµРєС‚ РёРґРµРЅС‚РёС„РёРєР°С†РёРё (С‚РѕР»СЊРєРѕ LA=0!)

\* РўРёРїС‹ СЃРѕРѕР±С‰РµРЅРёР№ (T РїРѕР»Рµ РІ CAN ID)
MSG_REQ == 0              \* T=0: Request
MSG_ACK == 1              \* T=1: Acknowledge

\* РќР°РїСЂР°РІР»РµРЅРёРµ (D РїРѕР»Рµ РІ CAN ID)
DIR_TO_SLAVE == 0         \* D=0: Master -> Slave
DIR_TO_MASTER == 1        \* D=1: Slave -> Master

\* Broadcast Р°РґСЂРµСЃР°
BROADCAST_NA == 127       \* NA=127: РІСЃРµРј РєРѕРЅС‚СЂРѕР»Р»РµСЂР°Рј
BROADCAST_LA == 15        \* LA=15: РІСЃРµРј СѓР·Р»Р°Рј РЅР° РєРѕРЅС‚СЂРѕР»Р»РµСЂРµ

\* ============================================================================
\* РЎРћРЎРўРћРЇРќР�РЇ РЈР—Р›РћР’
\* ============================================================================
STATE_UNDEFINED == "UNDEFINED"
STATE_UNCONFIGURED == "UNCONFIGURED"
STATE_ONLINE == "ONLINE"
STATE_STALL == "STALL"

\* ============================================================================
\* РђР”Р Р•РЎРђР¦Р�РЇ
\* ============================================================================
NetworkAddrs == 1..NUM_CONTROLLERS              \* NA: 1..N
AllLAs == 0..MAX_LOGICAL_NODES                  \* LA: 0..MAX (0 = С„РёР·РёС‡РµСЃРєРёР№)
NodeAddrs == NetworkAddrs \X AllLAs             \* Р’СЃРµ СѓР·Р»С‹: (NA, LA)

\* ============================================================================
\* РЎРўР РЈРљРўРЈР Рђ CAN РЎРћРћР‘Р©Р•РќР�РЇ
\* ============================================================================
DefaultMessage == [obj |-> 0, dir |-> 0, na |-> 0, la |-> 0, type |-> 0, payload |-> NULL]

(* --algorithm CANProPlusProtocolV2 {

    variables
        \* CAN С€РёРЅР°
        canBus = <<>>;

        \* РЎРѕСЃС‚РѕСЏРЅРёРµ РІСЃРµС… СѓР·Р»РѕРІ (LA=0 Рё LA>0 РѕРґРёРЅР°РєРѕРІС‹Рµ)
        nodeState = [addr \in NodeAddrs |-> STATE_UNDEFINED];
        nodeCfg = [addr \in NodeAddrs |-> NULL];
        nodeErr = [addr \in NodeAddrs |-> NULL];
        nodeIoStatus = [addr \in NodeAddrs |-> FALSE];

        \* Shadow state РјР°СЃС‚РµСЂР°
        masterDB = [addr \in NodeAddrs |-> [
            cfg |-> DEFAULT_CFG,
            err_status |-> NULL
        ]];
        masterShadow = [addr \in NodeAddrs |-> [
            cfg |-> NULL,
            err_status |-> NULL,
            is_configured |-> FALSE,
            io_operational |-> FALSE
        ]];

    define {
        CANMessage(object, direction, netAddr, logAddr, msgType, data) == [
            obj |-> object,
            dir |-> direction,
            na |-> netAddr,
            la |-> logAddr,
            type |-> msgType,
            payload |-> data
        ]

        MessageForNode(m, na, la) ==
            /\ m.dir = DIR_TO_SLAVE
            /\ (m.na = na \/ m.na = BROADCAST_NA)
            /\ (m.la = la \/ m.la = BROADCAST_LA)

        MessageForMaster(m) == m.dir = DIR_TO_MASTER

        DataMatches(d1, d2) == d1 = d2

        AllNodesOnline == \A addr \in NodeAddrs : nodeState[addr] = STATE_ONLINE
        AllNodesConfigured == \A addr \in NodeAddrs : masterShadow[addr].is_configured
    }

    \* ========================================================================
    \* РњРђРЎРўР•Р 
    \* ========================================================================
    fair process (Master = <<0, 0>>)
    variables
        msg = DefaultMessage;
        targetNA = 1;
        targetLA = 0;
        response = DefaultMessage;
        initAddr = <<1, 0>>;  \* Р”Р»СЏ РёРЅРёС†РёР°Р»РёР·Р°С†РёРё РІСЃРµС… СѓР·Р»РѕРІ
    {
        MasterInit:
            \* РћС‚РїСЂР°РІР»СЏРµРј CFG ACK РєР°Р¶РґРѕРјСѓ СѓР·Р»Сѓ РёРЅРґРёРІРёРґСѓР°Р»СЊРЅРѕ
            initAddr := <<1, 0>>;

        MasterInitLoop:
            while (initAddr \in NodeAddrs) {
                canBus := Append(canBus, CANMessage(OBJ_CFG, DIR_TO_SLAVE, initAddr[1], initAddr[2], MSG_ACK, NULL));
                \* РџРµСЂРµС…РѕРґ Рє СЃР»РµРґСѓСЋС‰РµРјСѓ Р°РґСЂРµСЃСѓ
                if (initAddr[2] < MAX_LOGICAL_NODES) {
                    initAddr := <<initAddr[1], initAddr[2] + 1>>;
                } else if (initAddr[1] < NUM_CONTROLLERS) {
                    initAddr := <<initAddr[1] + 1, 0>>;
                } else {
                    initAddr := <<0, 0>>;  \* Р’С‹С…РѕРґ РёР· С†РёРєР»Р°
                };
            };

        MasterMainLoop:
            while (TRUE) {
                either {
                    \* Р–РґС‘Рј СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ slave
                    await Len(canBus) > 0 /\ MessageForMaster(Head(canBus));

                    msg := Head(canBus);
                    canBus := Tail(canBus);
                    targetNA := msg.na;
                    targetLA := msg.la;

                    if (msg.obj = OBJ_CFG) {
                        goto MasterHandleCfg;
                    } else if (msg.obj = OBJ_ERR) {
                        goto MasterHandleErr;
                    } else if (msg.obj = OBJ_DATA) {
                        goto MasterHandleData;
                    } else if (msg.obj = OBJ_ID /\ targetLA = 0) {
                        \* OBJ_ID С‚РѕР»СЊРєРѕ РѕС‚ LA=0
                        goto MasterHandleId;
                    };
                } or {
                    \* DATA Р·Р°РїСЂРѕСЃ РµСЃР»Рё РІСЃРµ РѕРЅР»Р°Р№РЅ
                    await AllNodesOnline;
                    with (addr \in NodeAddrs) {
                        targetNA := addr[1];
                        targetLA := addr[2];
                    };
                    response := CANMessage(OBJ_DATA, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, <<>>);
                    canBus := Append(canBus, response);
                };
            };

        MasterHandleCfg:
            if (msg.type = MSG_REQ) {
                if (DataMatches(msg.payload, masterDB[<<targetNA, targetLA>>].cfg)) {
                    response := CANMessage(OBJ_CFG, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, msg.payload);
                } else {
                    masterShadow[<<targetNA, targetLA>>].is_configured := FALSE;
                    response := CANMessage(OBJ_CFG, DIR_TO_SLAVE, targetNA, targetLA, MSG_REQ, masterDB[<<targetNA, targetLA>>].cfg);
                };
                canBus := Append(canBus, response);
            } else if (msg.type = MSG_ACK) {
                if (DataMatches(msg.payload, masterDB[<<targetNA, targetLA>>].cfg)) {
                    masterShadow[<<targetNA, targetLA>>].is_configured := TRUE ||
                    masterShadow[<<targetNA, targetLA>>].cfg := msg.payload;
                    response := CANMessage(OBJ_ERR, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, NULL);
                    canBus := Append(canBus, response);
                } else {
                    masterShadow[<<targetNA, targetLA>>].is_configured := FALSE;
                    response := CANMessage(OBJ_CFG, DIR_TO_SLAVE, targetNA, targetLA, MSG_REQ, masterDB[<<targetNA, targetLA>>].cfg);
                    canBus := Append(canBus, response);
                };
            };
            goto MasterMainLoop;

        MasterHandleErr:
            if (msg.type = MSG_REQ) {
                response := CANMessage(OBJ_ERR, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, masterDB[<<targetNA, targetLA>>].err_status);
                canBus := Append(canBus, response);
            } else if (msg.type = MSG_ACK) {
                masterShadow[<<targetNA, targetLA>>].err_status := msg.payload ||
                masterShadow[<<targetNA, targetLA>>].io_operational := TRUE;
            };
            goto MasterMainLoop;

        MasterHandleData:
            skip;
            goto MasterMainLoop;

        MasterHandleId:
            \* РћР±СЂР°Р±РѕС‚РєР° OBJ_ID (С‚РѕР»СЊРєРѕ РґР»СЏ LA=0)
            skip;
            goto MasterMainLoop;
    }

    \* ========================================================================
    \* SLAVE РЈР—Р•Р› (РµРґРёРЅС‹Р№ РґР»СЏ LA=0 Рё LA>0)
    \* ========================================================================
    fair process (SlaveNode \in NodeAddrs)
    variables
        myNA = self[1];
        myLA = self[2];
        msg = DefaultMessage;
        response = DefaultMessage;
        cfgMatches = FALSE;
        errMatches = FALSE;
    {
        SlaveInit:
            nodeState[<<myNA, myLA>>] := STATE_UNCONFIGURED;
            nodeCfg[<<myNA, myLA>>] := NULL;
            \* Р—Р°РїСЂРѕСЃ РєРѕРЅС„РёРіСѓСЂР°С†РёРё
            response := CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA, myLA, MSG_REQ, NULL);
            canBus := Append(canBus, response);

        SlaveMainLoop:
            while (TRUE) {
                SlaveWaitMsg:
                    await Len(canBus) > 0 /\ MessageForNode(Head(canBus), myNA, myLA);
                    msg := Head(canBus);
                    canBus := Tail(canBus);

                    if (msg.obj = OBJ_CFG) {
                        goto SlaveHandleCfg;
                    } else if (msg.obj = OBJ_ERR) {
                        goto SlaveHandleErr;
                    } else if (msg.obj = OBJ_DATA) {
                        goto SlaveHandleData;
                    } else if (msg.obj = OBJ_ID) {
                        \* OBJ_ID РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ LA=0
                        if (myLA = 0) {
                            goto SlaveHandleId;
                        };
                    };
            };

        SlaveHandleCfg:
            cfgMatches := DataMatches(msg.payload, nodeCfg[<<myNA, myLA>>]) \/ nodeCfg[<<myNA, myLA>>] = NULL;

            if (msg.type = MSG_REQ) {
                \* Р’СЃРµРіРґР° СЃРѕС…СЂР°РЅСЏРµРј РєРѕРЅС„РёРі РїСЂРё РїРѕР»СѓС‡РµРЅРёРё REQ
                nodeCfg[<<myNA, myLA>>] := msg.payload;
                if (cfgMatches) {
                    response := CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA, myLA, MSG_ACK, msg.payload);
                } else {
                    response := CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA, myLA, MSG_REQ, msg.payload);
                };
                canBus := Append(canBus, response);
            } else if (msg.type = MSG_ACK) {
                if (cfgMatches) {
                    if (nodeIoStatus[<<myNA, myLA>>]) {
                        nodeState[<<myNA, myLA>>] := STATE_ONLINE;
                    } else {
                        nodeState[<<myNA, myLA>>] := STATE_STALL;
                    };
                    response := CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA, myLA, MSG_ACK, nodeCfg[<<myNA, myLA>>]);
                } else {
                    response := CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA, myLA, MSG_REQ, nodeCfg[<<myNA, myLA>>]);
                };
                canBus := Append(canBus, response);
            };
            goto SlaveMainLoop;

        SlaveHandleErr:
            if (nodeState[<<myNA, myLA>>] \in {STATE_UNCONFIGURED, STATE_ONLINE, STATE_STALL}) {
                errMatches := DataMatches(msg.payload, nodeErr[<<myNA, myLA>>]) \/ nodeErr[<<myNA, myLA>>] = NULL;

                if (msg.type = MSG_REQ) {
                    if (errMatches) {
                        response := CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA, myLA, MSG_ACK, nodeErr[<<myNA, myLA>>]);
                    } else {
                        nodeState[<<myNA, myLA>>] := STATE_STALL;
                        response := CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA, myLA, MSG_REQ, nodeErr[<<myNA, myLA>>]);
                    };
                    canBus := Append(canBus, response);
                } else if (msg.type = MSG_ACK) {
                    if (errMatches) {
                        nodeState[<<myNA, myLA>>] := STATE_ONLINE;
                        nodeIoStatus[<<myNA, myLA>>] := TRUE;
                        response := CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA, myLA, MSG_ACK, nodeErr[<<myNA, myLA>>]);
                    } else {
                        response := CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA, myLA, MSG_REQ, nodeErr[<<myNA, myLA>>]);
                    };
                    canBus := Append(canBus, response);
                };
            };
            goto SlaveMainLoop;

        SlaveHandleData:
            if (nodeState[<<myNA, myLA>>] = STATE_ONLINE) {
                if (msg.type = MSG_REQ) {
                    response := CANMessage(OBJ_DATA, DIR_TO_MASTER, myNA, myLA, MSG_ACK, <<>>);
                    canBus := Append(canBus, response);
                } else if (msg.type = MSG_ACK) {
                    response := CANMessage(OBJ_DATA, DIR_TO_MASTER, myNA, myLA, MSG_REQ, <<>>);
                    canBus := Append(canBus, response);
                };
            };
            goto SlaveMainLoop;

        SlaveHandleId:
            \* РўРѕР»СЊРєРѕ РґР»СЏ LA=0 - РѕР±СЂР°Р±РѕС‚РєР° РёРґРµРЅС‚РёС„РёРєР°С†РёРё
            if (myLA = 0) {
                response := CANMessage(OBJ_ID, DIR_TO_MASTER, myNA, myLA, MSG_ACK, myNA);
                canBus := Append(canBus, response);
            };
            goto SlaveMainLoop;
    }

} *)
\* BEGIN TRANSLATION (chksum(pcal) = "ca21c07f" /\ chksum(tla) = "39ef3d23")
\* Process variable msg of process Master at line 108 col 9 changed to msg_
\* Process variable response of process Master at line 111 col 9 changed to response_
VARIABLES pc, canBus, nodeState, nodeCfg, nodeErr, nodeIoStatus, masterDB, 
          masterShadow

(* define statement *)
CANMessage(object, direction, netAddr, logAddr, msgType, data) == [
    obj |-> object,
    dir |-> direction,
    na |-> netAddr,
    la |-> logAddr,
    type |-> msgType,
    payload |-> data
]

MessageForNode(m, na, la) ==
    /\ m.dir = DIR_TO_SLAVE
    /\ (m.na = na \/ m.na = BROADCAST_NA)
    /\ (m.la = la \/ m.la = BROADCAST_LA)

MessageForMaster(m) == m.dir = DIR_TO_MASTER

DataMatches(d1, d2) == d1 = d2

AllNodesOnline == \A addr \in NodeAddrs : nodeState[addr] = STATE_ONLINE
AllNodesConfigured == \A addr \in NodeAddrs : masterShadow[addr].is_configured

VARIABLES msg_, targetNA, targetLA, response_, initAddr, myNA, myLA, msg, 
          response, cfgMatches, errMatches

vars == << pc, canBus, nodeState, nodeCfg, nodeErr, nodeIoStatus, masterDB, 
           masterShadow, msg_, targetNA, targetLA, response_, initAddr, myNA, 
           myLA, msg, response, cfgMatches, errMatches >>

ProcSet == {<<0, 0>>} \cup (NodeAddrs)

Init == (* Global variables *)
        /\ canBus = <<>>
        /\ nodeState = [addr \in NodeAddrs |-> STATE_UNDEFINED]
        /\ nodeCfg = [addr \in NodeAddrs |-> NULL]
        /\ nodeErr = [addr \in NodeAddrs |-> NULL]
        /\ nodeIoStatus = [addr \in NodeAddrs |-> FALSE]
        /\ masterDB =            [addr \in NodeAddrs |-> [
                          cfg |-> DEFAULT_CFG,
                          err_status |-> NULL
                      ]]
        /\ masterShadow =                [addr \in NodeAddrs |-> [
                              cfg |-> NULL,
                              err_status |-> NULL,
                              is_configured |-> FALSE,
                              io_operational |-> FALSE
                          ]]
        (* Process Master *)
        /\ msg_ = DefaultMessage
        /\ targetNA = 1
        /\ targetLA = 0
        /\ response_ = DefaultMessage
        /\ initAddr = <<1, 0>>
        (* Process SlaveNode *)
        /\ myNA = [self \in NodeAddrs |-> self[1]]
        /\ myLA = [self \in NodeAddrs |-> self[2]]
        /\ msg = [self \in NodeAddrs |-> DefaultMessage]
        /\ response = [self \in NodeAddrs |-> DefaultMessage]
        /\ cfgMatches = [self \in NodeAddrs |-> FALSE]
        /\ errMatches = [self \in NodeAddrs |-> FALSE]
        /\ pc = [self \in ProcSet |-> CASE self = <<0, 0>> -> "MasterInit"
                                        [] self \in NodeAddrs -> "SlaveInit"]

MasterInit == /\ pc[<<0, 0>>] = "MasterInit"
              /\ initAddr' = <<1, 0>>
              /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterInitLoop"]
              /\ UNCHANGED << canBus, nodeState, nodeCfg, nodeErr, 
                              nodeIoStatus, masterDB, masterShadow, msg_, 
                              targetNA, targetLA, response_, myNA, myLA, msg, 
                              response, cfgMatches, errMatches >>

MasterInitLoop == /\ pc[<<0, 0>>] = "MasterInitLoop"
                  /\ IF initAddr \in NodeAddrs
                        THEN /\ canBus' = Append(canBus, CANMessage(OBJ_CFG, DIR_TO_SLAVE, initAddr[1], initAddr[2], MSG_ACK, NULL))
                             /\ IF initAddr[2] < MAX_LOGICAL_NODES
                                   THEN /\ initAddr' = <<initAddr[1], initAddr[2] + 1>>
                                   ELSE /\ IF initAddr[1] < NUM_CONTROLLERS
                                              THEN /\ initAddr' = <<initAddr[1] + 1, 0>>
                                              ELSE /\ initAddr' = <<0, 0>>
                             /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterInitLoop"]
                        ELSE /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                             /\ UNCHANGED << canBus, initAddr >>
                  /\ UNCHANGED << nodeState, nodeCfg, nodeErr, nodeIoStatus, 
                                  masterDB, masterShadow, msg_, targetNA, 
                                  targetLA, response_, myNA, myLA, msg, 
                                  response, cfgMatches, errMatches >>

MasterMainLoop == /\ pc[<<0, 0>>] = "MasterMainLoop"
                  /\ \/ /\ Len(canBus) > 0 /\ MessageForMaster(Head(canBus))
                        /\ msg_' = Head(canBus)
                        /\ canBus' = Tail(canBus)
                        /\ targetNA' = msg_'.na
                        /\ targetLA' = msg_'.la
                        /\ IF msg_'.obj = OBJ_CFG
                              THEN /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterHandleCfg"]
                              ELSE /\ IF msg_'.obj = OBJ_ERR
                                         THEN /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterHandleErr"]
                                         ELSE /\ IF msg_'.obj = OBJ_DATA
                                                    THEN /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterHandleData"]
                                                    ELSE /\ IF msg_'.obj = OBJ_ID /\ targetLA' = 0
                                                               THEN /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterHandleId"]
                                                               ELSE /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                        /\ UNCHANGED response_
                     \/ /\ AllNodesOnline
                        /\ \E addr \in NodeAddrs:
                             /\ targetNA' = addr[1]
                             /\ targetLA' = addr[2]
                        /\ response_' = CANMessage(OBJ_DATA, DIR_TO_SLAVE, targetNA', targetLA', MSG_ACK, <<>>)
                        /\ canBus' = Append(canBus, response_')
                        /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                        /\ msg_' = msg_
                  /\ UNCHANGED << nodeState, nodeCfg, nodeErr, nodeIoStatus, 
                                  masterDB, masterShadow, initAddr, myNA, myLA, 
                                  msg, response, cfgMatches, errMatches >>

MasterHandleCfg == /\ pc[<<0, 0>>] = "MasterHandleCfg"
                   /\ IF msg_.type = MSG_REQ
                         THEN /\ IF DataMatches(msg_.payload, masterDB[<<targetNA, targetLA>>].cfg)
                                    THEN /\ response_' = CANMessage(OBJ_CFG, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, msg_.payload)
                                         /\ UNCHANGED masterShadow
                                    ELSE /\ masterShadow' = [masterShadow EXCEPT ![<<targetNA, targetLA>>].is_configured = FALSE]
                                         /\ response_' = CANMessage(OBJ_CFG, DIR_TO_SLAVE, targetNA, targetLA, MSG_REQ, masterDB[<<targetNA, targetLA>>].cfg)
                              /\ canBus' = Append(canBus, response_')
                         ELSE /\ IF msg_.type = MSG_ACK
                                    THEN /\ IF DataMatches(msg_.payload, masterDB[<<targetNA, targetLA>>].cfg)
                                               THEN /\ masterShadow' = [masterShadow EXCEPT ![<<targetNA, targetLA>>].is_configured = TRUE,
                                                                                            ![<<targetNA, targetLA>>].cfg = msg_.payload]
                                                    /\ response_' = CANMessage(OBJ_ERR, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, NULL)
                                                    /\ canBus' = Append(canBus, response_')
                                               ELSE /\ masterShadow' = [masterShadow EXCEPT ![<<targetNA, targetLA>>].is_configured = FALSE]
                                                    /\ response_' = CANMessage(OBJ_CFG, DIR_TO_SLAVE, targetNA, targetLA, MSG_REQ, masterDB[<<targetNA, targetLA>>].cfg)
                                                    /\ canBus' = Append(canBus, response_')
                                    ELSE /\ TRUE
                                         /\ UNCHANGED << canBus, masterShadow, 
                                                         response_ >>
                   /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                   /\ UNCHANGED << nodeState, nodeCfg, nodeErr, nodeIoStatus, 
                                   masterDB, msg_, targetNA, targetLA, 
                                   initAddr, myNA, myLA, msg, response, 
                                   cfgMatches, errMatches >>

MasterHandleErr == /\ pc[<<0, 0>>] = "MasterHandleErr"
                   /\ IF msg_.type = MSG_REQ
                         THEN /\ response_' = CANMessage(OBJ_ERR, DIR_TO_SLAVE, targetNA, targetLA, MSG_ACK, masterDB[<<targetNA, targetLA>>].err_status)
                              /\ canBus' = Append(canBus, response_')
                              /\ UNCHANGED masterShadow
                         ELSE /\ IF msg_.type = MSG_ACK
                                    THEN /\ masterShadow' = [masterShadow EXCEPT ![<<targetNA, targetLA>>].err_status = msg_.payload,
                                                                                 ![<<targetNA, targetLA>>].io_operational = TRUE]
                                    ELSE /\ TRUE
                                         /\ UNCHANGED masterShadow
                              /\ UNCHANGED << canBus, response_ >>
                   /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                   /\ UNCHANGED << nodeState, nodeCfg, nodeErr, nodeIoStatus, 
                                   masterDB, msg_, targetNA, targetLA, 
                                   initAddr, myNA, myLA, msg, response, 
                                   cfgMatches, errMatches >>

MasterHandleData == /\ pc[<<0, 0>>] = "MasterHandleData"
                    /\ TRUE
                    /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                    /\ UNCHANGED << canBus, nodeState, nodeCfg, nodeErr, 
                                    nodeIoStatus, masterDB, masterShadow, msg_, 
                                    targetNA, targetLA, response_, initAddr, 
                                    myNA, myLA, msg, response, cfgMatches, 
                                    errMatches >>

MasterHandleId == /\ pc[<<0, 0>>] = "MasterHandleId"
                  /\ TRUE
                  /\ pc' = [pc EXCEPT ![<<0, 0>>] = "MasterMainLoop"]
                  /\ UNCHANGED << canBus, nodeState, nodeCfg, nodeErr, 
                                  nodeIoStatus, masterDB, masterShadow, msg_, 
                                  targetNA, targetLA, response_, initAddr, 
                                  myNA, myLA, msg, response, cfgMatches, 
                                  errMatches >>

Master == MasterInit \/ MasterInitLoop \/ MasterMainLoop \/ MasterHandleCfg
             \/ MasterHandleErr \/ MasterHandleData \/ MasterHandleId

SlaveInit(self) == /\ pc[self] = "SlaveInit"
                   /\ nodeState' = [nodeState EXCEPT ![<<myNA[self], myLA[self]>>] = STATE_UNCONFIGURED]
                   /\ nodeCfg' = [nodeCfg EXCEPT ![<<myNA[self], myLA[self]>>] = NULL]
                   /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA[self], myLA[self], MSG_REQ, NULL)]
                   /\ canBus' = Append(canBus, response'[self])
                   /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                   /\ UNCHANGED << nodeErr, nodeIoStatus, masterDB, 
                                   masterShadow, msg_, targetNA, targetLA, 
                                   response_, initAddr, myNA, myLA, msg, 
                                   cfgMatches, errMatches >>

SlaveMainLoop(self) == /\ pc[self] = "SlaveMainLoop"
                       /\ pc' = [pc EXCEPT ![self] = "SlaveWaitMsg"]
                       /\ UNCHANGED << canBus, nodeState, nodeCfg, nodeErr, 
                                       nodeIoStatus, masterDB, masterShadow, 
                                       msg_, targetNA, targetLA, response_, 
                                       initAddr, myNA, myLA, msg, response, 
                                       cfgMatches, errMatches >>

SlaveWaitMsg(self) == /\ pc[self] = "SlaveWaitMsg"
                      /\ Len(canBus) > 0 /\ MessageForNode(Head(canBus), myNA[self], myLA[self])
                      /\ msg' = [msg EXCEPT ![self] = Head(canBus)]
                      /\ canBus' = Tail(canBus)
                      /\ IF msg'[self].obj = OBJ_CFG
                            THEN /\ pc' = [pc EXCEPT ![self] = "SlaveHandleCfg"]
                            ELSE /\ IF msg'[self].obj = OBJ_ERR
                                       THEN /\ pc' = [pc EXCEPT ![self] = "SlaveHandleErr"]
                                       ELSE /\ IF msg'[self].obj = OBJ_DATA
                                                  THEN /\ pc' = [pc EXCEPT ![self] = "SlaveHandleData"]
                                                  ELSE /\ IF msg'[self].obj = OBJ_ID
                                                             THEN /\ IF myLA[self] = 0
                                                                        THEN /\ pc' = [pc EXCEPT ![self] = "SlaveHandleId"]
                                                                        ELSE /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                                                             ELSE /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                      /\ UNCHANGED << nodeState, nodeCfg, nodeErr, 
                                      nodeIoStatus, masterDB, masterShadow, 
                                      msg_, targetNA, targetLA, response_, 
                                      initAddr, myNA, myLA, response, 
                                      cfgMatches, errMatches >>

SlaveHandleCfg(self) == /\ pc[self] = "SlaveHandleCfg"
                        /\ cfgMatches' = [cfgMatches EXCEPT ![self] = DataMatches(msg[self].payload, nodeCfg[<<myNA[self], myLA[self]>>]) \/ nodeCfg[<<myNA[self], myLA[self]>>] = NULL]
                        /\ IF msg[self].type = MSG_REQ
                              THEN /\ nodeCfg' = [nodeCfg EXCEPT ![<<myNA[self], myLA[self]>>] = msg[self].payload]
                                   /\ IF cfgMatches'[self]
                                         THEN /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA[self], myLA[self], MSG_ACK, msg[self].payload)]
                                         ELSE /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA[self], myLA[self], MSG_REQ, msg[self].payload)]
                                   /\ canBus' = Append(canBus, response'[self])
                                   /\ UNCHANGED nodeState
                              ELSE /\ IF msg[self].type = MSG_ACK
                                         THEN /\ IF cfgMatches'[self]
                                                    THEN /\ IF nodeIoStatus[<<myNA[self], myLA[self]>>]
                                                               THEN /\ nodeState' = [nodeState EXCEPT ![<<myNA[self], myLA[self]>>] = STATE_ONLINE]
                                                               ELSE /\ nodeState' = [nodeState EXCEPT ![<<myNA[self], myLA[self]>>] = STATE_STALL]
                                                         /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA[self], myLA[self], MSG_ACK, nodeCfg[<<myNA[self], myLA[self]>>])]
                                                    ELSE /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_CFG, DIR_TO_MASTER, myNA[self], myLA[self], MSG_REQ, nodeCfg[<<myNA[self], myLA[self]>>])]
                                                         /\ UNCHANGED nodeState
                                              /\ canBus' = Append(canBus, response'[self])
                                         ELSE /\ TRUE
                                              /\ UNCHANGED << canBus, 
                                                              nodeState, 
                                                              response >>
                                   /\ UNCHANGED nodeCfg
                        /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                        /\ UNCHANGED << nodeErr, nodeIoStatus, masterDB, 
                                        masterShadow, msg_, targetNA, targetLA, 
                                        response_, initAddr, myNA, myLA, msg, 
                                        errMatches >>

SlaveHandleErr(self) == /\ pc[self] = "SlaveHandleErr"
                        /\ IF nodeState[<<myNA[self], myLA[self]>>] \in {STATE_UNCONFIGURED, STATE_ONLINE, STATE_STALL}
                              THEN /\ errMatches' = [errMatches EXCEPT ![self] = DataMatches(msg[self].payload, nodeErr[<<myNA[self], myLA[self]>>]) \/ nodeErr[<<myNA[self], myLA[self]>>] = NULL]
                                   /\ IF msg[self].type = MSG_REQ
                                         THEN /\ IF errMatches'[self]
                                                    THEN /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA[self], myLA[self], MSG_ACK, nodeErr[<<myNA[self], myLA[self]>>])]
                                                         /\ UNCHANGED nodeState
                                                    ELSE /\ nodeState' = [nodeState EXCEPT ![<<myNA[self], myLA[self]>>] = STATE_STALL]
                                                         /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA[self], myLA[self], MSG_REQ, nodeErr[<<myNA[self], myLA[self]>>])]
                                              /\ canBus' = Append(canBus, response'[self])
                                              /\ UNCHANGED nodeIoStatus
                                         ELSE /\ IF msg[self].type = MSG_ACK
                                                    THEN /\ IF errMatches'[self]
                                                               THEN /\ nodeState' = [nodeState EXCEPT ![<<myNA[self], myLA[self]>>] = STATE_ONLINE]
                                                                    /\ nodeIoStatus' = [nodeIoStatus EXCEPT ![<<myNA[self], myLA[self]>>] = TRUE]
                                                                    /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA[self], myLA[self], MSG_ACK, nodeErr[<<myNA[self], myLA[self]>>])]
                                                               ELSE /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_ERR, DIR_TO_MASTER, myNA[self], myLA[self], MSG_REQ, nodeErr[<<myNA[self], myLA[self]>>])]
                                                                    /\ UNCHANGED << nodeState, 
                                                                                    nodeIoStatus >>
                                                         /\ canBus' = Append(canBus, response'[self])
                                                    ELSE /\ TRUE
                                                         /\ UNCHANGED << canBus, 
                                                                         nodeState, 
                                                                         nodeIoStatus, 
                                                                         response >>
                              ELSE /\ TRUE
                                   /\ UNCHANGED << canBus, nodeState, 
                                                   nodeIoStatus, response, 
                                                   errMatches >>
                        /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                        /\ UNCHANGED << nodeCfg, nodeErr, masterDB, 
                                        masterShadow, msg_, targetNA, targetLA, 
                                        response_, initAddr, myNA, myLA, msg, 
                                        cfgMatches >>

SlaveHandleData(self) == /\ pc[self] = "SlaveHandleData"
                         /\ IF nodeState[<<myNA[self], myLA[self]>>] = STATE_ONLINE
                               THEN /\ IF msg[self].type = MSG_REQ
                                          THEN /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_DATA, DIR_TO_MASTER, myNA[self], myLA[self], MSG_ACK, <<>>)]
                                               /\ canBus' = Append(canBus, response'[self])
                                          ELSE /\ IF msg[self].type = MSG_ACK
                                                     THEN /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_DATA, DIR_TO_MASTER, myNA[self], myLA[self], MSG_REQ, <<>>)]
                                                          /\ canBus' = Append(canBus, response'[self])
                                                     ELSE /\ TRUE
                                                          /\ UNCHANGED << canBus, 
                                                                          response >>
                               ELSE /\ TRUE
                                    /\ UNCHANGED << canBus, response >>
                         /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                         /\ UNCHANGED << nodeState, nodeCfg, nodeErr, 
                                         nodeIoStatus, masterDB, masterShadow, 
                                         msg_, targetNA, targetLA, response_, 
                                         initAddr, myNA, myLA, msg, cfgMatches, 
                                         errMatches >>

SlaveHandleId(self) == /\ pc[self] = "SlaveHandleId"
                       /\ IF myLA[self] = 0
                             THEN /\ response' = [response EXCEPT ![self] = CANMessage(OBJ_ID, DIR_TO_MASTER, myNA[self], myLA[self], MSG_ACK, myNA[self])]
                                  /\ canBus' = Append(canBus, response'[self])
                             ELSE /\ TRUE
                                  /\ UNCHANGED << canBus, response >>
                       /\ pc' = [pc EXCEPT ![self] = "SlaveMainLoop"]
                       /\ UNCHANGED << nodeState, nodeCfg, nodeErr, 
                                       nodeIoStatus, masterDB, masterShadow, 
                                       msg_, targetNA, targetLA, response_, 
                                       initAddr, myNA, myLA, msg, cfgMatches, 
                                       errMatches >>

SlaveNode(self) == SlaveInit(self) \/ SlaveMainLoop(self)
                      \/ SlaveWaitMsg(self) \/ SlaveHandleCfg(self)
                      \/ SlaveHandleErr(self) \/ SlaveHandleData(self)
                      \/ SlaveHandleId(self)

(* Allow infinite stuttering to prevent deadlock on termination. *)
Terminating == /\ \A self \in ProcSet: pc[self] = "Done"
               /\ UNCHANGED vars

Next == Master
           \/ (\E self \in NodeAddrs: SlaveNode(self))
           \/ Terminating

Spec == /\ Init /\ [][Next]_vars
        /\ WF_vars(Master)
        /\ \A self \in NodeAddrs : WF_vars(SlaveNode(self))

Termination == <>(\A self \in ProcSet: pc[self] = "Done")

\* END TRANSLATION 

\* ============================================================================
\* РћР“Р РђРќР�Р§Р•РќР�Р• РЎРћРЎРўРћРЇРќР�Р™
\* ============================================================================
StateConstraint == Len(canBus) <= 5

\* ============================================================================
\* Р�РќР’РђР Р�РђРќРўР«
\* ============================================================================

TypeOK ==
    /\ nodeState \in [NodeAddrs -> {STATE_UNDEFINED, STATE_UNCONFIGURED, STATE_ONLINE, STATE_STALL}]
    /\ \A addr \in NodeAddrs : masterShadow[addr].is_configured \in BOOLEAN

\* Configured => РЅРµ UNDEFINED
ConfiguredImpliesNotUndefined ==
    \A addr \in NodeAddrs :
        masterShadow[addr].is_configured => nodeState[addr] /= STATE_UNDEFINED

\* РљРѕРЅС„РёРіСѓСЂР°С†РёРё СЃРѕРІРїР°РґР°СЋС‚ РґР»СЏ ONLINE СѓР·Р»РѕРІ
ConfigurationConsistency ==
    \A addr \in NodeAddrs :
        (masterShadow[addr].is_configured /\ nodeState[addr] = STATE_ONLINE) =>
            masterShadow[addr].cfg = nodeCfg[addr]

\* OBJ_ID С‚РѕР»СЊРєРѕ РґР»СЏ LA=0
IdOnlyForPhysical ==
    \A i \in 1..Len(canBus) :
        canBus[i].obj = OBJ_ID => canBus[i].la = 0

\* ============================================================================
\* РЎР’РћР™РЎРўР’Рђ Р–Р�Р’РћРЎРўР�
\* ============================================================================

EventuallyNotUndefined ==
    \A addr \in NodeAddrs : <>(nodeState[addr] /= STATE_UNDEFINED)

EventuallyAllConfigured == <>[]AllNodesConfigured

EventuallyAllOnline == <>[]AllNodesOnline

====
