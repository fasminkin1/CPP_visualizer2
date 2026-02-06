import React from 'react';
import { PROTOCOL } from '../constants/protocol';

export function CANObject({ type, state, position }) {
    const isCritical = type === PROTOCOL.OBJECTS.ID || type === PROTOCOL.OBJECTS.CFG;

    return (
        <mesh position={position}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial
                color={state === 'ACTIVE' ? '#00ff00' : '#444'}
                wireframe={!isCritical}
            />
        </mesh>
    );
}