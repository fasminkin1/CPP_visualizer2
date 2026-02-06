import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Packet({ from, to, color, onArrive }) {
    const ref = useRef();
    useFrame(() => {
        if (ref.current) {
            ref.current.position.lerp(new THREE.Vector3(...to), 0.1);
            if (ref.current.position.distanceTo(new THREE.Vector3(...to)) < 0.1) {
                onArrive();
            }
        }
    });

    return (
        <mesh ref={ref} position={from}>
            <sphereGeometry args={[0.08]} />
            <meshBasicMaterial color={color} />
        </mesh>
    );
}