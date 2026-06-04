const fs = require("fs");
const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

const COLS = 10, ROWS = 20;
const PIECES = {
  I: { shape: [[1,1,1,1]], color: "00bcd4" },
  O: { shape: [[1,1],[1,1]], color: "ffeb3b" },
  T: { shape: [[0,1,0],[1,1,1]], color: "9c27b0" },
  S: { shape: [[0,1,1],[1,1,0]], color: "4caf50" },
  Z: { shape: [[1,1,0],[0,1,1]], color: "f44336" },
  J: { shape: [[1,0,0],[1,1,1]], color: "2196f3" },
  L: { shape: [[0,0,1],[1,1,1]], color: "ff9800" },
};
const PIECE_KEYS = Object.keys(PIECES);

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece() {
  const key = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
  return { type: key, shape: PIECES[key].shape, color: PIECES[key].color, x: 3, y: 0 };
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync("game-state.json", "utf8"));
  } catch {
    const piece = randomPiece();
    return { board: emptyBoard(), piece, score: 0, gameOver: false, next: randomPiece() };
  }
}

function saveState(state) {
  fs.writeFileSync("game-state.json", JSON.stringify(state));
}

function collides(board, piece, dx = 0, dy = 0) {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const nx = piece.x + c + dx, ny = piece.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotate(shape) {
  return shape[0].map((_, i) => shape.map(row => row[i]).reverse());
}

function lock(board, piece) {
  const b = board.map(r => [...r]);
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c] && piece.y + r >= 0)
        b[piece.y + r][piece.x + c] = piece.color;
  return b;
}

function clearLines(board) {
  const kept = board.filter(row => row.some(c => !c));
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { board: [...empty, ...kept], lines: cleared };
}

function applyMove(state, move) {
  if (state.gameOver) return { ...state, message: "Game over! Comment `reset` to restart." };
  let { board, piece, score, next } = state;

  if (move === "reset") {
    return { board: emptyBoard(), piece: randomPiece(), score: 0, gameOver: false, next: randomPiece() };
  }
  if (move === "left" && !collides(board, piece, -1, 0)) piece = { ...piece, x: piece.x - 1 };
  else if (move === "right" && !collides(board, piece, 1, 0)) piece = { ...piece, x: piece.x + 1 };
  else if (move === "rotate") {
    const rotated = { ...piece, shape: rotate(piece.shape) };
    if (!collides(board, rotated)) piece = rotated;
  } else if (move === "down" || move === "drop") {
    if (move === "drop") while (!collides(board, piece, 0, 1)) piece = { ...piece, y: piece.y + 1 };
    if (!collides(board, piece, 0, 1)) { piece = { ...piece, y: piece.y + 1 }; }
    else {
      board = lock(board, piece);
      const { board: newBoard, lines } = clearLines(board);
      board = newBoard;
      score += [0, 100, 300, 500, 800][lines] || 0;
      piece = next;
      next = randomPiece();
      if (collides(board, piece)) return { board, piece, score, gameOver: true, next };
    }
  }
  return { board, piece, score, gameOver: false, next };
}

function renderSVG(state) {
  const CW = 24, CH = 24, PAD = 10;
  const W = COLS * CW + PAD * 2 + 120;
  const H = ROWS * CH + PAD * 2 + 60;
  const { board, piece, score, gameOver, next } = state;

  const display = board.map(r => [...r]);
  if (!gameOver) {
    piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (v && piece.y + r >= 0) display[piece.y + r][piece.x + c] = piece.color;
    }));
  }

  let cells = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = display[r][c] ? `#${display[r][c]}` : "#1a1a2e";
      const stroke = display[r][c] ? "#ffffff22" : "#ffffff11";
      cells += `<rect x="${PAD + c * CW}" y="${PAD + 40 + r * CH}" width="${CW - 1}" height="${CH - 1}" fill="${color}" stroke="${stroke}" rx="2"/>`;
    }
  }

  // Next piece preview
  let nextCells = "";
  next.shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) nextCells += `<rect x="${COLS * CW + PAD + 20 + c * 20}" y="${PAD + 100 + r * 20}" width="19" height="19" fill="#${next.color}" rx="2"/>`;
  }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><style>text { font-family: monospace; fill: #eee; }</style></defs>
  <rect width="${W}" height="${H}" fill="#0d0d1a" rx="12"/>
  <text x="${PAD}" y="30" font-size="20" font-weight="bold">🧱 Tetris</text>
  <rect x="${PAD - 1}" y="${PAD + 39}" width="${COLS * CW + 2}" height="${ROWS * CH + 2}" fill="none" stroke="#ffffff33" stroke-width="1"/>
  ${cells}
  <text x="${COLS * CW + PAD + 15}" y="${PAD + 50}" font-size="13">SCORE</text>
  <text x="${COLS * CW + PAD + 15}" y="${PAD + 70}" font-size="18" font-weight="bold">${score}</text>
  <text x="${COLS * CW + PAD + 15}" y="${PAD + 95}" font-size="13">NEXT</text>
  ${nextCells}
  ${gameOver ? `<rect x="${PAD}" y="${PAD + 39}" width="${COLS * CW}" height="${ROWS * CH}" fill="#00000099"/>
  <text x="${PAD + COLS * CW / 2}" y="${PAD + 39 + ROWS * CH / 2}" font-size="20" text-anchor="middle" fill="#f44336">GAME OVER</text>` : ""}
  <text x="${PAD}" y="${H - 10}" font-size="11" fill="#ffffff55">Comment: left · right · rotate · drop · reset</text>
</svg>`;
}

async function ensureIssue() {
  const issues = await octokit.issues.listForRepo({ owner, repo, state: "open" });
  let issue = issues.data.find(i => i.title === "🎮 Play Tetris!");
  if (!issue) {
    const res = await octokit.issues.create({
      owner, repo,
      title: "🎮 Play Tetris!",
      body: "Comment `left`, `right`, `rotate`, `drop`, or `reset` to play!\n\nEach comment = one move.",
    });
    issue = res.data;
  }
  return issue.number;
}

async function main() {
  const comment = (process.env.COMMENT_BODY || "").toLowerCase();
  const validMoves = ["left", "right", "rotate", "drop", "down", "reset"];
  const moves = validMoves.filter(m => comment.includes(m));
  const user = process.env.COMMENT_USER || "player";

  let state = loadState();
  if (moves.length > 0) {
    for (const move of moves) {
      state = applyMove(state, move);
      if (state.gameOver) break;
    }
  }

  saveState(state);

  const svg = renderSVG(state);
  fs.writeFileSync("tetris.svg", svg);

  // Update README
  let readme = fs.readFileSync("README.md", "utf8");
  const marker = "<!-- TETRIS_START -->", endMarker = "<!-- TETRIS_END -->";
  // Cache-bust the SVG URL so GitHub doesn't serve a stale cached version
  const cacheBust = Date.now();
  const block = `${marker}\n![Tetris](tetris.svg?t=${cacheBust})\n\n**Score: ${state.score}** ${state.gameOver ? "💀 Game Over! Comment \`reset\` to restart." : ""}\n\n> 🕹️ **[Play here!](../../issues)** — Comment \`left\`, \`right\`, \`rotate\`, \`drop\`, or \`reset\` (combine moves like \`left, drop\`)\n${endMarker}`;
  if (readme.includes(marker)) {
    readme = readme.replace(new RegExp(`${marker}[\\s\\S]*?${endMarker}`), block);
  } else {
    readme += `\n\n${block}`;
  }
  fs.writeFileSync("README.md", readme);

  if (moves.length > 0 && process.env.ISSUE_NUMBER) {
    await octokit.reactions.createForIssueComment({
      owner, repo,
      comment_id: parseInt(process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH).comment.id : 0),
      content: "+1",
    }).catch(() => {});
  }

  await ensureIssue();
}

main().catch(console.error);