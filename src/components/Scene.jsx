import React from 'react';
import { Stars, OrbitControls } from '@react-three/drei';

export function Scene() {
    return (
        <>
            <color attach="background" args={['#050505']} />
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <OrbitControls />
        </>
    );
}