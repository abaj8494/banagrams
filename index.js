// ───────────────────────────── Trie ─────────────────────────────
class TrieNode {
  children = new Map();
  end = false;
}
class Trie {
  constructor() {
    this.root = new TrieNode();
  }
  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    node.end = true;
  }
  has(word) {
    let node = this.root;
    for (const ch of word) {
      node = node.children.get(ch);
      if (!node) return false;
    }
    return node.end;
  }
}

// ───────────────────────────── Word list ─────────────────────────────
const trie = new Trie();
let wordList = [];
async function loadWords() {
  try {
    wordList = await (await fetch("words.json")).json();
  } catch {
    wordList = [
      "apple",
      "banana",
      "orange",
      "pear",
      "grape",
      "peel",
      "split",
      "dump",
      "swap",
    ];
  }
  wordList.forEach((w) => trie.insert(w));
}
await loadWords();

// ───────────────────────────── Canvas setup ─────────────────────────────
const GRID_W = 21;
const GRID_H = 21;
// Adjust cell size based on screen width for mobile responsiveness
const CELL = window.innerWidth < 768 ? 17 : 28;
const canvas = document.getElementById("board");
canvas.width = GRID_W * CELL;
canvas.height = GRID_H * CELL;
const ctx = canvas.getContext("2d");

function createBoard() {
  return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(""));
}
function drawBoard(board) {
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "var(--grid)";
  ctx.lineWidth = 1;
  ctx.font = `bold ${CELL * 0.6}px Courier`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Debug log to see if the board contains any letters
  console.log(
    "Drawing board with data:",
    board.flat().filter((ch) => ch !== "").length,
    "letters placed",
  );

  for (let r = 0; r < GRID_H; r++)
    for (let c = 0; c < GRID_W; c++) {
      const x = c * CELL,
        y = r * CELL;
      ctx.strokeRect(x, y, CELL, CELL);
      const ch = board[r][c];
      if (ch) {
        // Debug individual cell
        console.log(`Drawing "${ch}" at [${r},${c}]`);
        // Changed from #ccc (light grey) to #fff (white)
        ctx.fillStyle = "#fff";
        ctx.fillText(ch.toUpperCase(), x + CELL / 2, y + CELL / 2 + 1);
      }
    }
}

/* NEW – paint an empty grid immediately */
drawBoard(createBoard());

// ───────────────────────────── Hand (stack) ─────────────────────────────
const handStack = []; // array acts as stack (push/pop)

function countsFromStack() {
  const m = new Map();
  for (const ch of handStack) m.set(ch, (m.get(ch) || 0) + 1);
  return m;
}

function pushLetter(ch) {
  handStack.push(ch);
  renderHand();
}
function popLetter(ch) {
  // remove last occurrence (LIFO)
  for (let i = handStack.length - 1; i >= 0; i--) {
    if (handStack[i] === ch) {
      handStack.splice(i, 1);
      break;
    }
  }
  renderHand();
}

function renderHand() {
  const panel = document.getElementById("hand-panel");
  panel.innerHTML = "";
  const seen = new Set();
  // iterate stack top to bottom (LIFO) to honour order
  for (let i = handStack.length - 1; i >= 0; i--) {
    const ch = handStack[i];
    if (seen.has(ch)) continue;
    seen.add(ch);
    const count = handStack.filter((x) => x === ch).length;
    const div = document.createElement("div");
    div.className = "tile";
    div.textContent = ch.toUpperCase();
    if (count > 1) div.dataset.count = count;
    div.addEventListener("click", () => popLetter(ch));
    panel.appendChild(div);
  }
}

// alphabet buttons
const alpha = document.getElementById("alphabet");
"abcdefghijklmnopqrstuvwxyz".split("").forEach((ch) => {
  const btn = document.createElement("button");
  btn.textContent = ch.toUpperCase();
  btn.onclick = () => pushLetter(ch);
  alpha.appendChild(btn);
});

// ───── solver helpers ─────
function canMake(word, bag) {
  const need = new Map();
  for (const ch of word) {
    need.set(ch, (need.get(ch) || 0) + 1);
    if (need.get(ch) > (bag.get(ch) || 0)) return false;
  }
  return true;
}
// quick utility --------------------------------------------------------------
function deepCopyBoard(b) {
  return b.map((r) => [...r]);
}

function needFromBag(word, board, row, col, vert) {
  // How many brand-new tiles would we have to pay from the bag?
  const need = new Map();
  for (let i = 0; i < word.length; i++) {
    const r = vert ? row + i : row;
    const c = vert ? col : col + i;
    const existing = board[r][c];
    if (existing) continue;
    const ch = word[i];
    need.set(ch, (need.get(ch) || 0) + 1);
  }
  return need;
}

function bagHas(need, bag) {
  for (const [ch, n] of need) if ((bag.get(ch) || 0) < n) return false;
  return true;
}

// placement legality ---------------------------------------------------------
function canPlace(board, word, row, col, vert, mustIntersect) {
  let intersects = false;

  // 1. bounds
  if (vert && row + word.length > GRID_H) return false;
  if (!vert && col + word.length > GRID_W) return false;
  // Add additional bounds check to prevent negative indices
  if (row < 0 || col < 0) return false;

  for (let i = 0; i < word.length; i++) {
    const r = vert ? row + i : row;
    const c = vert ? col : col + i;
    
    // Extra safety check for bounds
    if (r < 0 || r >= GRID_H || c < 0 || c >= GRID_W) return false;
    
    const ch = word[i];
    const existing = board[r][c];

    // 2. conflicting letter
    if (existing && existing !== ch) return false;
    if (existing) intersects = true;

    // 3. "kissing" check — cells immediately left/right or up/down
    //    (only for newly placed squares)
    if (!existing) {
      if (!vert) { 
        // horizontal word ⇒ check above / below
        if ((r > 0 && board[r - 1][c]) || (r < GRID_H - 1 && board[r + 1][c]))
          return false;
      } else { 
        // vertical word ⇒ check left / right
        if ((c > 0 && board[r][c - 1]) || (c < GRID_W - 1 && board[r][c + 1]))
          return false;
      }
    }
  }

  // 4. ensure empty square before & after the word (so we don't build
  // one long illegal word by butt-joining two)
  const preR = vert ? row - 1 : row;
  const preC = vert ? col : col - 1;
  const postR = vert ? row + word.length : row;
  const postC = vert ? col : col + word.length;
  
  // Add bounds checks before accessing the board
  if (
    preR >= 0 && 
    preC >= 0 && 
    preR < GRID_H && 
    preC < GRID_W && 
    board[preR][preC]
  ) return false;
  
  if (postR < GRID_H && postC < GRID_W && board[postR][postC]) return false;

  return intersects || !mustIntersect;
}

function placeWord(board, word, row, col, vert) {
  for (let i = 0; i < word.length; i++) {
    const r = vert ? row + i : row;
    const c = vert ? col : col + i;
    board[r][c] = word[i];
  }
}

// pre-compute an index of words by letter → positions of that letter
const letterIndex = {};
"abcdefghijklmnopqrstuvwxyz".split("").forEach((l) => (letterIndex[l] = []));
for (const w of wordList) {
  // Fix: normalize case
  w.toLowerCase()
    .split("")
    .forEach((ch, i) => letterIndex[ch]?.push([w, i]));
}

// ---------------------------------------------------------------------------
// configuration knobs
// ---------------------------------------------------------------------------
const TEMPERATURE = 0.35;
const MAX_STATES = 1_200_000;

// Fisher-Yates in-place shuffle  -------------------------------------------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// main solve routine  (iterative DFS + temperature-controlled exploration)
// ---------------------------------------------------------------------------
function solve() {
  // -------- prepare rack / dictionary -------------------------------------
  const bag = countsFromStack();
  if (handStack.length === 0) {
    console.warn("No letters staged");
    drawBoard(createBoard());
    return;
  }
  console.clear();
  console.log("Starting solve with bag", Object.fromEntries(bag));

  const candidates = wordList
    .filter((w) => canMake(w, bag))
    .sort((a, b) => b.length - a.length);

  const blank = createBoard();
  const centreR = (GRID_H / 2) | 0,
    centreC = (GRID_W / 2) | 0;

  let bestBoard = deepCopyBoard(blank);
  let bestLeft = handStack.length;
  let solvedPerfect = false;

  // -------------------------------------------------------------------------
  // helper to push the *next* search state
  // -------------------------------------------------------------------------
  const seen = new Set();
  function pushState(stack, board, bagLeft, anchors, depth) {
    const key = board.flat().join("") + "|" + [...bagLeft].flat().join("");
    if (seen.has(key)) return;
    seen.add(key);
    stack.push({ board, bag: bagLeft, anchors, depth });
  }

  // -------------------------------------------------------------------------
  // temperature-weighted ordering helpers
  // -------------------------------------------------------------------------
  function maybeShuffle(arr) {
    if (TEMPERATURE === 0) return arr;
    // with prob. =T shuffle; otherwise leave as is (heuristic order)
    if (Math.random() < TEMPERATURE) return shuffle(arr.slice());
    return arr;
  }

  // -------------------------------------------------------------------------
  // seed-loop: try every viable centre word
  // -------------------------------------------------------------------------
  for (const seed of candidates) {
    const startCol = centreC - (seed.length >> 1);
    if (startCol < 0 || startCol + seed.length > GRID_W) continue;

    const bag0 = new Map(bag);
    if (!bagHas(needFromBag(seed, blank, centreR, startCol, false), bag0))
      continue;

    // Pay letters & lay the seed word
    seed.split("").forEach((ch) => bag0.set(ch, bag0.get(ch) - 1));
    const board0 = deepCopyBoard(blank);
    placeWord(board0, seed, centreR, startCol, false);

    console.log(`Seeding with "${seed}"`);

    // ---- iterative DFS stack ---------------------------------------------
    const stack = [];
    pushState(
      stack,
      board0,
      bag0,
      seed.split("").map((_, i) => [centreR, startCol + i]),
      0,
    );

    let statesExplored = 0;

    function tilesNeeded(word, board, row, col, vert) {
      // out–of–bounds ⇒ invalid placement ⇒ score −1
      if (row < 0 || col < 0) return -1;
      if (vert) {
        // vertical word
        if (row + word.length > GRID_H) return -1;
        if (col >= GRID_W) return -1;
      } else {
        // horizontal word
        if (col + word.length > GRID_W) return -1;
        if (row >= GRID_H) return -1;
      }

      let need = 0;
      for (let i = 0; i < word.length; i++) {
        const r = vert ? row + i : row;
        const c = vert ? col : col + i;
        if (!board[r][c]) need++;
      }
      return need;
    }

    while (stack.length && !solvedPerfect) {
      const { board, bag: bagLeft, anchors, depth } = stack.pop();
      statesExplored++;
      if (statesExplored > MAX_STATES) break;

      const remaining = [...bagLeft.values()].reduce((a, b) => a + b, 0);

      // ---- best solution bookkeeping -------------------------------------
      if (remaining < bestLeft) {
        bestLeft = remaining;
        bestBoard = deepCopyBoard(board);
        console.log(" ".repeat(depth * 2) + `★ new best – ${bestLeft} left`);
        if (bestLeft === 0) {
          solvedPerfect = true;
          break;
        }
      }

      // ---- anchor heuristic (MRV = fewest candidate words) ---------------
      anchors.sort((a, b) => {
        const la = letterIndex[board[a[0]][a[1]]].length;
        const lb = letterIndex[board[b[0]][b[1]]].length;
        return la - lb;
      });
      const [ar, ac] = anchors[0];
      const anchorCh = board[ar][ac];

      // ---- iterate candidate words containing anchor letter --------------
      let letterPool = letterIndex[anchorCh].slice().sort((a, b) => {
        // vertical/horizontal choice affects the count, so approximate
        const roughA = Math.max(
          tilesNeeded(a[0], board, ar - a[1], ac, true),
          tilesNeeded(a[0], board, ar, ac - a[1], false),
        );
        const roughB = Math.max(
          tilesNeeded(b[0], board, ar - b[1], ac, true),
          tilesNeeded(b[0], board, ar, ac - b[1], false),
        );
        return roughB - roughA;
      });

      letterPool = maybeShuffle(letterPool);

      for (const [word, idx] of letterPool) {
        for (const vert of maybeShuffle([false, true])) {
          const row = ar - (vert ? idx : 0);
          const col = ac - (vert ? 0 : idx);
          if (!canPlace(board, word, row, col, vert, true)) continue;

          const need = needFromBag(word, board, row, col, vert);
          if (!bagHas(need, bagLeft)) continue;

          // ---- pay tiles & prepare next state ----------------------------
          const bagNext = new Map(bagLeft);
          for (const [ch, n] of need) bagNext.set(ch, bagNext.get(ch) - n);

          const boardNext = deepCopyBoard(board);
          placeWord(boardNext, word, row, col, vert);

          // gather new anchors (intersections added this turn)
          const nextAnchors = [...anchors];
          for (let i = 0; i < word.length; i++) {
            const r = vert ? row + i : row;
            const c = vert ? col : col + i;
            if (!board[r][c]) nextAnchors.push([r, c]);
          }

          pushState(stack, boardNext, bagNext, nextAnchors, depth + 1);
        }
      }
    }

    if (solvedPerfect) break;
  }

  // -------------------------------------------------------------------------
  // draw result
  // -------------------------------------------------------------------------
  console.log("Best board solution:", bestBoard);
  console.log(
    "Letters placed on best board:",
    bestBoard.flat().filter((ch) => ch !== "").length,
  );
  // ---- if anything is left, park it starting at [0,0] for visibility ---
  if (bestLeft) {
    const stillInBag = [];
    const bagAfter = new Map(bag);
    bestBoard.flat().forEach((ch) => {
      if (ch) bagAfter.set(ch, bagAfter.get(ch) - 1);
    });
    for (const [ch, n] of bagAfter)
      for (let i = 0; i < n; i++) stillInBag.push(ch);
    let r = 0,
      c = 0;
    for (const ch of stillInBag) {
      while (bestBoard[r][c]) {
        if (++c === GRID_W) {
          c = 0;
          r++;
        }
      }
      bestBoard[r][c] = ch;
    }
  }

  drawBoard(bestBoard);
  bestLeft === 0
    ? console.log("%cSolved perfectly!", "color:lime;font-weight:bold")
    : console.warn(
        `No perfect solution – ${bestLeft} tile(s) left in hand (shown at top-left)`,
      );
}

// Make the runTest function accessible globally
function runTest(rack, expectPerfect = true) {
  handStack.length = 0;
  rack.toLowerCase().split("").forEach(pushLetter);
  solve();
  const left = handStack.length;
  console.log(
    `TEST "${rack}": ${left === 0 ? "✓ perfect" : "✗ " + left + " left"}`,
  );
  if (expectPerfect && left !== 0)
    console.warn('❌  Expected a perfect solve for "' + rack + '".');
}

// Export runTest to global scope
window.runTest = runTest;

document.getElementById("solve").onclick = solve;

// Handle window resize to adjust the canvas size
window.addEventListener("resize", () => {
  // Only redraw if there's a significant change in screen width
  const newCellSize = window.innerWidth < 768 ? 17 : 28;
  if (CELL !== newCellSize) {
    location.reload(); // Simple approach - just reload the page
  }
});

