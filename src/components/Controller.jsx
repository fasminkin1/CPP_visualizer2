import React from 'react';
import { Text, Sphere } from '@react-three/drei';
import { CANNode } from './CANNode';

export function Controller({ config, position }) {
    const isMaster = config.type === 'MASTER';

    return (
        <group position={position}>
            {/* Корпус контроллера */}
            <mesh>
                <boxGeometry args={[isMaster ? 3 : 2, 0.2, 2]} />
                <meshStandardMaterial color={isMaster ? "#ff3300" : "#333"} emissive={isMaster ? "#551100" : "#000"} />
            </mesh>

            <Text position={[0, -0.5, 1.2]} fontSize={0.25} color="black" rotation={[-Math.PI / 2, 0, 0]}>
                {config.name} {isMaster ? "(HOST)" : `(NA:${config.na})`}
            </Text>

            {/* Если это Мастер — рисуем ядро, если Слейв — его LA узлы */}
            {isMaster ? (
                <Sphere args={[0.5, 32, 32]} position={[0, 0.5, 0]}>
                    <meshStandardMaterial color="red" wireframe />
                </Sphere>
            ) : (
                config.nodes.map((node, i) => (
                    <CANNode key={node.la} na={config.na} node={node} position={[0, (i + 1) * 1.2, 0]} />
                ))
            )}
        </group>
    );
}