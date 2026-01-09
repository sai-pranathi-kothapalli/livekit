'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useSessionContext, useSessionMessages } from '@livekit/components-react';
import type { ReceivedMessage } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { ChatTranscript } from '@/components/app/chat-transcript';
import { PreConnectMessage } from '@/components/app/preconnect-message';
import { TileLayout } from '@/components/app/tile-layout';
import {
  AgentControlBar,
  type ControlBarControls,
} from '@/components/livekit/agent-control-bar/agent-control-bar';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../livekit/scroll-area/scroll-area';
import { RoomStatusBar } from '@/components/app/room-status-bar';

const MotionBottom = motion.create('div');

const BOTTOM_VIEW_MOTION_PROPS = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    delay: 0.5,
    ease: 'easeOut',
  },
};

interface FadeProps {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

export function Fade({ top = false, bottom = false, className }: FadeProps) {
  return (
    <div
      className={cn(
        'from-background pointer-events-none h-4 bg-linear-to-b to-transparent',
        top && 'bg-linear-to-b',
        bottom && 'bg-linear-to-t',
        className
      )}
    />
  );
}

interface SessionViewProps {
  appConfig: AppConfig;
}

// Extended message type with streaming info
interface StreamingMessage {
  id: string;
  timestamp: number;
  from: any;
  message: string;
  isStreaming: boolean;
  displayedLength: number;
  messageOrigin: 'local' | 'remote';
  type?: string;
  editTimestamp?: number;
}

export const SessionView = ({
  appConfig,
  ...props
}: React.ComponentProps<'section'> & SessionViewProps) => {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  
  // Manual transcript messages state (for messages not picked up by useSessionMessages)
  const [manualTranscriptMessages, setManualTranscriptMessages] = useState<ReceivedMessage[]>([]);
  
  // Merge regular messages with manually captured transcript messages, removing duplicates
  // Deduplicate based on message content, timestamp, and origin (within 2 seconds)
  // Also handles partial vs full message duplicates (removes partial, keeps full)
  const allMessages = React.useMemo(() => {
    const combined = [...messages, ...manualTranscriptMessages];
    
    // Group messages by origin and timestamp bucket
    const messageGroups = new Map<string, ReceivedMessage[]>();
    
    combined.forEach(msg => {
      const timestampBucket = Math.floor((msg.timestamp || 0) / 2000);
      const origin = msg.from?.isLocal ? 'local' : 'remote';
      const groupKey = `${timestampBucket}-${origin}`;
      
      if (!messageGroups.has(groupKey)) {
        messageGroups.set(groupKey, []);
      }
      messageGroups.get(groupKey)!.push(msg);
    });
    
    // Within each group, remove duplicates and keep longest message (full vs partial)
    const result: ReceivedMessage[] = [];
    
    messageGroups.forEach((groupMessages) => {
      // Sort by length (longest first) to prioritize full messages
      groupMessages.sort((a, b) => (b.message?.length || 0) - (a.message?.length || 0));
      
      const seen: string[] = [];
      
      for (const msg of groupMessages) {
        const messageContent = msg.message || '';
        
        // Check if this message is a duplicate or prefix of an already seen message
        let isDuplicate = false;
        
        for (const seenContent of seen) {
          // Exact match
          if (seenContent === messageContent) {
            isDuplicate = true;
            break;
          }
          
          // Check if current message is a prefix of seen message (current is shorter)
          // Since we sorted longest first, seenContent should be longer
          if (seenContent.startsWith(messageContent)) {
            // Current is shorter prefix - skip it, keep the longer seen one
            isDuplicate = true;
            break;
          }
          
          // Check if seen message is a prefix of current (current is longer)
          if (messageContent.startsWith(seenContent)) {
            // Seen is shorter prefix - remove it and keep current (longer)
            const indexToRemove = result.findIndex(m => m.message === seenContent);
            if (indexToRemove >= 0) {
              result.splice(indexToRemove, 1);
            }
            const seenIndex = seen.indexOf(seenContent);
            if (seenIndex >= 0) {
              seen.splice(seenIndex, 1);
            }
            // Continue to add current message
            break;
          }
        }
        
        if (!isDuplicate) {
          seen.push(messageContent);
          result.push(msg);
        }
      }
    });
    
    // Sort result by timestamp to maintain order
    result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    return result;
  }, [messages, manualTranscriptMessages]);
  
  // DEBUG: Log all messages to verify reception
  useEffect(() => {
    console.log('📨 MESSAGES DEBUG:', {
      totalMessages: allMessages.length,
      regularMessages: messages.length,
      manualMessages: manualTranscriptMessages.length,
    });
    
    // Log FULL message details
    if (allMessages.length > 0) {
      console.log('📋 FULL MESSAGE DETAILS:', JSON.stringify(allMessages[0], null, 2));
      console.log('📋 Message content:', allMessages[0].message);
      console.log('📋 Message from:', allMessages[0].from);
      console.log('📋 Message type:', allMessages[0].type);
      console.log('📋 Is local?', allMessages[0].from?.isLocal);
      console.log('📋 From identity:', allMessages[0].from?.identity);
    }
    
    const agentMessages = allMessages.filter(msg => !msg.from?.isLocal);
    console.log('🤖 AGENT MESSAGES COUNT:', agentMessages.length);
    if (agentMessages.length > 0) {
      console.log('🤖 AGENT MESSAGES FULL:', agentMessages);
      agentMessages.forEach((msg, idx) => {
        console.log(`🤖 Agent Message ${idx}:`, {
          id: msg.id,
          message: msg.message,
          from: msg.from,
          type: msg.type,
          timestamp: msg.timestamp,
        });
      });
    }
  }, [allMessages, messages, manualTranscriptMessages]);
  
  const [chatOpen, setChatOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  
  // Auto-open chat panel when agent messages arrive (from allMessages or streamingMessages)
  useEffect(() => {
    const hasAgentMessages = allMessages.some(msg => !msg.from?.isLocal);
    const hasStreamingAgentMessages = streamingMessages.some(msg => msg.messageOrigin === 'remote');
    if ((hasAgentMessages || hasStreamingAgentMessages) && !chatOpen) {
      console.log('🔓 Auto-opening chat panel due to agent messages');
      setChatOpen(true);
    }
  }, [allMessages, streamingMessages, chatOpen]);
  const streamingIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const completedMessageIds = useRef<Set<string>>(new Set());
  const streamingMessageIds = useRef<Set<string>>(new Set());
  
  // Check if there are pending agent messages (not yet displayed)
  const hasPendingAgentMessage = allMessages.some(msg => {
    const isAgentMessage = !msg.from?.isLocal;
    return isAgentMessage && !completedMessageIds.current.has(msg.id);
  });

  // Expose room info via console command
  useEffect(() => {
    const room = session.room;
    
    if (room) {
      // Create a function to get room info that can be called from console
      (window as any).getRoomInfo = () => {
        if (!room) {
          console.log('❌ No room connected');
          return;
        }
        
        console.log('🏠 ROOM INFORMATION:');
        console.log('   Room Name:', room.name);
        console.log('   Room SID:', (room as any).sid || 'N/A');
        console.log('   Room State:', room.state);
        
        // Log local participant
        if (room.localParticipant) {
          console.log('   Local Participant:', {
            identity: room.localParticipant.identity,
            sid: room.localParticipant.sid,
            name: room.localParticipant.name,
          });
        }
        
        // Log remote participants
        const remoteParticipants = Array.from(room.remoteParticipants.values());
        if (remoteParticipants.length > 0) {
          console.log('   Remote Participants:', remoteParticipants.map(p => ({
            identity: p.identity,
            sid: p.sid,
            name: p.name,
            isAgent: p.isAgent,
          })));
        } else {
          console.log('   Remote Participants: None');
        }
        
        return {
          roomName: room.name,
          roomState: room.state,
          localParticipant: room.localParticipant ? {
            identity: room.localParticipant.identity,
            sid: room.localParticipant.sid,
            name: room.localParticipant.name,
          } : null,
          remoteParticipants: remoteParticipants.map(p => ({
            identity: p.identity,
            sid: p.sid,
            name: p.name,
            isAgent: p.isAgent,
          })),
        };
      };
      
      // Log participant join/leave events to console
      const handleParticipantConnected = (participant: any) => {
        console.log('✅ PARTICIPANT JOINED:', {
          identity: participant.identity,
          sid: participant.sid,
          name: participant.name,
          isAgent: participant.isAgent,
          room: room.name,
        });
      };
      
      const handleParticipantDisconnected = (participant: any, reason?: string) => {
        console.log('❌ PARTICIPANT LEFT:', {
          identity: participant.identity,
          sid: participant.sid,
          name: participant.name,
          reason: reason,
          room: room.name,
        });
      };
      
      // Listen to data channel messages manually to debug
      // NOTE: Since useSessionMessages already picks up agentTranscript messages automatically,
      // we only need to manually add messages that aren't picked up (fallback only)
      const handleDataReceived = (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => {
        try {
          const decoder = new TextDecoder();
          const text = decoder.decode(payload);
          const data = JSON.parse(text);
          
          console.log('📡 DATA CHANNEL MESSAGE RECEIVED:', {
            topic,
            participant: participant?.identity,
            participantSid: participant?.sid,
            isLocal: participant?.isLocal,
            kind,
            rawText: text,
            parsedData: data,
          });
          
          // Check if this is our transcript message (has "message" field and from remote participant)
          if (data.message && typeof data.message === 'string' && participant && !participant.isLocal) {
            console.log('✅ TRANSCRIPT MESSAGE DETECTED:', data.message.substring(0, 50));
            
            // IMPORTANT: Since useSessionMessages already picks up agentTranscript messages,
            // we should NOT add them manually to avoid duplicates
            // Only add if the message is NOT already in messages (check via setState callback)
            setManualTranscriptMessages(prev => {
              // Also check current messages state to avoid duplicates
              // If message already exists in either messages or manualTranscriptMessages, skip
              const currentAllMessages = [...messages, ...prev];
              const alreadyExists = currentAllMessages.some(m => 
                m.message === data.message && 
                !m.from?.isLocal &&
                Math.abs(m.timestamp - Date.now()) < 3000 // Within 3 seconds
              );
              
              if (alreadyExists) {
                console.log('⚠️ Message already exists in messages or manual messages, skipping (avoiding duplicate)');
                return prev;
              }
              
              // Create a ReceivedMessage object - use participant directly for 'from' field
              const transcriptMessage: ReceivedMessage = {
                id: `transcript-${Date.now()}-${Math.random()}`,
                timestamp: Date.now(),
                message: data.message,
                from: participant, // Use the participant object directly
                type: 'chatMessage',
              };
              
              // Check for duplicates within manual messages
              const existsInManual = prev.some(m => 
                m.message === data.message && 
                Math.abs(m.timestamp - transcriptMessage.timestamp) < 1000
              );
              if (existsInManual) {
                console.log('⚠️ Duplicate transcript message in manual messages, skipping');
                return prev;
              }
              
              console.log('✅ Adding transcript message to manual messages state (fallback)');
              return [...prev, transcriptMessage];
            });
          }
        } catch (e) {
          console.log('📡 DATA CHANNEL MESSAGE (non-JSON):', {
            topic,
            participant: participant?.identity,
            payload: new TextDecoder().decode(payload).substring(0, 100),
            error: e,
          });
        }
      };
      
      console.log('🔧 Registering event handlers...');
      room.on('participantConnected', handleParticipantConnected);
      room.on('participantDisconnected', handleParticipantDisconnected);
      room.on('dataReceived', handleDataReceived);
      console.log('✅ Data channel handler registered');
      
      return () => {
        room.off('participantConnected', handleParticipantConnected);
        room.off('participantDisconnected', handleParticipantDisconnected);
        room.off('dataReceived', handleDataReceived);
        delete (window as any).getRoomInfo;
      };
    }
    
    return () => {
      delete (window as any).getRoomInfo;
    };
  }, [session.room, messages]); // Include messages in dependencies so handler has latest value

  const controls: ControlBarControls = {
    leave: true,
    microphone: true,
    chat: appConfig.supportsChatInput,
    camera: appConfig.supportsVideoInput,
    screenShare: appConfig.supportsVideoInput,
  };

  // Handle streaming text display for agent messages
  useEffect(() => {
    console.log('🔄 Processing messages for display:', allMessages.length);
    allMessages.forEach((msg, idx) => {
      const isAgentMessage = !msg.from?.isLocal;
      console.log(`📝 Processing message ${idx}:`, {
        id: msg.id,
        isAgentMessage,
        message: msg.message?.substring(0, 50),
        fromLocal: msg.from?.isLocal,
        alreadyCompleted: completedMessageIds.current.has(msg.id),
        alreadyStreaming: streamingMessageIds.current.has(msg.id),
      });
      
      if (isAgentMessage) {

        // If message is already completed, check if it needs updating (might be partial)
        if (completedMessageIds.current.has(msg.id)) {
          setStreamingMessages(prev => {
            const existing = prev.find(m => m.id === msg.id);
            // If it exists and is fully displayed with correct length, keep it
            if (existing && existing.message === msg.message && existing.displayedLength === msg.message.length && !existing.isStreaming) {
              return prev;
            }
            // Otherwise, update it (might be a new longer version replacing partial)
            return prev.map(m => 
              m.id === msg.id 
                ? { ...m, message: msg.message, isStreaming: false, displayedLength: msg.message.length }
                : m
            );
          });
          return;
        }
        
        // Check if we're already streaming this message
        if (streamingMessageIds.current.has(msg.id)) {
          // But check if this is a longer version (full replacing partial)
          setStreamingMessages(prev => {
            const existing = prev.find(m => m.id === msg.id);
            if (existing && msg.message.length > existing.message.length && msg.message.startsWith(existing.message)) {
              // This is a longer version, replace it
              console.log('🔄 Replacing partial streaming message with full version');
              // Clean up existing streaming interval
              if (streamingIntervals.current.has(existing.id)) {
                const interval = streamingIntervals.current.get(existing.id);
                if (interval) clearInterval(interval);
                streamingIntervals.current.delete(existing.id);
              }
              streamingMessageIds.current.delete(msg.id); // Remove from streaming set so it can restart
              return prev.filter(m => m.id !== msg.id); // Remove partial, will be added below
            }
            return prev;
          });
          // If we removed it above, continue to streaming logic below
          if (!streamingMessageIds.current.has(msg.id)) {
            // Continue to streaming logic below - don't return
          } else {
            return; // Already streaming same message
          }
        }
        
        // Start streaming this message (with proper initialization)
        const fullText = msg.message;
        const totalLength = fullText.length;
        
        // Smart Hybrid: Get initial display length based on message characteristics
        const getInitialDisplayLength = (text: string): number => {
          const firstWord = text.split(/\s+/)[0] || '';
          const firstWordLength = firstWord.length;
          
          // For very short messages (≤5 chars), show everything immediately
          if (text.length <= 5) {
            return text.length;
          }
          
          // For short messages (≤20 chars), show first word
          if (text.length <= 20) {
            return firstWordLength;
          }
          
          // For long messages, show first word but cap at 15 chars to avoid super long words
          return Math.min(firstWordLength, 15);
        };
        
        const initialDisplayLength = getInitialDisplayLength(fullText);
        
        // Determine streaming mode: character-by-character for short, word-by-word for long
        const useCharacterStreaming = totalLength < 20;
        
        // Use the calculated initial length (ensure it's valid)
        let currentDisplayLength = Math.max(1, Math.min(initialDisplayLength, totalLength));
        
        // Create initial streaming message (start with partial text visible)
        const streamingMsg: StreamingMessage = {
          id: msg.id,
          timestamp: msg.timestamp,
          from: msg.from,
          message: fullText,
          isStreaming: true,
          displayedLength: currentDisplayLength,
          messageOrigin: 'remote',
          type: msg.type,
          editTimestamp: (msg as any).editTimestamp,
        };
        
        streamingMessageIds.current.add(msg.id);
        console.log('➕ Adding message to streamingMessages:', {
          id: msg.id,
          message: fullText.substring(0, 50),
          initialDisplayedLength: currentDisplayLength,
          totalLength,
          useCharacterStreaming,
        });
        setStreamingMessages(prev => {
          // Check for duplicates by ID
          if (prev.some(m => m.id === msg.id)) {
            console.log('⚠️ Message already in streamingMessages (by ID), skipping');
            return prev;
          }
          
          // Check for duplicates by content and timestamp (within 2 seconds)
          // Also handle partial vs full message duplicates (remove partial, keep full)
          const existingMsg = prev.find(m => 
            m.messageOrigin === 'remote' &&
            Math.abs(m.timestamp - msg.timestamp) < 2000
          );
          
          if (existingMsg) {
            const existingText = existingMsg.message || '';
            
            // Exact match
            if (existingText === fullText) {
              console.log('⚠️ Message already in streamingMessages (exact match), skipping');
              return prev;
            }
            
            // Check if one is a prefix of another (partial vs full message)
            if (fullText.startsWith(existingText)) {
              // New message is longer (full), replace old partial one
              console.log('🔄 Replacing partial message with full message (removing partial)');
              // Remove the partial message and its streaming interval if it exists
              if (streamingIntervals.current.has(existingMsg.id)) {
                const interval = streamingIntervals.current.get(existingMsg.id);
                if (interval) clearInterval(interval);
                streamingIntervals.current.delete(existingMsg.id);
                streamingMessageIds.current.delete(existingMsg.id);
              }
              return prev
                .filter(m => m.id !== existingMsg.id) // Remove partial message
                .concat([streamingMsg]); // Add full message
            } else if (existingText.startsWith(fullText)) {
              // Existing message is longer (full), skip new partial one
              console.log('⚠️ Message already in streamingMessages (existing is full, new is partial), skipping');
              return prev;
            }
          }
          
          console.log('✅ Adding new message to streamingMessages, new count:', prev.length + 1);
          return [...prev, streamingMsg];
        });
        
        // Stream progressively (character-by-character for short, word-by-word for long)
        console.log(`🎬 Starting streaming interval for message ${msg.id} (${useCharacterStreaming ? 'character' : 'word'} mode)`);
        const streamInterval = setInterval(() => {
          // Read current displayedLength from state to ensure we're always in sync
          setStreamingMessages(prev => {
            const existingMsg = prev.find(m => m.id === msg.id);
            if (!existingMsg) {
              // Message was removed, cleanup interval
              clearInterval(streamInterval);
              streamingIntervals.current.delete(msg.id);
              streamingMessageIds.current.delete(msg.id);
              return prev;
            }
            
            const currentLength = existingMsg.displayedLength || currentDisplayLength;
            
            if (currentLength < totalLength) {
              let newLength = currentLength;
              
              if (useCharacterStreaming) {
                // Character streaming: add 2-3 characters at a time
                const charsToAdd = Math.min(3, totalLength - currentLength);
                newLength = currentLength + charsToAdd;
              } else {
                // Word streaming: add 1-2 words at a time
                const words = fullText.split(/(\s+)/).filter(w => w.length > 0);
                const displayedText = fullText.slice(0, currentLength);
                const displayedWords = displayedText.split(/(\s+)/).filter(w => w.length > 0);
                
                // Find next word boundary
                let nextWordIndex = displayedWords.length;
                const wordsToAdd = Math.min(2, words.length - nextWordIndex);
                
                for (let i = 0; i < wordsToAdd && nextWordIndex < words.length; i++) {
                  nextWordIndex++;
                }
                
                // Calculate new length by joining words up to nextWordIndex
                const newDisplayedText = words.slice(0, nextWordIndex).join('');
                newLength = newDisplayedText.length;
              }
              
              // Clamp to total length
              newLength = Math.min(newLength, totalLength);
              
              console.log(`📊 Streaming update for ${msg.id}:`, {
                currentLength,
                newLength,
                totalLength,
                progress: `${Math.round((newLength / totalLength) * 100)}%`,
                displayedText: fullText.substring(0, newLength),
              });
              
              // Auto-scroll to bottom while streaming
              if (scrollAreaRef.current) {
                scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
              }
              
              // Update the message with new length
              return prev.map(m => 
                m.id === msg.id 
                  ? { ...m, displayedLength: newLength }
                  : m
              );
            } else {
              // Streaming complete
              console.log(`✅ Streaming complete for ${msg.id}`);
              clearInterval(streamInterval);
              streamingIntervals.current.delete(msg.id);
              streamingMessageIds.current.delete(msg.id);
              completedMessageIds.current.add(msg.id);
              
              return prev.map(m =>
                m.id === msg.id
                  ? { ...m, isStreaming: false, displayedLength: fullText.length }
                  : m
              );
            }
          });
        }, useCharacterStreaming ? 30 : 50); // Faster for character streaming (30ms), slower for word streaming (50ms)
        
        streamingIntervals.current.set(msg.id, streamInterval);
      } else {
        // User messages - COMMENTED OUT: User speech transcription is not accurate
        // We're hiding user speech transcription for now until accuracy improves
        // setStreamingMessages(prev => {
        //   if (prev.some(m => m.id === msg.id)) return prev;
        //   return [...prev, {
        //     id: msg.id,
        //     timestamp: msg.timestamp,
        //     from: msg.from,
        //     message: msg.message,
        //     isStreaming: false,
        //     displayedLength: msg.message.length,
        //     messageOrigin: 'local',
        //     type: msg.type,
        //     editTimestamp: (msg as any).editTimestamp,
        //   }];
        // });
      }
    });
    
    // Cleanup intervals on unmount
    return () => {
      streamingIntervals.current.forEach(interval => clearInterval(interval));
    };
  }, [allMessages]);

  useEffect(() => {
    console.log('📺 Streaming messages state:', {
      count: streamingMessages.length,
      messages: streamingMessages.map(m => ({
        id: m.id,
        message: m.message?.substring(0, 50),
        isStreaming: m.isStreaming,
        displayedLength: m.displayedLength,
        messageOrigin: m.messageOrigin,
      })),
    });
    
    // Log what ChatTranscript will receive
    console.log('📤 ChatTranscript will receive:', {
      hidden: !chatOpen,
      chatOpen,
      messagesCount: streamingMessages.length,
      messages: streamingMessages,
    });
    
    const lastMessage = streamingMessages.at(-1);
    const lastMessageIsLocal = lastMessage?.messageOrigin === 'local';

    if (scrollAreaRef.current && lastMessageIsLocal) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [streamingMessages, chatOpen]);

  return (
    <section className="bg-background relative z-10 h-full w-full overflow-hidden" {...props}>
      {/* Room Status Bar */}
      <RoomStatusBar />
      {/* Chat Transcript */}
      <div
        className={cn(
          'fixed inset-0 grid grid-cols-1 grid-rows-1',
          !chatOpen && 'pointer-events-none'
        )}
      >
        <Fade top className="absolute inset-x-4 top-0 h-40" />
        <ScrollArea ref={scrollAreaRef} className="px-4 pt-40 pb-[150px] md:px-6 md:pb-[200px]">
          <ChatTranscript
            hidden={!chatOpen}
            // Filter out user speech (local messages) - only show agent messages (remote)
            // User speech transcription is not accurate, so we're hiding it for now
            messages={streamingMessages.filter(msg => msg.messageOrigin !== 'local') as any}
            className="mx-auto max-w-2xl space-y-3 transition-opacity duration-300 ease-out"
          />
          {hasPendingAgentMessage && !chatOpen && (
            <div className="mx-auto max-w-2xl px-4 pt-2">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-current" />
                <span>Arjun is speaking...</span>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Tile Layout */}
      <TileLayout chatOpen={chatOpen} />

      {/* Bottom */}
      <MotionBottom
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="fixed inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {appConfig.isPreConnectBufferEnabled && (
          <PreConnectMessage messages={messages} className="pb-4" />
        )}
        <div className="bg-background relative mx-auto max-w-2xl pb-3 md:pb-12">
          <Fade bottom className="absolute inset-x-0 top-0 h-4 -translate-y-full" />
          <AgentControlBar
            controls={controls}
            isConnected={session.isConnected}
            onDisconnect={session.end}
            onChatOpenChange={setChatOpen}
          />
        </div>
      </MotionBottom>
    </section>
  );
};
