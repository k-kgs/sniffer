'use client';

import React, {
  useRef,
  useEffect,
  useState,
  MouseEvent,
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
} from 'react';
import { initPostHog } from '@/lib/posthog';

// Popular 5-letter words (add more as desired)
const WORDS = [
  'PLANT', 'BRAVE', 'SWEET', 'GRACE', 'SHINE', 'EARTH', 'SMART', 'TIGER',
  'CLOUD', 'MUSIC', 'PEACH', 'BRAIN', 'LUCKY', 'NOBLE', 'SMILE', 'WATER',
  'STONE', 'LIGHT', 'DREAM', 'PEARL', 'BLOOM', 'GIANT', 'PRIZE', 'STORY',
  'YOUTH', 'TREND', 'UNITY', 'VIVID', 'WORLD', 'ZEBRA', 'QUEST', 'ROBIN',
];

function getRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function shuffle<T>(array: T[]): T[] {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

type Balloon = {
  x: number;
  y: number;
  radius: number;
  letter: string;
  burst: boolean;
};

type Stone = {
  x: number;
  y: number;
  vx: number;
  vy: number;
} | null;

const canvasWidth = 380;
const canvasHeight = 400;
const BALLOON_COUNT = 5;
const MAX_SHOTS = 7;
const BASE_GUESS_CHANCES = 2;
const MAX_CARRYOVER = 2;
const POP_SOUND = '/pop.mp3'; // Place a pop.mp3 in your public folder
const SUCCESS_SOUND = '/success.mp3'; // Place a success.mp3 in your public folder
const FAIL_SOUND = '/fail.mp3'; // Place a fail.mp3 in your public folder

export default function Home() {
  // --- Game State ---
  const [word, setWord] = useState<string>(getRandomWord());
  const balloonY = 90;
  const balloonRadius = 36;
  const balloonXs = Array.from({ length: BALLOON_COUNT }, (_, i) =>
    ((canvasWidth - 2 * balloonRadius) / (BALLOON_COUNT - 1)) * i + balloonRadius
  );
  const anchorLeft = { x: canvasWidth / 2 - 70, y: 260 };
  const anchorRight = { x: canvasWidth / 2 + 70, y: 260 };
  const pouchRest = { x: canvasWidth / 2, y: 290 };

  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [collected, setCollected] = useState<string[]>(Array(BALLOON_COUNT).fill(''));
  const [stage, setStage] = useState<'shoot' | 'input' | 'fail'>('shoot');
  const [result, setResult] = useState<string>('');
  const [inputLetters, setInputLetters] = useState<string[]>(Array(BALLOON_COUNT).fill(''));
  const [shotsLeft, setShotsLeft] = useState<number>(MAX_SHOTS);
  const [guessChances, setGuessChances] = useState<number>(BASE_GUESS_CHANCES);
  const [carriedChances, setCarriedChances] = useState<number>(0);

  // For auto-advance
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Slingshot pouch
  const [pouch, setPouch] = useState<{ x: number; y: number; dragging: boolean }>({
    ...pouchRest,
    dragging: false,
  });
  const [stone, setStone] = useState<Stone>(null);

  // --- Audio ---
  const popAudio = useRef<HTMLAudioElement | null>(null);
  const successAudio = useRef<HTMLAudioElement | null>(null);
  const failAudio = useRef<HTMLAudioElement | null>(null);

  // --- Mouse/Touch Handler Logic ---
  const dragRef = useRef(false);

  function getPointerPosFromEvent(
    e: MouseEvent<HTMLCanvasElement> | TouchEvent | Touch
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('clientX' in e && 'clientY' in e) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    } else if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: 0, y: 0 };
  }

  // Mouse events (desktop)
  function handleDown(e: MouseEvent<HTMLCanvasElement>) {
    if (stage !== 'shoot') return;
    const { x, y } = getPointerPosFromEvent(e);
    if (Math.hypot(x - pouch.x, y - pouch.y) < 30) {
      dragRef.current = true;
      setPouch((p) => ({ ...p, dragging: true }));
    }
  }
  function handleMove(e: MouseEvent<HTMLCanvasElement>) {
    if (stage !== 'shoot' || !dragRef.current) return;
    const { x, y } = getPointerPosFromEvent(e);
    const dx = x - pouchRest.x;
    const dy = y - pouchRest.y;
    const maxLen = 80;
    let len = Math.sqrt(dx * dx + dy * dy);
    let nx = dx, ny = dy;
    if (len > maxLen) {
      nx = (dx / len) * maxLen;
      ny = (dy / len) * maxLen;
    }
    setPouch({ x: pouchRest.x + nx, y: pouchRest.y + ny, dragging: true });
  }
  function handleUp() {
    if (stage !== 'shoot' || !dragRef.current) return;
    dragRef.current = false;
    // Only allow shooting if shots left
    if (shotsLeft <= 0) return;
    const dx = pouch.x - pouchRest.x;
    const dy = pouch.y - pouchRest.y;
    const speedFactor = 0.25;
    setStone({
      x: pouch.x,
      y: pouch.y,
      vx: -dx * speedFactor,
      vy: -dy * speedFactor,
    });
    setPouch({ ...pouchRest, dragging: false });
    setShotsLeft((s) => s - 1);
  }

  // Native touch events (mobile)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleTouchStart(e: TouchEvent) {
      e.preventDefault();
      if (stage !== 'shoot') return;
      const { x, y } = getPointerPosFromEvent(e);
      if (Math.hypot(x - pouch.x, y - pouch.y) < 30) {
        dragRef.current = true;
        setPouch((p) => ({ ...p, dragging: true }));
      }
    }
    function handleTouchMove(e: TouchEvent) {
      e.preventDefault();
      if (stage !== 'shoot' || !dragRef.current) return;
      const { x, y } = getPointerPosFromEvent(e);
      const dx = x - pouchRest.x;
      const dy = y - pouchRest.y;
      const maxLen = 80;
      let len = Math.sqrt(dx * dx + dy * dy);
      let nx = dx, ny = dy;
      if (len > maxLen) {
        nx = (dx / len) * maxLen;
        ny = (dy / len) * maxLen;
      }
      setPouch({ x: pouchRest.x + nx, y: pouchRest.y + ny, dragging: true });
    }
    function handleTouchEnd(e: TouchEvent) {
      e.preventDefault();
      if (stage !== 'shoot' || !dragRef.current) return;
      dragRef.current = false;
      if (shotsLeft <= 0) return;
      const dx = pouch.x - pouchRest.x;
      const dy = pouch.y - pouchRest.y;
      const speedFactor = 0.25;
      setStone({
        x: pouch.x,
        y: pouch.y,
        vx: -dx * speedFactor,
        vy: -dy * speedFactor,
      });
      setPouch({ ...pouchRest, dragging: false });
      setShotsLeft((s) => s - 1);
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
    // eslint-disable-next-line
  }, [stage, pouch.x, pouch.y, pouchRest.x, pouchRest.y, shotsLeft]);

  // Draw everything
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw balloons and revealed letters
    balloons.forEach((b, i) => {
      if (!b.burst) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#5bc0eb';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe066';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.letter, b.x, b.y);
      }
    });

    // Draw slingshot only during shoot stage
    if (stage === 'shoot') {
      // Arms
      ctx.beginPath();
      ctx.moveTo(anchorLeft.x, anchorLeft.y + 34);
      ctx.lineTo(anchorLeft.x, anchorLeft.y - 20);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#654321';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(anchorRight.x, anchorRight.y + 34);
      ctx.lineTo(anchorRight.x, anchorRight.y - 20);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#654321';
      ctx.stroke();

      // Band (triangle)
      ctx.beginPath();
      ctx.moveTo(anchorLeft.x, anchorLeft.y);
      ctx.lineTo(pouch.x, pouch.y);
      ctx.lineTo(anchorRight.x, anchorRight.y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#b5651d';
      ctx.stroke();

      // Pouch
      ctx.beginPath();
      ctx.arc(pouch.x, pouch.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#888';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.stroke();

      // Stone in pouch or in flight
      if (pouch.dragging) {
        ctx.beginPath();
        ctx.arc(pouch.x, pouch.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
      }
      if (stone) {
        ctx.beginPath();
        ctx.arc(stone.x, stone.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
      }
    }
  }, [balloons, pouch, stone, stage]);

  // Stone animation
  useEffect(() => {
    if (!stone || stage !== 'shoot') return;
    let raf: number;
    function animate() {
      setStone((s) => {
        if (!s) return null;
        const gravity = 0.5;
        const newStone = { ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + gravity };
        let hitIdx = -1;
        setBalloons((prev) =>
          prev.map((b, idx) => {
            if (!b.burst && hitIdx === -1) {
              const dist = Math.hypot(b.x - newStone.x, b.y - newStone.y);
              if (dist < b.radius + 12) {
                hitIdx = idx;
                setCollected((c) => {
                  const nc = [...c];
                  nc[idx] = b.letter;
                  return nc;
                });
                // Play pop sound
                if (popAudio.current) {
                  popAudio.current.currentTime = 0;
                  popAudio.current.play();
                }
                return { ...b, burst: true };
              }
            }
            return b;
          })
        );
        if (
          newStone.x < 0 ||
          newStone.x > canvasWidth ||
          newStone.y < 0 ||
          newStone.y > canvasHeight ||
          hitIdx !== -1
        ) {
          return null;
        }
        return newStone;
      });
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [stone, stage]);

  // Stage transitions and game over logic
  useEffect(() => {
    // If all balloons burst, carry over shots
    if (collected.filter((c) => c).length === BALLOON_COUNT && stage === 'shoot') {
      // Carryover is min(available shots, 2)
      const carry = Math.min(shotsLeft, MAX_CARRYOVER);
      setCarriedChances(carry);
      setTimeout(() => {
        setStage('input');
        setInputLetters(Array(BALLOON_COUNT).fill(''));
        setGuessChances(BASE_GUESS_CHANCES + carry);
        setResult('');
      }, 600);
    }
    // If shots used up and balloons remain, fail
    if (
      shotsLeft === 0 &&
      collected.filter((c) => c).length < BALLOON_COUNT &&
      stage === 'shoot'
    ) {
      setTimeout(() => {
        setStage('fail');
        setResult('Mission Failed! Out of shots.');
        if (failAudio.current) {
          failAudio.current.currentTime = 0;
          failAudio.current.play();
        }
      }, 400);
    }
  }, [collected, shotsLeft, stage]);

  // --- Input logic with auto-advance ---
  function handleInputChange(e: ChangeEvent<HTMLInputElement>, idx: number) {
    const val = e.target.value.toUpperCase();
    if (val.length > 1) return;
    setInputLetters((prev) => {
      const arr = [...prev];
      arr[idx] = val.replace(/[^A-Z]/g, '');
      return arr;
    });
    // Auto-focus next input if not last and value entered
    if (val && idx < BALLOON_COUNT - 1) {
      setTimeout(() => {
        inputRefs.current[idx + 1]?.focus();
      }, 0);
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === 'Backspace' && !inputLetters[idx] && idx > 0) {
      setTimeout(() => {
        inputRefs.current[idx - 1]?.focus();
      }, 0);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (inputLetters.join('') === word) {
      setResult('🎉 Correct! Well done!');
      if (successAudio.current) {
        successAudio.current.currentTime = 0;
        successAudio.current.play();
      }
    } else {
      if (guessChances - 1 > 0) {
        setResult('❌ Try again!');
        if (failAudio.current) {
          failAudio.current.currentTime = 0;
          failAudio.current.play();
        }
        setGuessChances((c) => c - 1);
      } else {
        setResult('Mission Failed! Out of chances.');
        setGuessChances(0);
        setTimeout(() => {
          setStage('fail');
        }, 1200);
        if (failAudio.current) {
          failAudio.current.currentTime = 0;
          failAudio.current.play();
        }
      }
    }
  }
  function handleRestart() {
    const newWord = getRandomWord();
    setWord(newWord);
    setBalloons(
      shuffle(newWord.split('')).map((letter, i) => ({
        x: balloonXs[i],
        y: balloonY,
        radius: balloonRadius,
        letter,
        burst: false,
      }))
    );
    setCollected(Array(BALLOON_COUNT).fill(''));
    setStage('shoot');
    setInputLetters(Array(BALLOON_COUNT).fill(''));
    setResult('');
    setStone(null);
    setPouch({ ...pouchRest, dragging: false });
    setShotsLeft(MAX_SHOTS);
    setGuessChances(BASE_GUESS_CHANCES);
    setCarriedChances(0);
  }

  // On mount, initialize balloons for first game
  useEffect(() => {
    setBalloons(
      shuffle(word.split('')).map((letter, i) => ({
        x: balloonXs[i],
        y: balloonY,
        radius: balloonRadius,
        letter,
        burst: false,
      }))
    );
    setCollected(Array(BALLOON_COUNT).fill(''));
    setInputLetters(Array(BALLOON_COUNT).fill(''));
    setShotsLeft(MAX_SHOTS);
    setGuessChances(BASE_GUESS_CHANCES);
    setCarriedChances(0);
    setStone(null);
    setPouch({ ...pouchRest, dragging: false });
    setStage('shoot');
    setResult('');
  }, [word]);

  useEffect(() => {
    initPostHog();
  }, []);

  // --- Unified, Seamless CSS ---
  const styles = (
    <style>{`
      .input-row {
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-bottom: 18px;
        width: 100%;
      }
      .input-card {
        width: 52px;
        height: 52px;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(91,192,235,0.10);
        font-size: 2rem;
        text-align: center;
        border: 2px solid #5bc0eb;
        background: rgba(91,192,235,0.08);
        transition: border-color 0.2s, box-shadow 0.2s;
        text-transform: uppercase;
        color: #222;
      }
      .input-card:focus {
        border-color: #ffe066;
        box-shadow: 0 4px 16px rgba(255,224,102,0.18);
        outline: none;
      }
      .button-row {
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
        width: 100%;
      }
      .action-btn {
        min-width: 120px;
        padding: 12px 20px;
        font-size: 1.1rem;
        border-radius: 8px;
        border: none;
        background: #5bc0eb;
        color: #fff;
        font-weight: 600;
        margin-bottom: 8px;
        margin-top: 0;
        box-shadow: 0 2px 8px rgba(91,192,235,0.10);
        cursor: pointer;
        transition: background 0.2s;
      }
      .action-btn.restart {
        background: rgba(91,192,235,0.14);
        color: #333;
        border: 1.5px solid #5bc0eb;
      }
      @media (max-width: 500px) {
        .input-card {
          width: 38px;
          height: 38px;
          font-size: 1.2rem;
        }
        .action-btn {
          width: 100%;
          min-width: 0;
          margin-bottom: 10px;
        }
        .button-row {
          flex-direction: column;
          gap: 8px;
        }
      }
    `}</style>
  );

  return (
    <main style={{
      maxWidth: canvasWidth,
      margin: '0 auto',
      padding: 16,
      background: 'linear-gradient(180deg, #eaf6fb 0%, #f6f7f9 100%)',
      minHeight: '100vh'
    }}>
      {styles}
      {/* Audio elements for SFX */}
      <audio ref={popAudio} src={POP_SOUND} preload="auto" />
      <audio ref={successAudio} src={SUCCESS_SOUND} preload="auto" />
      <audio ref={failAudio} src={FAIL_SOUND} preload="auto" />

      <h1 style={{
        textAlign: 'center',
        marginBottom: 8,
        color: '#222',
        textShadow: '0 1px 0 #fff, 0 2px 6px rgba(80,80,120,0.08)'
      }}>
        Sniffer
      </h1>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 18,
        marginBottom: 8,
        fontSize: 16,
        fontWeight: 600,
        color: '#5bc0eb',
        letterSpacing: 1,
      }}>
        {stage === 'shoot' && (
          <>
            <span>Shots Left: <span style={{color:'#333'}}>{shotsLeft}</span></span>
            <span>Balloons Left: <span style={{color:'#333'}}>{BALLOON_COUNT - collected.filter(c=>c).length}</span></span>
          </>
        )}
        {stage === 'input' && (
          <>
            <span>Chances Left: <span style={{color:'#333'}}>{guessChances}</span></span>
            {carriedChances > 0 && (
              <span style={{color:'#888', fontWeight:400, fontSize:14}}>
                (Carried over: {carriedChances})
              </span>
            )}
          </>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          border: '2px solid #5bc0eb',
          borderRadius: 12,
          touchAction: 'none',
          background: 'linear-gradient(180deg, #eaf6fb 0%, #f6f7f9 100%)',
          display: 'block',
          margin: '0 auto',
          maxWidth: '100%',
        }}
        // Mouse events only (touch handled natively)
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
      />
      {/* Input form appears in place of sling after all balloons are burst */}
      {stage === 'input' && (
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            maxWidth: 340,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'transparent',
            borderRadius: 0,
            padding: 0,
            marginTop: 30,
            zIndex: 2,
            position: 'relative',
          }}
        >
          <h3 style={{
            marginBottom: 18,
            fontWeight: 500,
            fontSize: 20,
            color: '#222',
            background: 'transparent',
            textShadow: '0 1px 0 #fff, 0 2px 6px rgba(80,80,120,0.08)'
          }}>Type your guess:</h3>
          <div className="input-row">
            {inputLetters.map((l, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={1}
                value={l}
                onChange={(e) => handleInputChange(e, i)}
                onKeyDown={(e) => handleInputKeyDown(e, i)}
                className="input-card"
                aria-label={`Letter ${i + 1}`}
                style={{
                  borderColor: '#5bc0eb',
                  background: 'rgba(91,192,235,0.08)',
                  color: '#222',
                }}
              />
            ))}
          </div>
          <div className="button-row">
            <button type="submit" className="action-btn" disabled={guessChances === 0 || result.startsWith('🎉')}>Submit Guess</button>
            <button type="button" onClick={handleRestart} className="action-btn restart">Restart Game</button>
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 20,
              color: result.startsWith('🎉') ? '#7ed957' : '#ff5a5f',
              minHeight: 28,
              fontWeight: 500,
              textShadow: '0 1px 0 #fff, 0 2px 6px rgba(80,80,120,0.08)'
            }}
          >
            {result}
          </div>
        </form>
      )}
      {stage === 'fail' && (
        <div style={{
          margin: '32px auto 0 auto',
          textAlign: 'center',
          color: '#ff5a5f',
          fontWeight: 700,
          fontSize: 22,
        }}>
          Mission Failed!<br />
          <button
            onClick={handleRestart}
            className="action-btn restart"
            style={{marginTop: 18, fontSize: 18}}
          >
            Restart Game
          </button>
        </div>
      )}
      <footer
        style={{
          marginTop: 40,
          textAlign: 'center',
          color: '#888',
          fontSize: 14,
        }}
      >
        &copy; {new Date().getFullYear()} Mavericks Digital
      </footer>
    </main>
  );
}
