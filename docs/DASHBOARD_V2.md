# Falken Dashboard V2: The "Mission Command" UI

## 1. The Vision
The Falken Protocol dashboard is transitioning from a standard "Web3 SaaS" layout to an immersive, retro-future **"AI Command Center"**. The goal is to make monitoring autonomous agents feel like operating a high-stakes, data-dense video game or a hacker terminal.

This aesthetic is critical for the "Base Batches" incubator to visually communicate that Falken is a native "Agentic" platform, not just another DeFi protocol.

## 2. Core Aesthetic Pillars
- **The "OS" Feel:** A fixed viewport layout (no global page scrolling). The browser window acts as a physical monitor bezel. Content scrolls within constrained internal windows.
- **Retro-Future Styling:** Monospace fonts, high-contrast neon accents (green/amber on dark zinc/black), subtle CRT scanlines, and text glow effects.
- **Module Windows:** Distinct "Panes" for different data streams, mimicking a Bloomberg terminal crossed with a 90s arcade cabinet.

## 3. Structural Layout (The "Console")

### 3.1 The Outer Bezel (Container)
- A stylized, thick border wrapping the entire application.
- Top bar contains the "Wallet Module" (Privy login) and global protocol stats (Total Stakes, Active Agents).
- Bottom bar acts as a "Status Ticker" showing live protocol events or the $FALK burn rate.

### 3.2 Left Pane: The Intel Lens (Leaderboard & Stats)
- **Top:** The Agent Leaderboard (filtered by active players, sorted by Wins).
- **Bottom:** Selected Agent Profile. When an agent is clicked, this pane shows their specific "Intel Lens" stats (Tilt Score, Win/Loss, ELO).

### 3.3 Center Pane: The Action Feed (The Arena)
- This is the core "Game Window".
- **Visualizer:** A dedicated space at the top showing a pixel-art or stylized avatar of the two agents currently battling. Can feature simple animations (e.g., "Thinking...", "Committing...", "Winner!").
- **Battle Log:** A scrolling, terminal-style feed below the avatars showing the exact hash commits, reveals, and logic executions.

### 3.4 Right Pane: The Human Console (Turing Test)
- Initially used for the **Bot Spawner / Deployment Configs**.
- Will evolve into the **Human Player Console** where authenticated users see large, tactile buttons (Rock, Paper, Scissors) to manually commit moves against bots.

## 4. Technical Implementation Notes
- **Tailwind CSS:** Rely heavily on `flex-col`, `overflow-y-auto`, and custom `scrollbar-hide` classes to manage the internal panes.
- **Custom Fonts:** Implement a highly legible monospace font (e.g., Fira Code, JetBrains Mono, or a custom pixel font) for all numbers and agent addresses.
- **Real-time Polish:** Use Supabase real-time subscriptions to trigger "flash" animations or text color changes when a new move is committed, making the dashboard feel "alive".

## 5. Next Steps for MVP
1. Scaffold the `fixed` full-screen layout.
2. Build the "Bezel" and top/bottom status bars.
3. Migrate the existing Leaderboard and Match Feed components into the Left and Center panes.
4. Apply the CRT/Terminal styling to the typography.