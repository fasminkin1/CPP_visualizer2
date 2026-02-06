import React from 'react';
import { useSimulationStore, OBJ_TYPES, MSG_TYPES, DIR_TYPES } from '../store/simulationStore';

export default function TrafficLog() {
    const trafficLog = useSimulationStore(s => s.trafficLog);

    // Helpers to decode constants
    const getObjName = (val) => Object.keys(OBJ_TYPES).find(k => OBJ_TYPES[k] === val) || val;
    const getTypeName = (val) => Object.keys(MSG_TYPES).find(k => MSG_TYPES[k] === val) || val;
    const getDirName = (val) => val === DIR_TYPES.TO_SLAVE ? 'M->S' : 'S->M';

    return (
        <div style={{
            flex: 1,
            overflow: 'auto',
            background: '#1e1e1e', // Dark terminal-like background
            color: '#eee',
            fontFamily: 'Consolas, monospace',
            fontSize: '0.85rem',
            padding: '10px'
        }}>
            <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Traffic Log</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#2d2d2d' }}>
                    <tr style={{ textAlign: 'left' }}>
                        <th style={{ padding: '4px' }}>Time</th>
                        <th style={{ padding: '4px' }}>Dir</th>
                        <th style={{ padding: '4px' }}>NA:LA</th>
                        <th style={{ padding: '4px' }}>Object</th>
                        <th style={{ padding: '4px' }}>Type</th>
                        <th style={{ padding: '4px' }}>Payload</th>
                    </tr>
                </thead>
                <tbody>
                    {trafficLog.map((entry) => {
                        const rowColor = entry.type === MSG_TYPES.REQ ? '#fff59d' : '#a5d6a7'; // Yellowish for REQ, Greenish for ACK
                        const textColor = '#000'; // Contrast text for colored rows? Or colored text on dark.

                        // Let's keep dark theme:
                        // REQ: Yellow text
                        // ACK: Green text
                        const typeColor = entry.type === MSG_TYPES.REQ ? '#ffff00' : '#00e676';

                        return (
                            <tr key={entry.id} style={{ borderBottom: '1px solid #333' }}>
                                <td style={{ padding: '4px', color: '#888' }}>{entry.time.toFixed(3)}s</td>
                                <td style={{ padding: '4px', color: '#4fc3f7' }}>{getDirName(entry.dir)}</td>
                                <td style={{ padding: '4px' }}>{entry.na}:{entry.la}</td>
                                <td style={{ padding: '4px', color: '#e1bee7' }}>{getObjName(entry.obj)}</td>
                                <td style={{ padding: '4px', color: typeColor }}>{getTypeName(entry.type)}</td>
                                <td style={{ padding: '4px', color: '#bdbdbd', wordBreak: 'break-all' }}>
                                    {entry.payload === null ? 'NULL' : JSON.stringify(entry.payload)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
