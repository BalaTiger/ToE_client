import React from 'react';

const RINGS = Array.from({ length: 11 }, (_, i) => i);
const MID_RING = Math.floor(RINGS.length / 2);
const SIDE_TUNNEL = {
  width: 240,
  height: 160,
  depthGap: 96,
};

function sideRing(i) {
  const depthOffset = i - MID_RING;
  return {
    w: SIDE_TUNNEL.width,
    h: SIDE_TUNNEL.height,
    clusterX: (i - MID_RING) * 0.8,
    clusterY: (i - MID_RING) * 0.4,
    clusterZ: depthOffset * 1.2,
    depthZ: depthOffset * -SIDE_TUNNEL.depthGap,
  };
}

export function EndlessCorridorTunnelAnim({ exiting }) {
  return (
    <div className={`endlessCorridorOverlay${exiting ? ' ending' : ''}`}>
      <div className="endlessCorridorStage">
        <div className="endlessCorridorCamera">
          <div className="endlessCorridorTunnel">
            {RINGS.map(i => {
              const ring = sideRing(i);
              const opacity = 0.24 + (i / (RINGS.length - 1)) * 0.58;
              const stroke = 2.6 - (i / (RINGS.length - 1)) * 1.2;
              return (
                <div
                  key={i}
                  className="endlessCorridorRing"
                  style={{
                    '--cluster-x': `${ring.clusterX}px`,
                    '--cluster-y': `${ring.clusterY}px`,
                    '--cluster-z': `${ring.clusterZ}px`,
                    '--depth-z': `${ring.depthZ}px`,
                    '--ring-w': `${ring.w}px`,
                    '--ring-h': `${ring.h}px`,
                    '--ring-opacity': opacity,
                    '--ring-stroke': `${stroke}px`,
                  }}
                >
                  <span className="endlessCorridorLine endlessCorridorLineTop" />
                  <span className="endlessCorridorLine endlessCorridorLineMid" />
                  <span className="endlessCorridorLine endlessCorridorLineBottom" />
                  <span className="endlessCorridorLine endlessCorridorLineLeft" />
                  <span className="endlessCorridorLine endlessCorridorLineRight" />
                </div>
              );
            })}
            <div className="endlessCorridorEntranceRays">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className="endlessCorridorCore" />
        <div className="endlessCorridorFlash" />
      </div>
    </div>
  );
}
