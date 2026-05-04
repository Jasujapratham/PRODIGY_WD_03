/**
 * ============================================================
 * NEXUS Tic-Tac-Toe — script.js
 * Features: PvP · Unbeatable AI (Minimax) · Scoreboard
 *           Animations · Sound Effects · Dark/Light Theme
 * ============================================================
 *
 * Architecture: IIFE (Immediately Invoked Function Expression)
 * — keeps everything out of global scope.
 * Broken into clear modules:
 *   STATE    — single source of truth for all game data
 *   SOUND    — Web Audio API synth sounds (no files needed)
 *   RENDER   — all DOM updates live here
 *   GAME     — core logic: moves, win detection, Minimax AI
 *   EVENTS   — all event listeners wired up once
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1. STATE  — single source of truth
  ══════════════════════════════════════════════════════════ */
  const STATE = {
    board:       Array(9).fill(null),   // null | 'X' | 'O'
    current:     'X',                   // whose turn it is
    mode:        'pvp',                 // 'pvp' | 'ai'
    gameOver:    false,
    scores:      { X: 0, O: 0, draw: 0 },
    // Winning line combos (indices into the 3×3 board)
    WINS: [
      [0,1,2],[3,4,5],[6,7,8],   // rows
      [0,3,6],[1,4,7],[2,5,8],   // columns
      [0,4,8],[2,4,6],           // diagonals
    ],
  };

  /* ══════════════════════════════════════════════════════════
     2. DOM REFERENCES  — grab once, reuse everywhere
  ══════════════════════════════════════════════════════════ */
  const DOM = {
    board:          document.getElementById('board'),
    cells:          document.querySelectorAll('.cell'),
    statusText:     document.getElementById('statusText'),
    statusIndicator:document.getElementById('statusIndicator'),
    nameX:          document.getElementById('nameX'),
    nameO:          document.getElementById('nameO'),
    scoreX:         document.getElementById('scoreValueX'),
    scoreO:         document.getElementById('scoreValueO'),
    scoreDraw:      document.getElementById('scoreValueDraw'),
    scoreCardX:     document.getElementById('scoreX'),
    scoreCardO:     document.getElementById('scoreO'),
    btnPvP:         document.getElementById('btnPvP'),
    btnAI:          document.getElementById('btnAI'),
    btnRestart:     document.getElementById('btnRestart'),
    btnResetScore:  document.getElementById('btnResetScore'),
    overlay:        document.getElementById('overlay'),
    overlayTitle:   document.getElementById('overlayTitle'),
    overlaySub:     document.getElementById('overlaySub'),
    overlayEmoji:   document.getElementById('overlayEmoji'),
    overlayBtn:     document.getElementById('overlayBtn'),
    themeToggle:    document.getElementById('themeToggle'),
    themeIcon:      document.getElementById('themeIcon'),
    html:           document.documentElement,
  };

  /* ══════════════════════════════════════════════════════════
     3. SOUND ENGINE  — Web Audio API, no external files
     Generates tones via oscillators for a retro-synth feel.
  ══════════════════════════════════════════════════════════ */
  const SOUND = (() => {
    let ctx = null;   // AudioContext (lazy-init on first user interaction)

    function getCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx;
    }

    /**
     * Play a simple synthesised tone.
     * @param {number} freq     - Frequency in Hz
     * @param {string} type     - Oscillator wave type
     * @param {number} duration - Seconds
     * @param {number} vol      - Volume 0..1
     */
    function tone(freq, type = 'sine', duration = 0.12, vol = 0.18) {
      try {
        const ac  = getCtx();
        const osc = ac.createOscillator();
        const gn  = ac.createGain();

        osc.type      = type;
        osc.frequency.setValueAtTime(freq, ac.currentTime);

        gn.gain.setValueAtTime(vol, ac.currentTime);
        gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

        osc.connect(gn);
        gn.connect(ac.destination);

        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + duration);
      } catch (_) { /* Sound unavailable — fail silently */ }
    }

    // Public sound presets
    return {
      move(player) {
        // X = bright high blip, O = warm lower blip
        if (player === 'X') tone(660, 'square', 0.08, 0.12);
        else                 tone(440, 'triangle', 0.10, 0.12);
      },
      win() {
        // Victory fanfare: ascending chord
        [523, 659, 784, 1047].forEach((f, i) =>
          setTimeout(() => tone(f, 'sine', 0.25, 0.15), i * 80)
        );
      },
      draw() {
        // Neutral descending tones
        [400, 300].forEach((f, i) =>
          setTimeout(() => tone(f, 'sawtooth', 0.2, 0.10), i * 100)
        );
      },
    };
  })();

  /* ══════════════════════════════════════════════════════════
     4. RENDER  — all DOM mutations live here
  ══════════════════════════════════════════════════════════ */
  const RENDER = {
    /** Update all cell appearances from STATE.board */
    board() {
      DOM.cells.forEach((cell, i) => {
        const mark = STATE.board[i];
        if (mark) {
          cell.setAttribute('data-mark', mark);
          cell.textContent = mark;
          cell.disabled = true;
          cell.removeAttribute('data-preview');
        } else {
          cell.removeAttribute('data-mark');
          cell.textContent = '';
          cell.disabled = false;
          // Show preview of whose mark will appear on hover
          cell.setAttribute('data-preview', STATE.current);
          if (STATE.current === 'O') cell.classList.add('o-preview');
          else cell.classList.remove('o-preview');
        }
      });
    },

    /** Status bar: whose turn / result message */
    status(text, player = null) {
      DOM.statusText.textContent = text;
      DOM.statusIndicator.className = 'status-indicator';
      if (player === 'X') { /* default cyan */ }
      else if (player === 'O') DOM.statusIndicator.classList.add('o-turn');
      else DOM.statusIndicator.classList.add('idle');
    },

    /** Highlight winning cells */
    winnerCells(indices) {
      indices.forEach(i => DOM.cells[i].classList.add('winner'));
    },

    /** Grey out the board after game ends */
    boardGameOver() {
      DOM.board.classList.add('game-over');
    },

    /** Animate board for AI thinking */
    aiThinking(on) {
      DOM.board.classList.toggle('ai-thinking', on);
    },

    /** Update scoreboard numbers with a pop animation */
    scores() {
      const update = (el, val) => {
        el.textContent = val;
        el.classList.remove('score-jump');
        void el.offsetWidth;   // force reflow to restart animation
        el.classList.add('score-jump');
      };
      update(DOM.scoreX,    STATE.scores.X);
      update(DOM.scoreO,    STATE.scores.O);
      update(DOM.scoreDraw, STATE.scores.draw);
    },

    /** Highlight score card of active player */
    activeScoreCard() {
      DOM.scoreCardX.classList.toggle('active-turn', STATE.current === 'X');
      DOM.scoreCardO.classList.toggle('active-turn', STATE.current === 'O');
    },

    /** Show/hide win overlay */
    overlay(show, { title = '', sub = '', emoji = '', isO = false, isDraw = false } = {}) {
      if (show) {
        DOM.overlayTitle.textContent = title;
        DOM.overlaySub.textContent   = sub;
        DOM.overlayEmoji.textContent = emoji;
        DOM.overlayTitle.className   = 'overlay-title';
        if (isO)     DOM.overlayTitle.classList.add('o-win');
        if (isDraw)  DOM.overlayTitle.classList.add('draw');
        DOM.overlay.hidden = false;
      } else {
        DOM.overlay.hidden = true;
      }
    },

    /** Update player name labels */
    playerNames() {
      DOM.nameO.textContent = STATE.mode === 'ai' ? 'AI' : 'Player O';
    },

    /** Mode buttons active state */
    modeButtons() {
      DOM.btnPvP.classList.toggle('active', STATE.mode === 'pvp');
      DOM.btnAI.classList.toggle('active',  STATE.mode === 'ai');
    },

    /** Full reset render */
    reset() {
      DOM.board.classList.remove('game-over', 'ai-thinking');
      DOM.cells.forEach(c => {
        c.classList.remove('winner', 'o-preview');
        c.removeAttribute('data-mark');
        c.removeAttribute('data-preview');
        c.textContent = '';
        c.disabled = false;
      });
      this.board();
      this.activeScoreCard();
      this.status(`Player ${STATE.current}'s Turn`, STATE.current);
    },
  };

  /* ══════════════════════════════════════════════════════════
     5. GAME LOGIC
  ══════════════════════════════════════════════════════════ */
  const GAME = {

    /** Apply a move, check result, then hand off to AI if needed */
    playMove(index) {
      if (STATE.gameOver || STATE.board[index]) return;

      STATE.board[index] = STATE.current;
      SOUND.move(STATE.current);
      RENDER.board();

      const winner = this.checkWinner(STATE.board);
      const full   = STATE.board.every(Boolean);

      if (winner) {
        this.handleWin(winner);
      } else if (full) {
        this.handleDraw();
      } else {
        // Switch turn
        STATE.current = STATE.current === 'X' ? 'O' : 'X';
        RENDER.activeScoreCard();
        RENDER.status(`Player ${STATE.current}'s Turn`, STATE.current);

        // If AI mode and it's O's turn, trigger AI
        if (STATE.mode === 'ai' && STATE.current === 'O') {
          this.triggerAI();
        }
      }
    },

    handleWin({ player, line }) {
      STATE.gameOver = true;
      STATE.scores[player]++;
      SOUND.win();
      RENDER.winnerCells(line);
      RENDER.boardGameOver();
      RENDER.scores();

      const isAI = STATE.mode === 'ai';
      const title = player === 'X'
        ? 'Player X Wins!'
        : isAI ? 'AI Wins!' : 'Player O Wins!';
      const subs  = [
        'Dominant performance', 'Flawless strategy',
        'Brilliant move sequence', 'Unstoppable!'
      ];
      const sub = player === 'O' && isAI
        ? 'The machine never loses 🤖'
        : subs[Math.floor(Math.random() * subs.length)];

      RENDER.status(title, null);
      setTimeout(() => {
        RENDER.overlay(true, {
          title,
          sub,
          emoji: player === 'X' ? '🏆' : isAI ? '🤖' : '🏆',
          isO: player === 'O',
        });
      }, 600);
    },

    handleDraw() {
      STATE.gameOver = true;
      STATE.scores.draw++;
      SOUND.draw();
      RENDER.boardGameOver();
      RENDER.scores();
      RENDER.status("It's a Draw!", null);
      setTimeout(() => {
        RENDER.overlay(true, {
          title: "It's a Draw!",
          sub: 'Perfectly matched opponents',
          emoji: '🤝',
          isDraw: true,
        });
      }, 600);
    },

    /** Check all winning combos on a given board snapshot. */
    checkWinner(board) {
      for (const [a, b, c] of STATE.WINS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
          return { player: board[a], line: [a, b, c] };
        }
      }
      return null;
    },

    /** Reset the board for a new round (keep scores) */
    newGame() {
      STATE.board    = Array(9).fill(null);
      STATE.current  = 'X';
      STATE.gameOver = false;
      RENDER.overlay(false);
      RENDER.reset();
    },

    /* ── AI VIA MINIMAX ─────────────────────────────────────
     *
     * HOW MINIMAX WORKS (in plain English):
     * ─────────────────────────────────────
     * Imagine the AI looking ahead at every possible game.
     * It builds a tree of ALL possible moves from the current
     * board, all the way to a terminal state (win/draw/loss).
     *
     * For each terminal state it assigns a SCORE:
     *   +10 → AI (O) wins
     *    -10 → Human (X) wins
     *     0  → Draw
     *
     * The AI then "backs up" scores through the tree:
     *   • On the AI's turn (MAXIMIZE) → pick the move
     *     with the HIGHEST score (AI plays to win).
     *   • On human's turn (MINIMIZE) → pick the move
     *     with the LOWEST score (AI assumes human plays optimally).
     *
     * Alpha-Beta Pruning (bonus optimisation applied here):
     *   We track `alpha` (best score AI already found) and
     *   `beta` (best score human already found). When a branch
     *   CAN'T possibly improve on what we've already found,
     *   we prune (skip) it entirely — making the AI faster.
     *
     * Result: The AI never loses. At best you draw.
     * ─────────────────────────────────────────────────────── */

    triggerAI() {
      RENDER.aiThinking(true);
      // Small delay so the UI updates feel natural (not instant)
      setTimeout(() => {
        const best = this.getBestMove(STATE.board);
        RENDER.aiThinking(false);
        if (best !== -1) this.playMove(best);
      }, 350);
    },

    /**
     * Find the best move for AI (O) using Minimax + Alpha-Beta.
     * @param {Array} board — current board snapshot
     * @returns {number} — index of best move (0-8)
     */
    getBestMove(board) {
      let bestScore = -Infinity;
      let bestIndex = -1;

      for (let i = 0; i < 9; i++) {
        if (!board[i]) {
          board[i] = 'O';   // try this move
          const score = this.minimax(board, 0, false, -Infinity, +Infinity);
          board[i] = null;  // undo

          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
      }
      return bestIndex;
    },

    /**
     * Minimax with Alpha-Beta Pruning.
     *
     * @param {Array}   board      — current board snapshot
     * @param {number}  depth      — how many moves deep we are
     * @param {boolean} isMax      — true = AI's turn (maximising), false = human's turn (minimising)
     * @param {number}  alpha      — best score AI has secured so far
     * @param {number}  beta       — best score human has secured so far
     * @returns {number}           — the heuristic value of this board position
     */
    minimax(board, depth, isMax, alpha, beta) {
      // ── Terminal checks ──
      const winner = this.checkWinner(board);
      if (winner) {
        // Reward winning SOONER (subtract depth) to prefer quick wins
        if (winner.player === 'O') return  10 - depth;
        if (winner.player === 'X') return -10 + depth;
      }
      if (board.every(Boolean)) return 0;  // draw

      if (isMax) {
        // ── AI's turn: try to MAXIMISE score ──
        let best = -Infinity;
        for (let i = 0; i < 9; i++) {
          if (!board[i]) {
            board[i] = 'O';
            best = Math.max(best, this.minimax(board, depth + 1, false, alpha, beta));
            board[i] = null;

            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;   // 🌿 Prune! Human won't allow this path
          }
        }
        return best;

      } else {
        // ── Human's turn: AI assumes human MINIMISES score ──
        let best = +Infinity;
        for (let i = 0; i < 9; i++) {
          if (!board[i]) {
            board[i] = 'X';
            best = Math.min(best, this.minimax(board, depth + 1, true, alpha, beta));
            board[i] = null;

            beta = Math.min(beta, best);
            if (beta <= alpha) break;   // 🌿 Prune! AI won't allow this path
          }
        }
        return best;
      }
    },
  };

  /* ══════════════════════════════════════════════════════════
     6. EVENTS  — wire up all interactions once
  ══════════════════════════════════════════════════════════ */
  const EVENTS = {
    init() {
      // ── Board clicks (event delegation) ──
      DOM.board.addEventListener('click', e => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        // Block clicks in AI mode when it's O's turn or game over
        if (STATE.gameOver) return;
        if (STATE.mode === 'ai' && STATE.current === 'O') return;
        const index = parseInt(cell.dataset.index, 10);
        GAME.playMove(index);
      });

      // ── Mode buttons ──
      DOM.btnPvP.addEventListener('click', () => {
        STATE.mode = 'pvp';
        RENDER.modeButtons();
        RENDER.playerNames();
        GAME.newGame();
      });

      DOM.btnAI.addEventListener('click', () => {
        STATE.mode = 'ai';
        RENDER.modeButtons();
        RENDER.playerNames();
        GAME.newGame();
      });

      // ── Restart / New Game ──
      DOM.btnRestart.addEventListener('click', () => GAME.newGame());
      DOM.overlayBtn.addEventListener('click',  () => GAME.newGame());

      // ── Reset Scores ──
      DOM.btnResetScore.addEventListener('click', () => {
        STATE.scores = { X: 0, O: 0, draw: 0 };
        RENDER.scores();
        GAME.newGame();
      });

      // ── Theme Toggle ──
      DOM.themeToggle.addEventListener('click', () => {
        const isDark = DOM.html.dataset.theme === 'dark';
        DOM.html.dataset.theme   = isDark ? 'light' : 'dark';
        DOM.themeIcon.textContent = isDark ? '☾' : '☀';
      });

      // ── Keyboard: Escape closes overlay ──
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !DOM.overlay.hidden) GAME.newGame();
      });
    },
  };

  /* ══════════════════════════════════════════════════════════
     7. BOOTSTRAP  — start the app
  ══════════════════════════════════════════════════════════ */
  function bootstrap() {
    EVENTS.init();
    RENDER.playerNames();
    RENDER.modeButtons();
    RENDER.board();
    RENDER.activeScoreCard();
    RENDER.scores();
    RENDER.status("Player X's Turn", 'X');
  }

  bootstrap();

})(); // ← end IIFE


