import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Eye,
  Flame,
  Gavel,
  Lock,
  MessageSquare,
  Mic,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
} from 'lucide-react';
import type {
  FloatingReaction,
  ImposterChatMessage,
  ImposterClueEntry,
  ImposterMatchConfig,
  ImposterParticipant,
  ImposterSecretPlayer,
} from './types';
import {
  BOT_DISCUSSION_LINES,
  findDidYouMeanPlayer,
  generateBotClue,
  generateBotLastStandGuess,
  generateSquadParticipants,
  isCorrectImposterGuess,
  pickSecretPlayer,
} from './imposterEngine';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { soundFX } from '../../utils/audio';

interface ImposterArenaProps {
  config: ImposterMatchConfig;
  onExitArena: () => void;
}

type ImposterStage =
  | 'opening-countdown'
  | 'role-reveal'
  | 'clue-turn'
  | 'discussion'
  | 'intermission'
  | 'voting'
  | 'vote-reveal'
  | 'verdict-suspense'
  | 'imposter-last-stand'
  | 'game-over';

const CLUE_TURN_SECONDS = 60;
const DISCUSSION_SECONDS = 30;

const REACTION_PILLS = [
  'SUS 👀',
  'Hmm 🤔',
  'I get it 💡',
  'Cap 🧢',
  'Cold 🥶',
] as const;

export const ImposterArena: React.FC<ImposterArenaProps> = ({
  config,
  onExitArena,
}) => {
  const {
    isMultiplayer,
    partyMembers,
    myPlayerId,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
  } = useGameSync('football-imposter');

  const [secretPlayer, setSecretPlayer] = useState<ImposterSecretPlayer>(() => {
    if (gameInitData?.assignedRole?.secretPlayer) {
      return gameInitData.assignedRole.secretPlayer;
    }
    return pickSecretPlayer(config.category);
  });
  const [usedSecretIds, setUsedSecretIds] = useState<string[]>([]);
  const [participants, setParticipants] = useState<ImposterParticipant[]>(() => {
    if (isMultiplayer && partyMembers && partyMembers.length > 1) {
      const colors = [
        { bg: 'bg-[#ccff00]', text: 'text-black', avatarText: 'text-[#ccff00]', badge: 'border-[#ccff00] text-[#ccff00] bg-[#ccff00]/20' },
        { bg: 'bg-[#00f0ff]', text: 'text-black', avatarText: 'text-[#00f0ff]', badge: 'border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/20' },
        { bg: 'bg-[#ff0055]', text: 'text-white', avatarText: 'text-[#ff0055]', badge: 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/20' },
        { bg: 'bg-[#a855f7]', text: 'text-white', avatarText: 'text-[#a855f7]', badge: 'border-[#a855f7] text-[#a855f7] bg-[#a855f7]/20' },
      ];
      return partyMembers.map((m, idx) => {
        const color = colors[idx % colors.length];
        const isUser = m.id === myPlayerId;
        const isImposter = isUser ? Boolean(gameInitData?.assignedRole?.isImposter) : false;
        return {
          id: m.id,
          name: m.name,
          initials: m.name.slice(0, 2).toUpperCase(),
          avatarBg: color.bg,
          avatarText: color.avatarText,
          reactionBadgeClass: color.badge,
          isUser,
          isImposter,
          title: isUser ? 'Squad Captain' : 'Squad Scout',
        };
      });
    }
    return generateSquadParticipants(config.botCount, config.rolePreference);
  });

  const [stage, setStage] = useState<ImposterStage>('opening-countdown');
  const [openingCountdown, setOpeningCountdown] = useState<number>(3);
  const [currentRound, setCurrentRound] = useState<1 | 2>(1);
  const [activeSpeakerIdx, setActiveSpeakerIdx] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(CLUE_TURN_SECONDS);

  // Hold-to-Peek HUD state (Top Right)
  const [isPeeking, setIsPeeking] = useState<boolean>(false);

  // Clues & Global Discussion Chat
  const [clues, setClues] = useState<ImposterClueEntry[]>([]);
  const [clueInput, setClueInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ImposterChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');

  // Floating Quick Reactions
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Voting & Last-Stand Redemption state
  const [selectedVoteTargetId, setSelectedVoteTargetId] = useState<string | null>(null);
  const [votesByVoterId, setVotesByVoterId] = useState<Record<string, string>>({});
  const [eliminatedPlayerId, setEliminatedPlayerId] = useState<string | null>(null);

  // Discussion early skip voting (players vote to proceed to decision screen early)
  const [discussionSkipVotes, setDiscussionSkipVotes] = useState<string[]>([]);

  // Intermission voting (vote out imposter vs continue to round 2)
  const [intermissionVotes, setIntermissionVotes] = useState<Record<string, 'vote-out' | 'continue'>>({});
  const [intermissionWinner, setIntermissionWinner] = useState<'vote-out' | 'continue' | null>(null);

  const [imposterGuessInput, setImposterGuessInput] = useState<string>('');
  const [didYouMeanSuggestion, setDidYouMeanSuggestion] = useState<string | null>(null);
  const [imposterFinalGuessText, setImposterFinalGuessText] = useState<string>('');
  const [imposterStolenWin, setImposterStolenWin] = useState<boolean>(false);

  const usedCluesSetRef = useRef<Set<string>>(new Set());
  const clueInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastStandInputRef = useRef<HTMLInputElement>(null);
  const leftStripSlotRef = useRef<number>(0);
  const rightStripSlotRef = useRef<number>(0);

  const userParticipant = participants.find((p) => p.isUser) || participants[0];
  const imposterParticipant =
    participants.find((p) => p.isImposter) || participants[participants.length - 1];
  const activeSpeaker = participants[activeSpeakerIdx] || participants[0];

  const eliminatedParticipant = participants.find(
    (p) => p.id === eliminatedPlayerId
  );
  const imposterCaught = eliminatedParticipant?.isImposter ?? false;
  const isTimerActive = stage === 'clue-turn' || stage === 'discussion';

  // Highlight any participant's name appearing in text using their distinct avatarText color
  const renderTextWithPlayerColors = (text: string) => {
    if (!text || participants.length === 0) return text;

    const sortedParticipants = [...participants].sort(
      (a, b) => b.name.length - a.name.length
    );
    const escapedNames = sortedParticipants.map((p) =>
      p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const regex = new RegExp(`(${escapedNames.join('|')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;

    return parts.map((part, index) => {
      const matched = participants.find(
        (p) => p.name.toLowerCase() === part.toLowerCase()
      );
      if (matched) {
        return (
          <span key={index} className={`font-bold ${matched.avatarText}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Auto-scroll global chat to bottom whenever a new message arrives
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Suspenseful 3 - 2 - 1 Opening Countdown before revealing secret player / imposter role
  useEffect(() => {
    if (stage !== 'opening-countdown') return;
    if (openingCountdown <= 1) {
      soundFX.playClick(900);
      const timer = window.setTimeout(() => {
        soundFX.playPhaseShift();
        setStage('role-reveal');
      }, 900);
      return () => window.clearTimeout(timer);
    }
    soundFX.playClick(600 + (3 - openingCountdown) * 150);
    const timer = window.setTimeout(() => {
      setOpeningCountdown((prev) => prev - 1);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [stage, openingCountdown]);

  // Trigger a floating reaction pill spread out in a vertical strip on Left or Right margin
  const triggerReaction = (label: string, participant: ImposterParticipant, broadcast = true) => {
    soundFX.playReactionPop();
    const id = `react_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const spawnOnLeft = Math.random() < 0.5;
    const STRIP_SLOTS = [14, 25, 36, 47, 58, 69, 80];

    let leftPercent: number;
    let topPercent: number;

    if (spawnOnLeft) {
      // Left strip gutter: 1.5% - 6% from left edge
      leftPercent = 1.5 + Math.floor(Math.random() * 5);
      const slot = STRIP_SLOTS[leftStripSlotRef.current % STRIP_SLOTS.length];
      leftStripSlotRef.current += 1;
      topPercent = Math.min(84, Math.max(12, slot + (Math.floor(Math.random() * 6) - 3)));
    } else {
      // Right strip gutter: 84% - 89% from left edge
      leftPercent = 84 + Math.floor(Math.random() * 6);
      const slot = STRIP_SLOTS[rightStripSlotRef.current % STRIP_SLOTS.length];
      rightStripSlotRef.current += 1;
      topPercent = Math.min(84, Math.max(12, slot + (Math.floor(Math.random() * 6) - 3)));
    }

    setFloatingReactions((prev) => [
      ...prev,
      {
        id,
        label,
        senderName: participant.initials,
        badgeClass: participant.reactionBadgeClass,
        textColorClass: participant.avatarText,
        leftPercent,
        topPercent,
      },
    ]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2600);

    if (broadcast && isMultiplayer && participant.isUser) {
      sendAction('imposter_reaction', { label, participantId: participant.id });
    }
  };

  // Synchronize incoming multiplayer events
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent.event === 'imposter_chat') {
      const { message } = lastGameEvent.data || {};
      if (message) {
        setChatMessages((prev) => [...prev, message]);
      }
    } else if (lastGameEvent.event === 'imposter_reaction') {
      const { label, participantId } = lastGameEvent.data || {};
      const sender = participants.find((p) => p.id === participantId);
      if (label && sender) {
        triggerReaction(label, sender, false);
      }
    } else if (lastGameEvent.event === 'imposter_clue') {
      const { clueEntry } = lastGameEvent.data || {};
      if (clueEntry) {
        handleSubmitClue(clueEntry.text, false);
      }
    } else if (lastGameEvent.event === 'imposter_skip_vote') {
      const { voterId } = lastGameEvent.data || {};
      if (voterId) {
        setDiscussionSkipVotes((prev) => {
          const updated = prev.includes(voterId) ? prev : [...prev, voterId];
          if (updated.length >= participants.length) {
            handleEndDiscussion();
          }
          return updated;
        });
      }
    } else if (lastGameEvent.event === 'imposter_intermission_vote') {
      const { voterId, choice } = lastGameEvent.data || {};
      if (voterId && choice) {
        setIntermissionVotes((prev) => {
          const updated = { ...prev, [voterId]: choice };
          if (Object.keys(updated).length >= participants.length) {
            const voteOutCount = Object.values(updated).filter((v) => v === 'vote-out').length;
            const continueCount = Object.values(updated).filter((v) => v === 'continue').length;
            setIntermissionWinner(voteOutCount >= continueCount ? 'vote-out' : 'continue');
          }
          return updated;
        });
      }
    } else if (lastGameEvent.event === 'imposter_final_vote') {
      const { voterId, targetId } = lastGameEvent.data || {};
      if (voterId && targetId) {
        setVotesByVoterId((prev) => {
          const updated = { ...prev, [voterId]: targetId };
          if (Object.keys(updated).length >= participants.length) {
            resolveVotingTallies(updated);
          }
          return updated;
        });
      }
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, participants]);

  // Countdown timer for Clue Turn (60s) & Discussion (30s)
  useEffect(() => {
    if (stage !== 'clue-turn' && stage !== 'discussion') return;

    if (secondsLeft <= 0) {
      if (stage === 'clue-turn') {
        handleSubmitClue(
          activeSpeaker.isUser ? clueInput.trim() || 'Big game player' : ''
        );
      } else if (stage === 'discussion') {
        handleEndDiscussion();
      }
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 3 && next > 0) {
          soundFX.playCountdownTick(next <= 1 ? 3 : 2);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, secondsLeft, activeSpeaker, clueInput]);

  // Focus input when it is the User's turn to submit a clue
  useEffect(() => {
    if (stage === 'clue-turn' && activeSpeaker.isUser) {
      window.setTimeout(() => clueInputRef.current?.focus(), 60);
    }
  }, [stage, activeSpeakerIdx, activeSpeaker.isUser]);

  // Focus input or simulate bot guess during 'imposter-last-stand'
  useEffect(() => {
    if (stage !== 'imposter-last-stand') return;

    if (imposterParticipant.isUser) {
      window.setTimeout(() => lastStandInputRef.current?.focus(), 80);
      return;
    }

    // Simulated Bot Imposter attempting last-stand guess (solo mode only)
    if (isMultiplayer) return;

    const timer = window.setTimeout(() => {
      const botAttempt = generateBotLastStandGuess(secretPlayer);
      setImposterFinalGuessText(botAttempt.guessName);
      setImposterStolenWin(botAttempt.isCorrect);
      setStage('game-over');
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, stage, imposterParticipant.isUser, secretPlayer]);

  // Simulated Bot Clue Turn (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'clue-turn' || activeSpeaker.isUser) return;

    const delay = 1900 + Math.floor(Math.random() * 1100);
    const timer = window.setTimeout(() => {
      const botClue = generateBotClue(
        activeSpeaker,
        secretPlayer,
        usedCluesSetRef.current
      );
      usedCluesSetRef.current.add(botClue);
      handleSubmitClue(botClue);

      // Occasionally float a color-matched bot reaction after a clue
      if (Math.random() < 0.6) {
        const otherBots = participants.filter(
          (p) => !p.isUser && p.id !== activeSpeaker.id
        );
        const randomOtherBot =
          otherBots[Math.floor(Math.random() * otherBots.length)];
        const randomPill =
          REACTION_PILLS[Math.floor(Math.random() * REACTION_PILLS.length)];
        if (randomOtherBot) {
          window.setTimeout(
            () => triggerReaction(randomPill, randomOtherBot),
            450
          );
        }
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, stage, activeSpeakerIdx, activeSpeaker, secretPlayer, participants]);

  // Simulated Bot Discussion Chat & Reactions during the 30s Discussion phase
  useEffect(() => {
    if (stage !== 'discussion') return;

    const bots = participants.filter((p) => !p.isUser);
    const t1 = window.setTimeout(() => {
      const b1 = bots[Math.floor(Math.random() * bots.length)];
      if (b1) {
        const msg =
          BOT_DISCUSSION_LINES[
            Math.floor(Math.random() * BOT_DISCUSSION_LINES.length)
          ];
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_1`,
            senderId: b1.id,
            senderName: b1.name,
            senderColorClass: b1.avatarText,
            text: msg,
          },
        ]);
        triggerReaction('SUS 👀', b1);
      }
    }, 1800);

    const t2 = window.setTimeout(() => {
      const b2 = bots[Math.floor(Math.random() * bots.length)];
      if (b2) {
        const suspect =
          participants[Math.floor(Math.random() * participants.length)];
        const line =
          suspect.id === b2.id
            ? 'My clue was spot on if you know ball 💡'
            : `Not gonna lie, ${suspect.name}'s clue sounded mad vague 🤔`;
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_2`,
            senderId: b2.id,
            senderName: b2.name,
            senderColorClass: b2.avatarText,
            text: line,
          },
        ]);
        triggerReaction('Hmm 🤔', b2);
      }
    }, 5200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [stage, currentRound, participants]);

  const handleStartCluePhase = () => {
    soundFX.playPhaseShift();
    setStage('clue-turn');
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setChatMessages([
      {
        id: `sys_r1_${Date.now()}`,
        senderId: 'system',
        senderName: '',
        text: 'ROUND 1',
        isSystem: true,
      },
    ]);
  };

  const handleSubmitClue = (rawText: string, broadcast = true) => {
    soundFX.playLockIn();
    const cleanText = rawText.trim() || 'Top tier baller';
    const newEntry: ImposterClueEntry = {
      id: `clue_${currentRound}_${activeSpeaker.id}_${Date.now()}`,
      participantId: activeSpeaker.id,
      participantName: activeSpeaker.name,
      round: currentRound,
      text: cleanText,
    };

    setClues((prev) => [...prev, newEntry]);
    if (activeSpeaker.isUser) {
      setClueInput('');
    }

    if (broadcast && isMultiplayer && activeSpeaker.isUser) {
      sendAction('imposter_clue', { clueEntry: newEntry });
    }

    // Advance to next speaker or transition to 30s Discussion phase
    if (activeSpeakerIdx + 1 < participants.length) {
      setActiveSpeakerIdx((prev) => prev + 1);
      setSecondsLeft(CLUE_TURN_SECONDS);
    } else {
      setStage('discussion');
      setSecondsLeft(DISCUSSION_SECONDS);
      setDiscussionSkipVotes([]);
      setIntermissionVotes({});
      setIntermissionWinner(null);
    }
  };

  // Staggered bot skip-votes during discussion phase (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'discussion') return;

    // If user has voted to skip to decision, quickly gather remaining bot votes so squad advances
    if (discussionSkipVotes.includes(userParticipant.id)) {
      const remainingBots = participants.filter(
        (p) => !discussionSkipVotes.includes(p.id)
      );
      if (remainingBots.length > 0) {
        const timer = window.setTimeout(() => {
          setDiscussionSkipVotes(participants.map((p) => p.id));
        }, 350);
        return () => window.clearTimeout(timer);
      } else {
        // All participants have voted to proceed! Advance immediately
        const timer = window.setTimeout(() => {
          handleEndDiscussion();
        }, 400);
        return () => window.clearTimeout(timer);
      }
    }

    // While user has not voted yet, simulate occasional bots voting ready over time
    const unvotedBots = participants.filter(
      (p) => !p.isUser && !discussionSkipVotes.includes(p.id)
    );
    if (unvotedBots.length > 0) {
      const delay = 4000 + Math.floor(Math.random() * 4000);
      const timer = window.setTimeout(() => {
        const nextBot = unvotedBots[0];
        setDiscussionSkipVotes((prev) =>
          prev.includes(nextBot.id) ? prev : [...prev, nextBot.id]
        );
      }, delay);
      return () => window.clearTimeout(timer);
    }
  }, [isMultiplayer, stage, discussionSkipVotes, participants, userParticipant.id]);

  // Auto-advance once squad votes in intermission
  useEffect(() => {
    if (stage !== 'intermission' || !intermissionWinner) return;

    const timer = window.setTimeout(() => {
      if (intermissionWinner === 'vote-out') {
        setStage('voting');
      } else {
        handleProceedToRound2();
      }
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [stage, intermissionWinner]);

  const handleUserVoteSkipDiscussion = () => {
    if (!discussionSkipVotes.includes(userParticipant.id)) {
      soundFX.playClick(750);
      setDiscussionSkipVotes((prev) => {
        const updated = [...prev, userParticipant.id];
        if (isMultiplayer && updated.length >= participants.length) {
          handleEndDiscussion();
        }
        return updated;
      });
      if (isMultiplayer) {
        sendAction('imposter_skip_vote', { voterId: userParticipant.id });
      }
    }
  };

  const handleCastIntermissionVote = (choice: 'vote-out' | 'continue') => {
    if (intermissionWinner) return;
    soundFX.playLockIn();

    if (isMultiplayer) {
      setIntermissionVotes((prev) => {
        const nextVotes = { ...prev, [userParticipant.id]: choice };
        if (Object.keys(nextVotes).length >= participants.length) {
          const voteOutCount = Object.values(nextVotes).filter((v) => v === 'vote-out').length;
          const continueCount = Object.values(nextVotes).filter((v) => v === 'continue').length;
          setIntermissionWinner(voteOutCount >= continueCount ? 'vote-out' : 'continue');
        }
        return nextVotes;
      });
      sendAction('imposter_intermission_vote', { voterId: userParticipant.id, choice });
    } else {
      const userVote = { [userParticipant.id]: choice };
      const simulatedVotes: Record<string, 'vote-out' | 'continue'> = { ...userVote };

      for (const bot of participants) {
        if (bot.isUser) continue;
        if (bot.isImposter) {
          // Imposter usually wants round 2 to keep hiding
          simulatedVotes[bot.id] = Math.random() < 0.8 ? 'continue' : 'vote-out';
        } else {
          // Innocents split based on clue confidence
          simulatedVotes[bot.id] = Math.random() < 0.5 ? 'vote-out' : 'continue';
        }
      }

      setIntermissionVotes(simulatedVotes);

      const voteOutCount = Object.values(simulatedVotes).filter((v) => v === 'vote-out').length;
      const continueCount = Object.values(simulatedVotes).filter((v) => v === 'continue').length;
      const winner = voteOutCount >= continueCount ? 'vote-out' : 'continue';
      setIntermissionWinner(winner);
    }
  };

  const handleEndDiscussion = () => {
    if (currentRound === 1 && config.clueRounds === 2) {
      setStage('intermission');
    } else {
      setStage('voting');
    }
  };

  const handleProceedToRound2 = () => {
    soundFX.playPhaseShift();
    setCurrentRound(2);
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setDiscussionSkipVotes([]);
    setIntermissionVotes({});
    setIntermissionWinner(null);
    setStage('clue-turn');
    setChatMessages((prev) => [
      ...prev,
      {
        id: `sys_r2_${Date.now()}`,
        senderId: 'system',
        senderName: '',
        text: 'ROUND 2',
        isSystem: true,
      },
    ]);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    soundFX.playClick(900);
    const newMsg: ImposterChatMessage = {
      id: `chat_${Date.now()}`,
      senderId: userParticipant.id,
      senderName: userParticipant.name,
      senderColorClass: userParticipant.avatarText,
      text: trimmed,
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setChatInput('');
    if (isMultiplayer) {
      sendAction('imposter_chat', { message: newMsg });
    }
  };

  const resolveVotingTallies = (allVotes: Record<string, string>) => {
    const tally: Record<string, number> = {};
    for (const targetId of Object.values(allVotes)) {
      tally[targetId] = (tally[targetId] || 0) + 1;
    }

    let topSuspectId = selectedVoteTargetId || participants[0]?.id;
    let maxVotes = -1;
    for (const [pid, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count;
        topSuspectId = pid;
      }
    }

    setVotesByVoterId(allVotes);
    setEliminatedPlayerId(topSuspectId);
    setStage('vote-reveal');
  };

  const handleLockVote = () => {
    if (!selectedVoteTargetId) return;
    soundFX.playLockIn();

    if (isMultiplayer) {
      setVotesByVoterId((prev) => {
        const nextVotes = { ...prev, [userParticipant.id]: selectedVoteTargetId };
        if (Object.keys(nextVotes).length >= participants.length) {
          resolveVotingTallies(nextVotes);
        }
        return nextVotes;
      });
      sendAction('imposter_final_vote', { voterId: userParticipant.id, targetId: selectedVoteTargetId });
    } else {
      const allVotes: Record<string, string> = {
        [userParticipant.id]: selectedVoteTargetId,
      };

      for (const bot of participants) {
        if (bot.isUser) continue;

        if (bot.isImposter) {
          const innocents = participants.filter((p) => p.id !== bot.id);
          const target = innocents[Math.floor(Math.random() * innocents.length)];
          allVotes[bot.id] = target.id;
        } else {
          const spotsImposter = Math.random() < 0.62;
          if (spotsImposter) {
            allVotes[bot.id] = imposterParticipant.id;
          } else {
            const others = participants.filter((p) => p.id !== bot.id);
            const target = others[Math.floor(Math.random() * others.length)];
            allVotes[bot.id] = target.id;
          }
        }
      }

      resolveVotingTallies(allVotes);
    }
  };

  const handleTriggerVerdictSuspense = () => {
    soundFX.playHammer();
    setStage('verdict-suspense');
    const caught =
      participants.find((p) => p.id === eliminatedPlayerId)?.isImposter ?? false;

    window.setTimeout(() => {
      if (caught) {
        soundFX.playSuccess();
        setStage('imposter-last-stand');
      } else {
        soundFX.playVoltBuzz();
        setStage('game-over');
      }
    }, 2200);
  };

  const handleImposterLastStandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = imposterGuessInput.trim();
    if (!trimmed) return;

    // If we have not yet suggested a spelling correction for this input, check if one applies
    const check = findDidYouMeanPlayer(trimmed, secretPlayer);
    if (
      check.hasCorrection &&
      check.suggestedName &&
      didYouMeanSuggestion !== check.suggestedName
    ) {
      soundFX.playClick(750);
      setImposterGuessInput(check.suggestedName);
      setDidYouMeanSuggestion(check.suggestedName);
      return;
    }

    // Confirmed or exact -> evaluate final guess
    const won = isCorrectImposterGuess(trimmed, secretPlayer);
    setImposterFinalGuessText(trimmed);
    setImposterStolenWin(won);
    setDidYouMeanSuggestion(null);
    if (won) {
      soundFX.playVictoryFanfare();
    } else {
      soundFX.playSuccess();
    }
    setStage('game-over');
  };

  const handlePlayAgain = () => {
    soundFX.playLobbyReady();
    const nextUsed = [...usedSecretIds, secretPlayer.id];
    setUsedSecretIds(nextUsed);
    const nextSecret = pickSecretPlayer(config.category, nextUsed);
    setSecretPlayer(nextSecret);
    setParticipants(
      generateSquadParticipants(config.botCount, config.rolePreference)
    );
    usedCluesSetRef.current = new Set();
    setClues([]);
    setClueInput('');
    setChatMessages([]);
    setChatInput('');
    setSelectedVoteTargetId(null);
    setVotesByVoterId({});
    setEliminatedPlayerId(null);
    setImposterGuessInput('');
    setDidYouMeanSuggestion(null);
    setImposterFinalGuessText('');
    setImposterStolenWin(false);
    setDiscussionSkipVotes([]);
    setIntermissionVotes({});
    setIntermissionWinner(null);
    setCurrentRound(1);
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setOpeningCountdown(3);
    setStage('opening-countdown');
  };

  const crewWonMatch = imposterCaught && !imposterStolenWin;

  return (
    <div className="min-h-screen w-full bg-[#07090e] text-white flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Ambient Crimson / Tactical Glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at 50% 15%, rgba(255,42,95,0.18), transparent 55%), radial-gradient(circle at 15% 85%, rgba(56,189,248,0.10), transparent 55%)',
        }}
      />

      {/* FLOATING COLOR-MATCHED REACTION BADGES SPREAD OUT IN VERTICAL STRIPS ALONG LEFT & RIGHT MARGINS */}
      <style>{`
        @keyframes imposterReactionFloat {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.85);
          }
          15% {
            opacity: 1;
            transform: translateY(0px) scale(1.05);
          }
          30% {
            transform: translateY(-4px) scale(1.0);
          }
          80% {
            opacity: 1;
            transform: translateY(-10px) scale(1.0);
          }
          100% {
            opacity: 0;
            transform: translateY(-24px) scale(0.92);
          }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            style={{
              left: `${r.leftPercent}%`,
              top: `${r.topPercent}%`,
              animation: 'imposterReactionFloat 2.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
            className="absolute flex flex-col items-center"
          >
            <div
              className={`px-4 py-2 rounded-full border-2 backdrop-blur-md flex items-center gap-2.5 shadow-2xl ${r.badgeClass}`}
            >
              <span className="font-display text-base font-black text-white">
                {r.label}
              </span>
              <span
                className={`text-[10px] font-mono font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/50 ${r.textColorClass}`}
              >
                {r.senderName}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* TOP BROADCAST HUD + HOLD TO PEEK BUTTON */}
      <header className="relative z-30 max-w-[1400px] w-full mx-auto flex items-center justify-between gap-3 bg-[#10141d]/90 border border-white/10 rounded-2xl px-5 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => {
              if (isMultiplayer) sendGameLeave();
              onExitArena();
            }}
            className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="Exit to Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-black uppercase tracking-wider text-white">
                FOOTBALL IMPOSTER
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-widest bg-[#ff2a5f]/15 text-[#ff2a5f] border border-[#ff2a5f]/30">
                {config.category.toUpperCase()}
              </span>
              {config.lobbyMode === 'sandbox' && (
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-widest bg-[#ccff00]/15 text-[#ccff00] border border-[#ccff00]/30">
                  DEV SANDBOX
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-neutral-400">
              ROUND {currentRound} OF {config.clueRounds} • {participants.length} SQUAD MEMBERS
            </p>
          </div>
        </div>

        {/* Right Side: Top Header Timer + HOLD TO PEEK Button */}
        <div className="flex items-center gap-3 relative">
          {isTimerActive && (
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all ${
                secondsLeft <= 10
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                  : 'bg-[#ff2a5f]/15 border-[#ff2a5f]/50 text-white'
              }`}
            >
              <Clock className="w-4 h-4 text-[#ff2a5f]" />
              <span className="font-display text-xl font-black tracking-wider tabular-nums">
                {secondsLeft}s
              </span>
            </div>
          )}

          {/* HOLD TO PEEK BUTTON (Active only while held down) */}
          <button
            type="button"
            onMouseDown={() => setIsPeeking(true)}
            onMouseUp={() => setIsPeeking(false)}
            onMouseLeave={() => setIsPeeking(false)}
            onTouchStart={(e) => {
              e.preventDefault();
              setIsPeeking(true);
            }}
            onTouchEnd={() => setIsPeeking(false)}
            onTouchCancel={() => setIsPeeking(false)}
            className={`px-4 py-2.5 rounded-xl border font-display text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer select-none ${
              isPeeking
                ? 'bg-[#ff2a5f] text-white border-[#ff2a5f] shadow-[0_0_25px_rgba(255,42,95,0.5)] scale-[0.98]'
                : 'bg-white/[0.05] hover:bg-white/[0.09] text-neutral-200 border-white/15'
            }`}
          >
            {isPeeking ? (
              <Eye className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4 text-[#ff2a5f]" />
            )}
            <span>HOLD TO PEEK</span>
          </button>

          {/* HOLD-TO-PEEK SECRET POPOVER */}
          {isPeeking && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-[#0e121b] border border-white/20 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.95)] z-50 animate-fade-in pointer-events-none">
              {userParticipant.isImposter ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#ff2a5f]/20 border border-[#ff2a5f]/50 text-[10px] font-mono font-black uppercase tracking-widest text-[#ff2a5f] animate-pulse">
                      YOU ARE THE IMPOSTER
                    </span>
                    <ShieldAlert className="w-4 h-4 text-[#ff2a5f]" />
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#ff2a5f] block mb-1">
                      {config.imposterClueEnabled ? 'VAGUE HINT:' : 'CLUE STATUS:'}
                    </span>
                    <p className="text-xs font-semibold text-neutral-200 leading-relaxed">
                      {config.imposterClueEnabled
                        ? secretPlayer.imposterVagueClue
                        : 'Clues disabled for Imposters in this lobby.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-mono font-black uppercase tracking-widest text-emerald-300">
                      CREW SECRET TARGET
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>

                  <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-xl p-3">
                    <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/15 flex items-center justify-center p-2 shrink-0">
                      <img
                        src={secretPlayer.crestUrl}
                        alt={secretPlayer.primaryClub}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg font-black uppercase tracking-wide text-white truncate">
                        {secretPlayer.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <img
                          src={secretPlayer.flagUrl}
                          alt={secretPlayer.nationality}
                          className="w-4 h-3 object-cover rounded-sm"
                        />
                        <span className="text-[10px] font-mono text-neutral-300 truncate">
                          {secretPlayer.primaryClub}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-[#ccff00]">
                          {secretPlayer.position}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* MAIN CONTENT STAGE */}
      <main className="relative z-10 max-w-[1400px] w-full mx-auto my-auto py-4 flex-1 flex flex-col justify-center">
        {/* PHASE 0: SUSPENSEFUL 3 - 2 - 1 ZOOM-PULSE OPENING COUNTDOWN */}
        {stage === 'opening-countdown' && (
          <div className="max-w-lg w-full mx-auto rounded-[32px] bg-[#10141d]/95 border border-[#ff2a5f]/40 p-10 text-center shadow-[0_32px_90px_rgba(0,0,0,0.92)] flex flex-col items-center justify-center min-h-[380px]">
            <style>{`
              @keyframes imposterNumberZoom {
                0% {
                  transform: scale(0.3);
                  opacity: 0;
                  filter: blur(6px);
                }
                55% {
                  transform: scale(1.22);
                  opacity: 1;
                  filter: blur(0px);
                }
                100% {
                  transform: scale(1.0);
                  opacity: 0.92;
                  filter: blur(0px);
                }
              }
            `}</style>
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#ff2a5f]/15 border border-[#ff2a5f]/40 mb-6 animate-pulse">
              <ShieldAlert className="w-4 h-4 text-[#ff2a5f]" />
              <span className="text-[11px] font-mono font-black uppercase tracking-[0.25em] text-[#ff2a5f]">
                ASSIGNING SECRET IDENTITIES
              </span>
            </div>

            <div className="h-36 flex items-center justify-center my-2">
              <span
                key={openingCountdown}
                style={{
                  animation: 'imposterNumberZoom 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                }}
                className="font-display text-8xl sm:text-9xl font-black text-white tabular-nums drop-shadow-[0_0_45px_rgba(255,42,95,0.85)]"
              >
                {openingCountdown}
              </span>
            </div>

            <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              KEEP YOUR SCREEN PRIVATE
            </h2>
            <p className="text-xs font-mono uppercase tracking-widest text-neutral-400 mt-2">
              ONE IMPOSTER IS HIDING IN THE SQUAD...
            </p>
          </div>
        )}

        {/* PHASE 1: OPENING SECRET IDENTITY REVEAL */}
        {stage === 'role-reveal' && (
          <div className="max-w-xl w-full mx-auto rounded-[30px] bg-[#10141d]/95 border border-white/15 p-8 text-center shadow-[0_32px_90px_rgba(0,0,0,0.92)] flex flex-col items-center animate-fade-in">
            {userParticipant.isImposter ? (
              <>
                <div className="w-20 h-20 rounded-3xl bg-[#ff2a5f]/20 border-2 border-[#ff2a5f] flex items-center justify-center mb-4 shadow-[0_0_45px_rgba(255,42,95,0.5)] animate-pulse">
                  <ShieldAlert className="w-10 h-10 text-[#ff2a5f]" />
                </div>

                <span className="px-3.5 py-1 rounded-full bg-[#ff2a5f]/20 border border-[#ff2a5f]/45 text-[11px] font-mono font-black uppercase tracking-[0.22em] text-[#ff2a5f] mb-2">
                  CLASSIFIED ROLE REVEAL
                </span>

                <h1 className="font-display text-4xl sm:text-5xl font-black uppercase tracking-tight text-[#ff2a5f]">
                  YOU ARE THE IMPOSTER
                </h1>

                <p className="text-sm text-neutral-300 mt-2 max-w-md">
                  Every other squad member sees the secret footballer. Blend in with your clue and survive the tribunal vote.
                </p>

                <div className="w-full rounded-2xl bg-[#ff2a5f]/10 border border-[#ff2a5f]/35 p-5 my-6 text-left">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-4 h-4 text-[#ff2a5f]" />
                    <span className="text-[11px] font-mono font-black uppercase tracking-widest text-[#ff2a5f]">
                      {config.imposterClueEnabled
                        ? 'SINGLE VAGUE CLUE'
                        : 'IMPOSTER CLUES DISABLED'}
                    </span>
                  </div>
                  <p className="text-base font-bold text-white leading-relaxed">
                    {config.imposterClueEnabled
                      ? secretPlayer.imposterVagueClue
                      : 'No clue provided. Listen closely to the Crew clues to bluff your way through!'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[11px] font-mono font-black uppercase tracking-[0.22em] text-emerald-300 mb-3">
                  <ShieldCheck className="w-4 h-4" />
                  YOU ARE IN THE CREW
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-5">
                  SECRET SQUAD FOOTBALLER
                </h1>

                <div className="w-full rounded-3xl bg-gradient-to-b from-[#171e2e] to-[#0d111a] border border-white/15 p-6 mb-6 flex flex-col items-center shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
                  <div className="w-24 h-24 rounded-2xl bg-white/[0.05] border border-white/15 flex items-center justify-center p-4 mb-4 shadow-lg">
                    <img
                      src={secretPlayer.crestUrl}
                      alt={secretPlayer.primaryClub}
                      className="w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)]"
                    />
                  </div>

                  <h2 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-wide text-white">
                    {secretPlayer.name}
                  </h2>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10">
                      <img
                        src={secretPlayer.flagUrl}
                        alt={secretPlayer.nationality}
                        className="w-4 h-3 object-cover rounded-sm"
                      />
                      <span className="text-xs font-mono font-bold uppercase text-neutral-200">
                        {secretPlayer.nationality}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10">
                      <img
                        src={secretPlayer.crestUrl}
                        alt={secretPlayer.primaryClub}
                        className="w-4 h-4 object-contain"
                      />
                      <span className="text-xs font-mono font-bold uppercase text-neutral-200">
                        {secretPlayer.primaryClub}
                      </span>
                    </div>

                    <span className="px-3 py-1.5 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/35 text-xs font-mono font-black text-[#ccff00]">
                      {secretPlayer.position}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-neutral-400 mb-6 max-w-md">
                  Give a subtle clue that proves to the Crew you know the player without giving the name away to the Imposter!
                </p>
              </>
            )}

            <button
              type="button"
              onClick={handleStartCluePhase}
              className="w-full py-4 rounded-xl bg-[#ff2a5f] hover:bg-[#ff4270] text-white font-display text-sm font-black uppercase tracking-widest transition-all shadow-[0_10px_28px_rgba(255,42,95,0.35)] cursor-pointer"
            >
              ENTER CLUE PHASE
            </button>
          </div>
        )}

        {/* PHASE 2: TURN-BY-TURN CLUES & BIGGER DISCUSSION HUD */}
        {(stage === 'clue-turn' || stage === 'discussion') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* LEFT SIDEBAR: BIGGER PLAYER AVATAR BUBBLES + HIGH-VISIBILITY SPEECH BUBBLES */}
            <div className="lg:col-span-5 rounded-3xl bg-[#10141d]/95 border border-white/12 p-5 flex flex-col justify-between gap-4 shadow-[0_24px_60px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <Mic className="w-4 h-4 text-[#ff2a5f]" />
                  <span className="font-display text-sm font-black uppercase tracking-wider text-white">
                    SQUAD CLUE FEED
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-md bg-white/5 text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-300">
                  ROUND {currentRound}
                </span>
              </div>

              <div className="space-y-4 my-auto">
                {participants.map((p, idx) => {
                  const isSpeaking =
                    stage === 'clue-turn' && idx === activeSpeakerIdx;
                  const playerRoundClue = clues.find(
                    (c) => c.participantId === p.id && c.round === currentRound
                  );
                  const prevRoundClue =
                    currentRound === 2
                      ? clues.find((c) => c.participantId === p.id && c.round === 1)
                      : undefined;

                  return (
                    <div
                      key={p.id}
                      className="flex items-start gap-3.5"
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <div
                          className={`w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                            p.avatarBg
                          } ${
                            isSpeaking
                              ? 'ring-2 ring-[#ff2a5f] shadow-[0_0_28px_rgba(255,42,95,0.65)] scale-105'
                              : ''
                          }`}
                        >
                          <span
                            className={`font-display text-sm font-black ${p.avatarText}`}
                          >
                            {p.initials}
                          </span>
                          <span className="text-[8px] font-mono uppercase text-neutral-300">
                            {p.title}
                          </span>
                        </div>

                        {isSpeaking && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ff2a5f] border-2 border-[#10141d] animate-ping" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`font-display text-sm font-black uppercase tracking-wide truncate ${p.avatarText}`}
                          >
                            {p.name}
                          </span>
                          {isSpeaking && (
                            <span className="px-2 py-0.5 rounded bg-[#ff2a5f]/20 text-[#ff2a5f] text-[9px] font-mono font-black uppercase tracking-widest">
                              SPEAKING NOW
                            </span>
                          )}
                        </div>

                        {playerRoundClue ? (
                          <div className="relative rounded-2xl rounded-tl-sm bg-white/[0.08] border border-white/20 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                            <p className="font-display text-base sm:text-lg font-extrabold text-white leading-snug">
                              "{playerRoundClue.text}"
                            </p>
                            {prevRoundClue && (
                              <p className="text-xs font-mono text-neutral-400 mt-1">
                                R1: "{prevRoundClue.text}"
                              </p>
                            )}
                          </div>
                        ) : isSpeaking ? (
                          <div className="rounded-2xl rounded-tl-sm bg-[#ff2a5f]/12 border border-[#ff2a5f]/40 px-4 py-3">
                            <p className="text-xs font-mono font-bold text-[#ff2a5f] animate-pulse">
                              {p.isUser
                                ? 'Waiting for you to lock in your clue...'
                                : 'Crafting a tactical clue...'}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl rounded-tl-sm bg-white/[0.025] border border-white/10 px-4 py-3">
                            <p className="text-xs font-mono text-neutral-500">
                              Waiting for turn...
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT MAIN STAGE: ACTIVE CLUE INPUT + LARGER GLOBAL LOCKER ROOM CHAT */}
            <div className="lg:col-span-7 flex flex-col gap-4 justify-between">
              {/* Top Active Turn / Discussion Banner */}
              <div className="rounded-3xl bg-[#10141d]/95 border border-white/12 p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.8)]">
                {stage === 'clue-turn' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-[#ff2a5f] block">
                          ROUND {currentRound} CLUE SUBMISSION
                        </span>
                        <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mt-0.5">
                          {activeSpeaker.isUser ? (
                            'YOUR TURN TO DROP A CLUE'
                          ) : (
                            <>
                              <span className={activeSpeaker.avatarText}>
                                {activeSpeaker.name}
                              </span>{' '}
                              IS ON THE MIC
                            </>
                          )}
                        </h2>
                      </div>
                    </div>

                    {activeSpeaker.isUser ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (clueInput.trim()) {
                            handleSubmitClue(clueInput);
                          }
                        }}
                        className="flex flex-col sm:flex-row gap-3"
                      >
                        <input
                          ref={clueInputRef}
                          type="text"
                          maxLength={48}
                          value={clueInput}
                          onChange={(e) => setClueInput(e.target.value)}
                          placeholder="Type a short, subtle football clue..."
                          className="flex-1 px-4 py-4 rounded-xl bg-black/60 border border-white/15 focus:border-[#ff2a5f] focus:outline-none text-base font-semibold text-white placeholder:text-neutral-500"
                        />
                        <button
                          type="submit"
                          disabled={!clueInput.trim()}
                          className="px-7 py-4 rounded-xl bg-[#ff2a5f] hover:bg-[#ff4270] disabled:opacity-40 disabled:pointer-events-none text-white font-display text-sm font-black uppercase tracking-widest transition-all shadow-[0_8px_24px_rgba(255,42,95,0.3)] cursor-pointer shrink-0"
                        >
                          LOCK CLUE
                        </button>
                      </form>
                    ) : (
                      <div className="px-4 py-4 rounded-xl bg-black/45 border border-white/10 flex items-center justify-between">
                        <span className="text-sm font-mono text-neutral-300">
                          <span className={`font-bold ${activeSpeaker.avatarText}`}>
                            {activeSpeaker.name}
                          </span>{' '}
                          is locking in their clue...
                        </span>
                        <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#ff2a5f] animate-pulse">
                          LIVE TURN
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 30-SECOND DISCUSSION INTERVAL HEADER WITH VOTING SYSTEM */
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff2a5f]/15 border border-[#ff2a5f]/35 mb-1.5">
                          <Flame className="w-3.5 h-3.5 text-[#ff2a5f]" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#ff2a5f]">
                            30s DEBATE & REACTION INTERVAL
                          </span>
                        </div>
                        <h2 className="font-display text-2xl font-black uppercase tracking-tight text-white">
                          DEBATE THE CLUES ({secondsLeft}s LEFT)
                        </h2>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          Question suspicious clues in locker room chat or vote to advance early!
                        </p>
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={handleUserVoteSkipDiscussion}
                          disabled={discussionSkipVotes.includes(userParticipant.id)}
                          className={`px-6 py-3.5 rounded-xl text-white font-display text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-[0_8px_24px_rgba(255,42,95,0.3)] ${
                            discussionSkipVotes.includes(userParticipant.id)
                              ? 'bg-emerald-600/80 border border-emerald-400/50 cursor-default'
                              : 'bg-[#ff2a5f] hover:bg-[#ff4270]'
                          }`}
                        >
                          <span>
                            {discussionSkipVotes.includes(userParticipant.id)
                              ? discussionSkipVotes.length === participants.length
                                ? 'ALL READY • ADVANCING...'
                                : 'VOTED READY • WAITING SQUAD'
                              : currentRound === 1 && config.clueRounds === 2
                              ? 'VOTE TO PROCEED TO DECISION'
                              : 'VOTE TO PROCEED TO VOTE'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </button>

                        {/* NOTIFICATION-STYLE VOTE COUNT BUBBLE */}
                        <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full border-2 border-white bg-[#ff2a5f] text-white flex items-center justify-center font-display text-xs font-black shadow-lg">
                          {discussionSkipVotes.length}/{participants.length}
                        </div>
                      </div>
                    </div>

                    {/* VOTED READY AVATAR PILLS ROW */}
                    {discussionSkipVotes.length > 0 && (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono uppercase text-neutral-400">
                          VOTED TO ADVANCE ({discussionSkipVotes.length}/{participants.length}):
                        </span>
                        {discussionSkipVotes.map((voterId) => {
                          const p = participants.find((part) => part.id === voterId);
                          if (!p) return null;
                          return (
                            <span
                              key={p.id}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-display font-black border ${p.reactionBadgeClass}`}
                            >
                              {p.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* BIGGER GLOBAL LOCKER ROOM CHAT BOX (Auto-scrolls on new messages, subtle Round dividers) */}
              <div className="flex-1 rounded-3xl bg-[#10141d]/95 border border-white/12 p-5 flex flex-col justify-between shadow-[0_24px_60px_rgba(0,0,0,0.8)] min-h-[340px] sm:min-h-[380px]">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-400" />
                    <span className="font-display text-sm font-black uppercase tracking-wider text-white">
                      GLOBAL LOCKER ROOM CHAT
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                    LIVE FEED
                  </span>
                </div>

                <div
                  ref={chatScrollRef}
                  className="space-y-2.5 h-[220px] sm:h-[250px] overflow-y-auto pr-1.5"
                >
                  {chatMessages.map((m) =>
                    m.isSystem ? (
                      <div key={m.id} className="flex items-center gap-3 py-1.5">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-neutral-500">
                          {m.text}
                        </span>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                    ) : (
                      <div
                        key={m.id}
                        className="px-4 py-2.5 rounded-2xl text-sm bg-black/50 border border-white/10 text-neutral-100"
                      >
                        <span
                          className={`font-display font-black uppercase mr-2 ${
                            m.senderColorClass || 'text-sky-400'
                          }`}
                        >
                          {m.senderName}:
                        </span>
                        <span className="text-neutral-100">{renderTextWithPlayerColors(m.text)}</span>
                      </div>
                    )
                  )}
                </div>

                <form onSubmit={handleSendChat} className="flex items-center gap-2.5 mt-3 pt-2 border-t border-white/10">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Send a message to the locker room..."
                    className="flex-1 px-4 py-3 rounded-xl bg-black/60 border border-white/15 focus:border-sky-400 focus:outline-none text-sm text-white placeholder:text-neutral-500"
                  />
                  <button
                    type="submit"
                    className="px-5 py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-white text-xs font-display font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    SEND
                  </button>
                </form>
              </div>

              {/* BOTTOM QUICK-ACTION REACTION PILLS BAR */}
              <div className="rounded-2xl bg-[#10141d]/95 border border-white/12 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                  QUICK REACTIONS:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {REACTION_PILLS.map((pill) => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => triggerReaction(pill, userParticipant)}
                      className="px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-[#ccff00]/20 border border-white/15 hover:border-[#ccff00]/50 text-xs font-display font-black text-white transition-all active:scale-95 cursor-pointer"
                    >
                      {pill}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 3: INTERMISSION AFTER ROUND 1 (SQUAD DECISION VOTING) */}
        {stage === 'intermission' && (
          <div className="max-w-2xl w-full mx-auto rounded-[28px] bg-[#10141d]/95 border border-white/12 p-7 sm:p-8 text-center shadow-[0_32px_90px_rgba(0,0,0,0.9)]">
            <div className="w-16 h-16 rounded-2xl bg-[#ff2a5f]/15 border border-[#ff2a5f]/40 flex items-center justify-center mx-auto mb-4">
              <Gavel className="w-8 h-8 text-[#ff2a5f]" />
            </div>

            <span className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-[#ff2a5f]">
              ROUND 1 INTERMISSION • SQUAD VOTE
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mt-1">
              VOTE OUT IMPOSTER OR PLAY ROUND 2?
            </h2>
            <p className="text-sm text-neutral-400 mt-2 mb-6">
              Does the squad already have enough evidence to convict, or do you want a second round of clues first?
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-left mb-6">
              {/* OPTION 1: VOTE OUT IMPOSTER NOW */}
              {(() => {
                const votersForVoteOut = Object.entries(intermissionVotes)
                  .filter(([, v]) => v === 'vote-out')
                  .map(([voterId]) => participants.find((p) => p.id === voterId))
                  .filter(Boolean) as ImposterParticipant[];
                const voteCount = votersForVoteOut.length;
                const isSelected = intermissionVotes[userParticipant.id] === 'vote-out';
                const isWinner = intermissionWinner === 'vote-out';

                return (
                  <button
                    key="vote-out"
                    type="button"
                    disabled={!!intermissionWinner}
                    onClick={() => handleCastIntermissionVote('vote-out')}
                    className={`relative p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 cursor-pointer text-left ${
                      isWinner
                        ? 'bg-[#ff2a5f]/20 border-[#ff2a5f] ring-2 ring-[#ff2a5f] shadow-[0_0_35px_rgba(255,42,95,0.45)]'
                        : isSelected
                        ? 'bg-[#ff2a5f]/15 border-[#ff2a5f]'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    {/* NOTIFICATION-STYLE VOTE COUNT BUBBLE */}
                    <div
                      className={`absolute -top-3.5 -right-3.5 w-11 h-11 rounded-full border-2 flex items-center justify-center font-display text-lg font-black tabular-nums shadow-xl ${
                        voteCount > 0
                          ? 'bg-[#ff2a5f] border-white text-white shadow-[0_0_25px_rgba(255,42,95,0.75)] scale-105'
                          : 'bg-[#151a26] border-white/20 text-neutral-400'
                      }`}
                    >
                      {voteCount}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#ff2a5f]">
                          OPTION 1
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full bg-[#ff2a5f]/25 text-[#ff2a5f] text-[9px] font-mono font-black uppercase tracking-wider border border-[#ff2a5f]/40">
                            YOUR VOTE
                          </span>
                        )}
                        {isWinner && (
                          <span className="px-2 py-0.5 rounded-full bg-[#ff2a5f] text-white text-[9px] font-mono font-black uppercase tracking-wider animate-pulse">
                            DECISION WON
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-lg font-black uppercase text-white leading-tight">
                        VOTE OUT IMPOSTER NOW
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                        Skip round 2 clues and proceed straight to the Tribunal voting screen to convict the imposter.
                      </p>
                    </div>

                    {/* VOTED BY AVATAR PILLS ROW */}
                    {votersForVoteOut.length > 0 && (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 mr-1">
                          VOTED BY:
                        </span>
                        {votersForVoteOut.map((voter) => (
                          <span
                            key={voter.id}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-display font-black border ${voter.reactionBadgeClass}`}
                          >
                            {voter.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })()}

              {/* OPTION 2: PROCEED TO ROUND 2 CLUES */}
              {(() => {
                const votersForContinue = Object.entries(intermissionVotes)
                  .filter(([, v]) => v === 'continue')
                  .map(([voterId]) => participants.find((p) => p.id === voterId))
                  .filter(Boolean) as ImposterParticipant[];
                const voteCount = votersForContinue.length;
                const isSelected = intermissionVotes[userParticipant.id] === 'continue';
                const isWinner = intermissionWinner === 'continue';

                return (
                  <button
                    key="continue"
                    type="button"
                    disabled={!!intermissionWinner}
                    onClick={() => handleCastIntermissionVote('continue')}
                    className={`relative p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 cursor-pointer text-left ${
                      isWinner
                        ? 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400 shadow-[0_0_35px_rgba(56,189,248,0.45)]'
                        : isSelected
                        ? 'bg-sky-500/15 border-sky-400'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    {/* NOTIFICATION-STYLE VOTE COUNT BUBBLE */}
                    <div
                      className={`absolute -top-3.5 -right-3.5 w-11 h-11 rounded-full border-2 flex items-center justify-center font-display text-lg font-black tabular-nums shadow-xl ${
                        voteCount > 0
                          ? 'bg-sky-500 border-white text-white shadow-[0_0_25px_rgba(56,189,248,0.75)] scale-105'
                          : 'bg-[#151a26] border-white/20 text-neutral-400'
                      }`}
                    >
                      {voteCount}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-sky-400">
                          OPTION 2
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full bg-sky-400/25 text-sky-300 text-[9px] font-mono font-black uppercase tracking-wider border border-sky-400/40">
                            YOUR VOTE
                          </span>
                        )}
                        {isWinner && (
                          <span className="px-2 py-0.5 rounded-full bg-sky-500 text-white text-[9px] font-mono font-black uppercase tracking-wider animate-pulse">
                            DECISION WON
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-lg font-black uppercase text-white leading-tight">
                        PROCEED TO ROUND 2
                      </h3>
                      <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                        Need more information. Hear one additional tactical clue from each player before voting.
                      </p>
                    </div>

                    {/* VOTED BY AVATAR PILLS ROW */}
                    {votersForContinue.length > 0 && (
                      <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono uppercase text-neutral-400 mr-1">
                          VOTED BY:
                        </span>
                        {votersForContinue.map((voter) => (
                          <span
                            key={voter.id}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-display font-black border ${voter.reactionBadgeClass}`}
                          >
                            {voter.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })()}
            </div>

            {intermissionWinner && (
              <div className="flex items-center justify-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (intermissionWinner === 'vote-out') {
                      setStage('voting');
                    } else {
                      handleProceedToRound2();
                    }
                  }}
                  className="px-8 py-3.5 rounded-xl bg-white text-black font-display text-xs font-black uppercase tracking-widest hover:bg-neutral-200 transition-all shadow-[0_8px_24px_rgba(255,255,255,0.25)] flex items-center gap-2 cursor-pointer"
                >
                  <span>
                    {intermissionWinner === 'vote-out'
                      ? 'PROCEED TO TRIBUNAL NOW'
                      : 'PROCEED TO ROUND 2 NOW'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* PHASE 4: VOTING & DRAMATIC VOTE REVEAL (Notification-style Vote Count Bubble) */}
        {(stage === 'voting' || stage === 'vote-reveal') && (
          <div className="rounded-[28px] bg-[#10141d]/95 border border-white/12 p-6 sm:p-7 shadow-[0_32px_90px_rgba(0,0,0,0.9)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-6">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-[#ff2a5f]">
                  {stage === 'voting'
                    ? 'TRIBUNAL VOTING PHASE • NO TIME LIMIT'
                    : 'ALL VOTES LOCKED • TRIBUNAL TALLY'}
                </span>
                <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                  {stage === 'voting' ? (
                    'SELECT A PLAYER TO EJECT'
                  ) : (
                    <>
                      <span className={eliminatedParticipant?.avatarText}>
                        {eliminatedParticipant?.name}
                      </span>{' '}
                      RECEIVED THE MOST VOTES
                    </>
                  )}
                </h2>
              </div>

              {stage === 'voting' ? (
                <button
                  type="button"
                  disabled={!selectedVoteTargetId}
                  onClick={handleLockVote}
                  className="px-7 py-4 rounded-xl bg-[#ff2a5f] hover:bg-[#ff4270] disabled:opacity-40 disabled:pointer-events-none text-white font-display text-sm font-black uppercase tracking-widest transition-all shadow-[0_10px_28px_rgba(255,42,95,0.35)] cursor-pointer"
                >
                  LOCK IN VOTE
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleTriggerVerdictSuspense}
                  className="px-7 py-4 rounded-xl bg-[#ff2a5f] hover:bg-[#ff4270] text-white font-display text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-[0_10px_28px_rgba(255,42,95,0.4)] animate-pulse cursor-pointer"
                >
                  <span>REVEAL TRUE IDENTITY</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
              {participants.map((p) => {
                const playerClues = clues.filter((c) => c.participantId === p.id);
                const isSelected = selectedVoteTargetId === p.id;
                const votersForThisPlayer = Object.entries(votesByVoterId)
                  .filter(([, targetId]) => targetId === p.id)
                  .map(([voterId]) =>
                    participants.find((part) => part.id === voterId)
                  )
                  .filter(Boolean) as ImposterParticipant[];

                const voteCount = votersForThisPlayer.length;
                const isEliminated =
                  stage === 'vote-reveal' && eliminatedPlayerId === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={stage !== 'voting'}
                    onClick={() => setSelectedVoteTargetId(p.id)}
                    className={`relative p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-4 cursor-pointer ${
                      isEliminated
                        ? 'bg-[#ff2a5f]/20 border-[#ff2a5f] ring-2 ring-[#ff2a5f] shadow-[0_0_35px_rgba(255,42,95,0.45)]'
                        : isSelected
                        ? 'bg-[#ff2a5f]/15 border-[#ff2a5f] shadow-[0_0_25px_rgba(255,42,95,0.2)]'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                    }`}
                  >
                    {/* TOP-RIGHT NOTIFICATION-STYLE VOTE COUNT BUBBLE */}
                    {stage === 'vote-reveal' && (
                      <div
                        className={`absolute -top-3.5 -right-3.5 w-11 h-11 rounded-full border-2 flex items-center justify-center font-display text-lg font-black tabular-nums shadow-xl ${
                          voteCount > 0
                            ? 'bg-[#ff2a5f] border-white text-white shadow-[0_0_25px_rgba(255,42,95,0.75)] scale-105'
                            : 'bg-[#151a26] border-white/20 text-neutral-400'
                        }`}
                      >
                        {voteCount}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center ${p.avatarBg}`}
                          >
                            <span
                              className={`font-display text-sm font-black ${p.avatarText}`}
                            >
                              {p.initials}
                            </span>
                          </div>
                          <div>
                            <p
                              className={`font-display text-base font-black uppercase ${p.avatarText}`}
                            >
                              {p.name}
                            </p>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                              {p.title}
                            </span>
                          </div>
                        </div>

                        {stage === 'voting' && isSelected && (
                          <span className="px-2.5 py-1 rounded bg-[#ff2a5f] text-white text-[10px] font-mono font-black uppercase">
                            SELECTED
                          </span>
                        )}
                      </div>

                      {/* Clues submitted by this player */}
                      <div className="space-y-2">
                        {playerClues.map((c) => (
                          <div
                            key={c.id}
                            className="px-3.5 py-2 rounded-xl bg-black/50 border border-white/10 text-sm text-neutral-100"
                          >
                            <span className="text-[10px] font-mono text-neutral-400 mr-2">
                              ROUND {c.round}:
                            </span>
                            <span className="font-bold">"{c.text}"</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Full Names of Voters in Vote Reveal */}
                    {stage === 'vote-reveal' && (
                      <div className="pt-3 border-t border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                            VOTED BY:
                          </span>
                          <span className="font-mono text-xs font-black text-[#ff2a5f]">
                            {voteCount} {voteCount === 1 ? 'VOTE' : 'VOTES'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {votersForThisPlayer.length > 0 ? (
                            votersForThisPlayer.map((voter) => (
                              <span
                                key={voter.id}
                                className={`px-2.5 py-1 rounded-lg bg-black/60 border border-white/15 text-[11px] font-display font-black uppercase ${voter.avatarText}`}
                              >
                                {voter.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs font-mono text-neutral-500">
                              No votes cast against this player
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PHASE 4.5: DRAMATIC VERDICT SUSPENSE SCREEN */}
        {stage === 'verdict-suspense' && (
          <div className="max-w-lg w-full mx-auto rounded-[32px] bg-[#10141d]/95 border border-[#ff2a5f]/50 p-10 text-center shadow-[0_32px_90px_rgba(0,0,0,0.95)] flex flex-col items-center justify-center min-h-[380px]">
            <div className="w-24 h-24 rounded-3xl bg-[#ff2a5f]/20 border-2 border-[#ff2a5f] flex items-center justify-center mb-5 shadow-[0_0_50px_rgba(255,42,95,0.5)] animate-bounce">
              <ShieldAlert className="w-12 h-12 text-[#ff2a5f]" />
            </div>

            <span className="text-xs font-mono font-black uppercase tracking-[0.25em] text-[#ff2a5f] animate-pulse">
              INTERROGATING EJECTED SUSPECT...
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mt-2">
              WAS{' '}
              <span className={eliminatedParticipant?.avatarText || 'text-[#ff2a5f]'}>
                {eliminatedParticipant?.name}
              </span>{' '}
              THE IMPOSTER?
            </h2>
          </div>
        )}

        {/* PHASE 4.8: IMPOSTER CAUGHT -> LAST-STAND SECRET PLAYER GUESS */}
        {stage === 'imposter-last-stand' && (
          <div className="max-w-xl w-full mx-auto rounded-[30px] bg-[#10141d]/95 border-2 border-[#ff2a5f] p-8 text-center shadow-[0_32px_90px_rgba(0,0,0,0.95)] animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-[#ff2a5f]/20 border border-[#ff2a5f]/50 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(255,42,95,0.4)]">
              <ShieldAlert className="w-8 h-8 text-[#ff2a5f]" />
            </div>

            <span className="px-3.5 py-1 rounded-full bg-[#ff2a5f]/20 border border-[#ff2a5f]/50 text-xs font-mono font-black uppercase tracking-[0.2em] text-[#ff2a5f]">
              IMPOSTER CAUGHT • LAST STAND CHANCE
            </span>

            <h2 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mt-3">
              {imposterParticipant.isUser ? (
                'GUESS THE SECRET PLAYER TO STEAL THE WIN'
              ) : (
                <>
                  <span className={imposterParticipant.avatarText}>
                    {imposterParticipant.name}
                  </span>{' '}
                  IS GUESSING THE SECRET PLAYER...
                </>
              )}
            </h2>

            <p className="text-sm text-neutral-300 mt-2 mb-6">
              {imposterParticipant.isUser
                ? 'You were voted out! Name the secret footballer from the Crew clues to steal victory.'
                : 'The Imposter was caught, but gets one final shot to name the secret footballer and steal the win!'}
            </p>

            {imposterParticipant.isUser ? (
              <form onSubmit={handleImposterLastStandSubmit} className="space-y-3 text-left">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    ref={lastStandInputRef}
                    type="text"
                    value={imposterGuessInput}
                    onChange={(e) => {
                      setImposterGuessInput(e.target.value);
                      setDidYouMeanSuggestion(null);
                    }}
                    placeholder="Type the secret footballer's name..."
                    className="flex-1 px-4 py-4 rounded-xl bg-black/65 border border-white/20 focus:border-[#ff2a5f] focus:outline-none text-base font-semibold text-white placeholder:text-neutral-500"
                  />
                  <button
                    type="submit"
                    disabled={!imposterGuessInput.trim()}
                    className="px-7 py-4 rounded-xl bg-[#ff2a5f] hover:bg-[#ff4270] disabled:opacity-40 disabled:pointer-events-none text-white font-display text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(255,42,95,0.4)] cursor-pointer shrink-0"
                  >
                    <span>{didYouMeanSuggestion ? 'CONFIRM & SEND' : 'SEND GUESS'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {didYouMeanSuggestion && (
                  <div className="px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-amber-200">
                      Did you mean{' '}
                      <strong className="text-white font-bold">
                        {didYouMeanSuggestion}
                      </strong>
                      ? Click <strong className="text-white">CONFIRM &amp; SEND</strong> again to lock it in.
                    </span>
                  </div>
                )}
              </form>
            ) : (
              <div className="px-5 py-4 rounded-2xl bg-black/55 border border-white/10 text-sm font-mono text-neutral-300 animate-pulse">
                <span className={`font-bold ${imposterParticipant.avatarText}`}>
                  {imposterParticipant.name}
                </span>{' '}
                is locking in their final guess...
              </div>
            )}
          </div>
        )}

        {/* PHASE 5: ENDGAME VERDICT & SECRET PLAYER REVEAL */}
        {stage === 'game-over' && (
          <div className="max-w-2xl w-full mx-auto rounded-[30px] bg-[#10141d]/95 border border-white/15 p-8 text-center shadow-[0_32px_90px_rgba(0,0,0,0.92)] animate-fade-in">
            <div
              className={`w-20 h-20 rounded-3xl border-2 flex items-center justify-center mx-auto mb-4 ${
                crewWonMatch
                  ? 'bg-emerald-500/15 border-emerald-400 shadow-[0_0_35px_rgba(16,185,129,0.35)]'
                  : 'bg-[#ff2a5f]/15 border-[#ff2a5f] shadow-[0_0_35px_rgba(255,42,95,0.35)]'
              }`}
            >
              {crewWonMatch ? (
                <UserCheck className="w-10 h-10 text-emerald-400" />
              ) : (
                <UserX className="w-10 h-10 text-[#ff2a5f]" />
              )}
            </div>

            <span
              className={`px-3.5 py-1 rounded-full text-xs font-mono font-black uppercase tracking-[0.2em] border ${
                crewWonMatch
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : 'bg-[#ff2a5f]/15 border-[#ff2a5f]/40 text-[#ff2a5f]'
              }`}
            >
              {imposterCaught && imposterStolenWin
                ? 'LAST-STAND HEIST!'
                : imposterCaught
                ? 'IMPOSTER CAUGHT!'
                : 'INNOCENT ELIMINATED!'}
            </span>

            <h1 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-white mt-3">
              {imposterCaught && imposterStolenWin
                ? 'IMPOSTER VICTORY! GUESSED THE SECRET PLAYER'
                : crewWonMatch
                ? 'CREW VICTORY! THE SPY WAS EXPOSED'
                : 'IMPOSTER VICTORY! THE BLUFF WORKED'}
            </h1>

            <p className="text-sm text-neutral-300 mt-2 mb-6">
              Eliminated by Vote:{' '}
              <strong className={`font-bold ${eliminatedParticipant?.avatarText || 'text-white'}`}>
                {eliminatedParticipant?.name}
              </strong>{' '}
              • True Imposter:{' '}
              <strong className={`font-bold ${imposterParticipant.avatarText || 'text-[#ff2a5f]'}`}>
                {imposterParticipant.name}
              </strong>
              {imposterCaught && imposterFinalGuessText ? (
                <>
                  {' '}
                  • Imposter Guessed:{' '}
                  <strong
                    className={
                      imposterStolenWin
                        ? 'text-[#ccff00] font-bold'
                        : 'text-rose-400 font-bold'
                    }
                  >
                    "{imposterFinalGuessText}"
                  </strong>
                </>
              ) : null}
            </p>

            {/* True Secret Player Identity Card */}
            <div className="rounded-2xl bg-gradient-to-b from-[#171e2e] to-[#0d111a] border border-white/15 p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-black/50 border border-white/15 flex items-center justify-center p-3 shrink-0">
                  <img
                    src={secretPlayer.crestUrl}
                    alt={secretPlayer.primaryClub}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#ccff00] block">
                    TRUE SECRET FOOTBALLER
                  </span>
                  <h3 className="font-display text-2xl sm:text-3xl font-black uppercase text-white">
                    {secretPlayer.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10">
                      <img
                        src={secretPlayer.flagUrl}
                        alt={secretPlayer.nationality}
                        className="w-4 h-3 object-cover rounded-sm"
                      />
                      <span className="text-xs font-mono text-neutral-200">
                        {secretPlayer.nationality}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/10">
                      <img
                        src={secretPlayer.crestUrl}
                        alt={secretPlayer.primaryClub}
                        className="w-4 h-4 object-contain"
                      />
                      <span className="text-xs font-mono text-neutral-200">
                        {secretPlayer.primaryClub}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#ccff00]/15 border border-[#ccff00]/35 text-xs font-mono font-black text-[#ccff00]">
                      {secretPlayer.position}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 max-w-xs">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#ff2a5f] block mb-1">
                  IMPOSTER CLUE WAS:
                </span>
                <p className="text-xs font-semibold text-neutral-200">
                  {config.imposterClueEnabled
                    ? secretPlayer.imposterVagueClue
                    : 'Disabled (Zero Clues Mode)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isMultiplayer) sendGameLeave();
                  onExitArena();
                }}
                className="flex-1 py-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 text-xs font-display font-extrabold uppercase tracking-widest text-neutral-300 transition-all cursor-pointer"
              >
                RETURN TO HUB
              </button>
              <button
                type="button"
                onClick={handlePlayAgain}
                className="flex-1 py-4 rounded-xl bg-[#ff2a5f] hover:bg-[#ff4270] text-white text-xs font-display font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(255,42,95,0.35)] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Multiplayer Opponent Forfeit Dialog */}
      <MultiplayerForfeitModal
        forfeitEvent={playerForfeitEvent}
        onReturnToHub={() => {
          clearForfeit();
          onExitArena();
        }}
      />

      <div className="h-1" />
    </div>
  );
};
