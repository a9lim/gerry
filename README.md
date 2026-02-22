# Redistricting Simulator

An interactive gerrymandering simulation that lets you paint congressional districts on a hex-tile map and observe how boundary placement affects electoral outcomes in real time.

## Features

- **Interactive Map Painting** — Click to create districts, drag to grow them, right-click to erase
- **Zoom & Pan** — Scroll wheel to zoom, middle-click drag to pan
- **Undo/Redo** — Ctrl+Z / Ctrl+Y with up to 50 levels of history
- **Dark/Light Mode** — Toggle between themes with adaptive outline colors
- **Efficiency Gap** — Real-world gerrymandering metric based on wasted vote analysis (*Gill v. Whitford*)
- **Live Metrics** — Population deviation, compactness, contiguity, margin of victory, minority-majority status
- **Population Cap** — Districts cannot exceed 110% of target population
- **Organic Map Shape** — Irregular, state-like boundary generated with trigonometric noise

## Getting Started

Serve the project with any static HTTP server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

Then open `http://localhost:8000` in your browser.

## Tech Stack

- Vanilla HTML, CSS, JavaScript
- SVG rendering for hex grid and district borders
- No build tools or dependencies required

## License

MIT
