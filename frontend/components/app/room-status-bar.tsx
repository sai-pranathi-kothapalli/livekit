'use client';

import { useSessionContext } from '@livekit/components-react';
import { useEffect, useState } from 'react';

export function RoomStatusBar() {
  const session = useSessionContext();
  const room = session.room;
  const [info, setInfo] = useState<{
    roomSid: string | null;
    localSid: string | null;
    remoteSids: Array<{ identity: string; sid: string; name: string | null }>;
  }>({ roomSid: null, localSid: null, remoteSids: [] });

  useEffect(() => {
    if (!room) {
      setInfo({ roomSid: null, localSid: null, remoteSids: [] });
      return;
    }

    const update = () => {
      setInfo({
        roomSid: (room as any).sid || null,
        localSid: room.localParticipant?.sid || null,
        remoteSids: Array.from(room.remoteParticipants.values()).map((p) => ({
          identity: p.identity,
          sid: p.sid,
          name: p.name || null,
        })),
      });
    };

    update();

    room.on('participantConnected', update);
    room.on('participantDisconnected', update);

    return () => {
      room.off('participantConnected', update);
      room.off('participantDisconnected', update);
    };
  }, [room]);

  if (!info.roomSid) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 py-2">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Room:</span>
            <span className="text-foreground font-semibold">{info.roomSid}</span>
          </div>
          {info.localSid && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Local:</span>
              <span className="text-foreground">{info.localSid}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {info.remoteSids.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Participants:</span>
              <div className="flex items-center gap-2">
                {info.remoteSids.map((p, idx) => (
                  <span key={p.sid} className="text-foreground">
                    {p.name || p.identity} ({p.sid})
                    {idx < info.remoteSids.length - 1 && <span className="mx-1">•</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

