import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Box } from '@react-three/drei';
import * as THREE from 'three';

export function CANNode({ node, position }) {
    const meshRef = useRef();
    const [isDetailVisible, setDetailVisible] = useState(true);

    // Добавь это в CANNode.jsx внутри useFrame
    useFrame(({ camera }) => {
        const dist = camera.position.distanceTo(groupRef.current.getWorldPosition(new THREE.Vector3()));
        // Глубокое скрытие: на расстоянии > 15 не рендерим даже текст
        const shouldShowDetails = dist < 12;
        if (shouldShowDetails !== visible) setVisible(shouldShowDetails);
    });

    return (
        <group position={position} ref={meshRef}>
            {/* Платформа LA */}
            <mesh>
                <boxGeometry args={[3, 0.1, 1.5]} />
                <meshStandardMaterial color={node.la === 0 ? "#81d4fa" : "#ffffff"} />
            </mesh>

            <Text position={[-1.2, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.15} color="black">
                LA:{node.la} [{node.type}]
            </Text>

            {/* Внутреннее содержимое (скрывается) */}
            {isDetailVisible && (
                <group>
                    {/* Стек OBJ (ID, CFG, DATA) */}
                    {[0, 1, 2].map((i) => (
                        <Box key={i} args={[0.3, 0.3, 0.1]} position={[i * 0.5 - 0.2, 0.2, 0]}>
                            <meshStandardMaterial color={i === 0 ? "cyan" : "orange"} />
                        </Box>
                    ))}

                    {/* Список портов IO */}
                    {node.io.map((port, i) => (
                        <Text key={i} position={[0.8, 0.1, i * 0.2 - 0.4]} fontSize={0.1} color="#444" rotation={[-Math.PI / 2, 0, 0]}>
                            • {port}
                        </Text>
                    ))}
                </group>
            )}
        </group>
    );
}