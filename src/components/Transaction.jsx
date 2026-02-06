import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function Transaction({ from, to, type, onComplete }) {
    const ref = useRef();
    const speed = 0.05;

    useFrame(() => {
        if (ref.current) {
            ref.current.position.lerp(new THREE.Vector3(...to), speed);
            if (ref.current.position.distanceTo(new THREE.Vector3(...to)) < 0.1) {
                onComplete();
            }
        }
    });

    return (
        <mesh ref={ref} position={from}>
            <sphereGeometry args={[0.05]} />
            <meshBasicMaterial color={type === 0 ? "cyan" : "magenta"} />
        </mesh>
    );
}