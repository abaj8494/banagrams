// ───────────────────────────── Trie ─────────────────────────────
class TrieNode { children = new Map(); end = false; }
class Trie {
  constructor() { this.root = new TrieNode(); }
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
    wordList = await (await fetch('words.json')).json();
  } catch {
    wordList = ['apple','banana','orange','pear','grape','peel','split','dump','swap'];
  }
  wordList.forEach(w => trie.insert(w));
}
await loadWords();

// ───────────────────────────── Canvas setup ─────────────────────────────
const GRID_W = 21, GRID_H = 21, CELL = 28;
const canvas = document.getElementById('board');
canvas.width = GRID_W * CELL; canvas.height = GRID_H * CELL;
const ctx = canvas.getContext('2d');

function createBoard() { return Array.from({length: GRID_H}, () => Array(GRID_W).fill('')); }
function drawBoard(board) {
  ctx.fillStyle = '#222'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = 'var(--grid)'; ctx.lineWidth = 1;
  ctx.font = `bold ${CELL*0.6}px Courier`; ctx.textAlign = 'center'; ctx.textBaseline='middle';
  for (let r=0;r<GRID_H;r++) for(let c=0;c<GRID_W;c++){
    const x=c*CELL,y=r*CELL; ctx.strokeRect(x,y,CELL,CELL);
    const ch=board[r][c];
    if(ch){ ctx.fillStyle='var(--tile)'; ctx.fillRect(x+1,y+1,CELL-2,CELL-2);
      ctx.fillStyle='var(--tile-text)'; ctx.fillText(ch.toUpperCase(),x+CELL/2,y+CELL/2+1);
    }
  }
}

// ───────────────────────────── Hand (stack) ─────────────────────────────
const handStack = []; // array acts as stack (push/pop)

function countsFromStack() {
  const m=new Map();
  for(const ch of handStack) m.set(ch,(m.get(ch)||0)+1);
  return m;
}

function pushLetter(ch){ handStack.push(ch); renderHand(); }
function popLetter(ch){
  // remove last occurrence (LIFO)
  for(let i=handStack.length-1;i>=0;i--){ if(handStack[i]===ch){ handStack.splice(i,1); break; } }
  renderHand();
}

function renderHand(){
  const panel=document.getElementById('hand-panel');
  panel.innerHTML='';
  const seen=new Set();
  // iterate stack top to bottom (LIFO) to honour order
  for(let i=handStack.length-1;i>=0;i--){ const ch=handStack[i]; if(seen.has(ch)) continue; seen.add(ch);
    const count=handStack.filter(x=>x===ch).length;
    const div=document.createElement('div'); div.className='tile'; div.textContent=ch.toUpperCase(); if(count>1) div.dataset.count=count;
    div.addEventListener('click',()=>popLetter(ch));
    panel.appendChild(div);
  }
}

// alphabet buttons
const alpha=document.getElementById('alphabet');
'abcdefghijklmnopqrstuvwxyz'.split('').forEach(ch=>{
  const btn=document.createElement('button'); btn.textContent=ch.toUpperCase(); btn.onclick=()=>pushLetter(ch); alpha.appendChild(btn);
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
function canPlace(board, word, row, col, vert) {
  if (vert) {
    if (row + word.length > GRID_H) return false;
    for (let i = 0; i < word.length; i++) {
      const ch = board[row + i][col];
      if (ch && ch !== word[i]) return false;
    }
  } else {
    if (col + word.length > GRID_W) return false;
    for (let i = 0; i < word.length; i++) {
      const ch = board[row][col + i];
      if (ch && ch !== word[i]) return false;
    }
  }
  return true;
}
function placeWord(board, word, row, col, vert) {
  if (vert)
    for (let i = 0; i < word.length; i++) board[row + i][col] = word[i];
  else
    for (let i = 0; i < word.length; i++) board[row][col + i] = word[i];
}
function deepCopyBoard(b) {
  return b.map(r => [...r]);
}

// ───── main solve routine ─────
function solve() {
  const bag = countsFromStack();
  if (handStack.length === 0) {
    console.warn('No letters staged');
    drawBoard(createBoard());
    return;
  }

  // candidate word list, longest first
  const candidates = wordList
    .filter(w => w.length >= 2 && canMake(w, bag))
    .sort((a, b) => b.length - a.length);

  console.clear();
  console.log('Starting solve with bag', Object.fromEntries(bag));

  const blankBoard = createBoard();
  const centreRow = Math.floor(GRID_H / 2);
  const centreCol = Math.floor(GRID_W / 2);

  let foundPerfect = false;
  let bestBoard = deepCopyBoard(blankBoard);
  let bestLeft  = handStack.length;          // start with everything left over

  // Depth-first back-tracking
  function backtrack(currBoard, currBag, depth) {
    const remaining = [...currBag.values()].reduce((a, b) => a + b, 0);

    // record “best so far”
    if (remaining < bestLeft) {
      bestLeft  = remaining;
      bestBoard = deepCopyBoard(currBoard);
      console.log(' '.repeat(depth * 2) + `★ new best (${bestLeft} left)`);
      if (bestLeft === 0) foundPerfect = true; // early exit allowed later
    }
    if (foundPerfect) return;                 // don’t waste time once perfect

    // choose next longest word that still fits in the bag
    for (const word of candidates) {
      if (!canMake(word, currBag)) continue;

      // try every anchor / orientation
      for (let r = 0; r < GRID_H; r++) {
        for (let c = 0; c < GRID_W; c++) {
          for (const vert of [false, true]) {
            if (!canPlace(currBoard, word, r, c, vert)) continue;

            const nextBoard = deepCopyBoard(currBoard);
            placeWord(nextBoard, word, r, c, vert);

            const nextBag = new Map(currBag);
            for (const ch of word) nextBag.set(ch, nextBag.get(ch) - 1);

            backtrack(nextBoard, nextBag, depth + 1);
            if (foundPerfect) return;
          }
        }
      }
    }
  }

  // explore *every* possible seed word
  for (const seed of candidates) {
    if (!canMake(seed, bag)) continue;

    const startCol = centreCol - Math.floor(seed.length / 2);
    if (startCol < 0 || startCol + seed.length > GRID_W) continue;

    const seedBoard = deepCopyBoard(blankBoard);
    placeWord(seedBoard, seed, centreRow, startCol, false);

    const seedBag = new Map(bag);
    for (const ch of seed) seedBag.set(ch, seedBag.get(ch) - 1);

    console.log(`Seeding with "${seed}"`);
    backtrack(seedBoard, seedBag, 0);
    if (foundPerfect) break;
  }

  // ───── final drawing ─────
  drawBoard(bestBoard);
  if (bestLeft === 0) {
    console.log('%cSolved perfectly!', 'color:lime;font-weight:bold');
  } else {
    console.warn(`No perfect solution – ${bestLeft} tile(s) left in hand`);
  }
}

document.getElementById('solve').onclick = solve;
