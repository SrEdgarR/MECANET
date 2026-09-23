import React from 'react';
import Snowfall from 'react-snowfall';
import useIsChristmas from '../hooks/useIsChristmas';

const ChristmasSnow = () => {
    const isChristmas = useIsChristmas();

    if (!isChristmas) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9999,
                pointerEvents: 'none', // Critical: allows clicks to pass through
            }}
        >
            <Snowfall
                snowflakeCount={150}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
};

export default ChristmasSnow;
