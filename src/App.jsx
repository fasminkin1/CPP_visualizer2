import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Center, Text, Box, PerspectiveCamera, Sphere, Cylinder, Cone } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore, MSG_TYPES, DIR_TYPES, NODE_STATES, OBJ_TYPES, TEMPLATES, MASTER_STATES } from './store/simulationStore';

// --- БИЛБОРД ТЕКСТ (МАКСИМАЛЬНАЯ ВИДИМОСТЬ) ---
function BillboardText({ children, fontSize = 0.1, color = "black", outlineColor = "white", ...props }) {
  const ref = useRef();
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <Text
      ref={ref}
      fontSize={fontSize}
      color={color}
      outlineWidth={0.015}
      outlineColor={outlineColor}
      depthTest={false}     // Пробивает геометрию
      depthWrite={false}    // Не перекрывается прозрачностью
      renderOrder={10000}   // Поверх всего
      {...props}
    >
      {children}
    </Text>
  );
}

function IOPort({ port, position }) {
  const Shape = useMemo(() => {
    switch (port.type) {
      case 'DI': return <Box args={[0.07, 0.07, 0.07]}><meshStandardMaterial color="#607d8b" /></Box>;
      case 'DO': return <Cylinder args={[0.04, 0.04, 0.09]}><meshStandardMaterial color="#2e7d32" /></Cylinder>;
      case 'AI': return <Cone args={[0.05, 0.1, 8]}><meshStandardMaterial color="#fbc02d" /></Cone>;
      case 'AO': return <Sphere args={[0.05]}><meshStandardMaterial color="#e65100" /></Sphere>;
      case 'T': return <Cone args={[0.05, 0.1, 4]}><meshStandardMaterial color="#d32f2f" /></Cone>;
      default: return <Box args={[0.05, 0.05, 0.05]} />;
    }
  }, [port.type]);

  return (
    <group position={position}>
      {Shape}
      <BillboardText position={[0, 0.22, 0]} fontSize={0.09} color="black">{port.label}</BillboardText>
    </group>
  );
}

function DataObject({ type, io = [], position }) {
  // Invert OBJ_TYPES to get label
  const label = Object.keys(OBJ_TYPES).find(key => OBJ_TYPES[key] === type);
  const color = type === OBJ_TYPES.ID ? "#00e5ff" : type === OBJ_TYPES.ERR ? "#ff5252" : type === OBJ_TYPES.CFG ? "#9c27b0" : "#4caf50";

  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[1.3, 0.8, 3.5]} />
        <meshStandardMaterial color={color} transparent opacity={0.35} />
      </mesh>
      <BillboardText position={[0, 0.9, 0]} fontSize={0.22} color={color} outlineColor="white">{label}</BillboardText>
      <group position={[0.35, 0.05, 0]}>
        {io.map((p, i) => (
          <IOPort key={i} port={p} position={[0, 0, (i - (io.length - 1) / 2) * 0.35]} />
        ))}
      </group>
    </group>
  );
}

function FlyingMessage({ msg }) {
  // Since we are inside <Center />, the coordinates 0, 10, 20... line up exactly with nodes
  const startX = msg.from * 10;
  const endX = msg.to * 10;

  const x = THREE.MathUtils.lerp(startX, endX, msg.progress);
  const y = Math.sin(msg.progress * Math.PI) * 8 + 2;

  const label = Object.keys(OBJ_TYPES).find(k => OBJ_TYPES[k] === msg.obj) || 'MSG';
  const subLabel = msg.type === MSG_TYPES.REQ ? 'REQ' : 'ACK';

  const color = msg.type === MSG_TYPES.REQ ? "#ffeb3b" : "#69f0ae";

  return (
    <group position={[x, y, 0]}>
      <Sphere args={[0.4]}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </Sphere>
      <BillboardText position={[0, 0.8, 0]} fontSize={0.35} color="black">{label}</BillboardText>
      <BillboardText position={[0, 0.45, 0]} fontSize={0.25} color="#333">{subLabel}</BillboardText>
    </group>
  );
}

function MessageManager() {
  const messages = useSimulationStore(s => s.messages);
  const tick = useSimulationStore(s => s.tick);

  useFrame((_, delta) => {
    tick(delta);
  });

  return <group>{messages.map(m => <FlyingMessage key={m.id} msg={m} />)}</group>;
}

function LogicNode({ node, lod }) {
  const isPhys = node.la === 0;
  const activeObjs = isPhys ? [OBJ_TYPES.ERR, OBJ_TYPES.ID] : [OBJ_TYPES.ERR, OBJ_TYPES.DATA, OBJ_TYPES.CFG];
  if (lod >= 2) return null;

  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[5.2, 0.08, 4.0]} />
        <meshStandardMaterial color={isPhys ? "#e1f5fe" : "#ffffff"} />
      </mesh>
      <BillboardText position={[-3.4, 0.5, 1.8]} fontSize={0.28} color="#1a237e" anchorX="left">
        LA:{node.la} [{node.type}]
      </BillboardText>
      {lod === 0 ? (
        <group position={[0, 0.1, 0]}>
          {activeObjs.map((type, i) => (
            <DataObject key={type} type={type} io={node.io} position={[(i - (activeObjs.length - 1) / 2) * 1.6, 0, 0]} />
          ))}
        </group>
      ) : (
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[5.0, 0.75, 3.8]} />
          <meshStandardMaterial color={isPhys ? "#90caf9" : "#cfd8dc"} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

function ControllerUnit({ config, position, nodeState }) {
  const ref = useRef();
  const [lod, setLod] = useState(0);
  const isMaster = config.type === 'MASTER';
  const stateLabel = nodeState?.state || NODE_STATES.UNDEFINED;

  useFrame(({ camera }) => {
    if (!ref.current) return;
    const dist = camera.position.distanceTo(ref.current.getWorldPosition(new THREE.Vector3()));
    setLod(dist < 20 ? 0 : dist < 40 ? 1 : 2);
  });

  const nodeStep = 1.5;
  const totalHeight = isMaster ? 1.5 : (config.nodes.length * nodeStep);

  const stateColor = {
    [NODE_STATES.UNDEFINED]: '#9e9e9e',
    [NODE_STATES.UNCONFIGURED]: '#ff9800',
    [NODE_STATES.ONLINE]: '#4caf50',
    [NODE_STATES.STALL]: '#f44336',
    [MASTER_STATES.INIT]: '#2196f3', // Blue for Init
    [MASTER_STATES.IDLE]: '#4caf50'  // Green for Idle
  }[stateLabel] || '#9e9e9e';

  return (
    <group ref={ref} position={position}>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[6.8, 0.2, 5.0]} />
        <meshStandardMaterial color={isMaster ? "#b71c1c" : "#c76868"} />
      </mesh>
      <BillboardText position={[0, 0.8, 2.8]} fontSize={0.6} color={stateColor}>
        {config.type} {isMaster ? "" : `NA:${config.na}`} [{stateLabel}]
      </BillboardText>
      {lod === 2 && (
        <mesh position={[0, totalHeight / 2 + 0.2, 0]}>
          <boxGeometry args={[6.5, totalHeight, 4.8]} />
          <meshStandardMaterial color={isMaster ? "#ef5350" : "#2a7ba4"} transparent opacity={0.95} />
        </mesh>
      )}
      <group position={[0, 0.2, 0]}>
        {!isMaster && config.nodes.map((node, i) => (
          <group key={`${config.na}-${node.la}`} position={[0, i * nodeStep, 0]}>
            <LogicNode node={node} lod={lod} />
          </group>
        ))}
        {isMaster && lod < 2 && (
          <Box args={[1.8, 1.8, 1.8]} position={[0, 1, 0]}>
            <meshStandardMaterial color="#ff1744" wireframe />
          </Box>
        )}
      </group>
    </group>
  );
}

import TrafficLog from './components/TrafficLog';

export default function App() {
  const { network, addNode, nodeStates, powerOn, currentTime, maxTime, isPlaying, togglePlay, seek } = useSimulationStore();

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>

      {/* MAIN VIEWPORT */}
      <div style={{ flex: 2, display: 'flex', minHeight: 0 }}>
        <div style={{ width: '240px', padding: '20px', background: '#fff', borderRight: '1px solid #ddd', zIndex: 10, overflowY: 'auto' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>CANPro+</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={powerOn} style={{ padding: '12px', cursor: 'pointer', fontWeight: 'bold', background: '#4caf50', color: 'white', border: 'none', borderRadius: '4px' }}>POWER ON / RESET</button>
            <hr style={{ width: '100%', border: '0', borderTop: '1px solid #eee' }} />
            {Object.keys(TEMPLATES).map(t => (
              <button key={t} onClick={() => addNode(t)} style={{ padding: '12px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid #ccc', borderRadius: '4px' }}>+ {t}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <Canvas>
            <PerspectiveCamera makeDefault position={[20, 30, 50]} />
            <color attach="background" args={['#ffffff']} />
            <ambientLight intensity={1.8} />
            <pointLight position={[60, 80, 60]} intensity={3} />

            <Center>
              <MessageManager />
              {network.map((cfg) => (
                <ControllerUnit key={cfg.na} config={cfg} nodeState={nodeStates[cfg.na]} position={[cfg.na * 10, 0, 0]} />
              ))}
            </Center>

            <OrbitControls makeDefault target={[20, 0, 0]} />
          </Canvas>

          <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.8)', padding: '10px', borderRadius: '8px', zIndex: 100 }}>
            <h3>Time: {currentTime.toFixed(2)}s</h3>
          </div>
        </div>
      </div>

      {/* LOG & TIMELINE PANEL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: '1px solid #ccc', minHeight: '300px' }}>

        {/* TIMELINE CONTROLS */}
        <div style={{
          height: '60px', background: '#f5f5f5', borderBottom: '1px solid #ddd',
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', flexShrink: 0
        }}>
          <button onClick={togglePlay} style={{
            width: '40px', height: '40px', borderRadius: '50%', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isPlaying ? '#ff9800' : '#4caf50', color: 'white', fontSize: '20px', cursor: 'pointer'
          }}>
            {isPlaying ? '⏸' : '▶'}
          </button>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <input
              type="range"
              min="0"
              max={Math.max(0.1, maxTime)}
              step="0.05"
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#666' }}>
              <span>0.00s</span>
              <span>{maxTime.toFixed(2)}s</span>
            </div>
          </div>
        </div>

        {/* TRAFFIC LOG */}
        <TrafficLog />

      </div>
    </div>
  );
}