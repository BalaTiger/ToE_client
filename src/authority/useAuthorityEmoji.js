import { useCallback, useEffect, useRef, useState } from 'react';
import { EMOJI_LIST } from '../components/ui/emojiData';
import { getPlayerAreaAnchorCenter } from '../utils/dom';

const supported = new Set(EMOJI_LIST);

export function useAuthorityEmoji({ session, view, offline, toDisplaySeat, report }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiButtonPos, setEmojiButtonPos] = useState({ top: 70, right: 20 });
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const sequence = useRef(0), active = useRef(false);
  const socket = offline ? null : session?.socket;
  const enabled = !!socket && Number.isInteger(view.viewerSeat) && view.viewerSeat >= 0;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, [session]);
  useEffect(() => {
    if (!socket) return;
    const receive = message => {
      if (!message || Object.keys(message).some(key => !['fromSeat', 'emoji'].includes(key))
        || !supported.has(message.emoji) || !Number.isInteger(message.fromSeat)
        || !view.players.some(player => player.seat === message.fromSeat)) return;
      const displaySeat = toDisplaySeat(message.fromSeat);
      if (displaySeat === null || displaySeat === undefined) return;
      const origin = getPlayerAreaAnchorCenter(displaySeat);
      const width = window.innerWidth, height = window.innerHeight;
      const flight = { id: `emoji:${++sequence.current}`, emoji: message.emoji,
        startX: origin?.x ?? width * 0.15, startY: origin?.y ?? height * 0.85,
        endX: width * 0.5, endY: height * 0.45, arcHeight: height * 0.1, durationMs: 900 };
      setFlyingEmojis(previous => [...previous.slice(-63), flight]);
    };
    socket.on('emoji', receive);
    return () => socket.off('emoji', receive);
  }, [socket, toDisplaySeat, view.players]);

  const handleEmojiClick = useCallback(emoji => {
    if (!enabled || !supported.has(emoji)) return;
    if (!socket.connected) { report?.(new Error('表情未发送，正在重新连接对局')); return; }
    try {
      socket.timeout(3000).emit('emojiSend', { emoji }, (failure, result) => {
        if (!active.current) return;
        if (failure) report?.(new Error('表情发送超时，请稍后再试'));
        else if (!result?.ok) report?.(new Error(result?.error === 'rate_limited' ? '表情发送过于频繁，请稍后再试' : result?.error || '表情未发送'));
      });
    } catch (failure) { report?.(failure); }
  }, [enabled, socket, report]);
  const onFlyingEmojiDone = useCallback(id => setFlyingEmojis(previous => previous.filter(item => item.id !== id)), []);
  return { enabled, showEmojiPicker: enabled && showEmojiPicker, setShowEmojiPicker, emojiButtonPos, setEmojiButtonPos,
    handleEmojiClick, flyingEmojis: socket ? flyingEmojis : [], onFlyingEmojiDone };
}
