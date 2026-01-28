# Fulcrum Color Scheme

This document describes the complete color palette used in the Fulcrum project.

## Design Philosophy

Fulcrum uses a **pure black/white theme with purple accents**, defined using the OKLCH color space for perceptually uniform colors. The design features:

- High contrast monochrome foundation (pure black `oklch(0 0 0)` and white `oklch(1 0 0)`)
- Purple accent color as the primary brand color
- Subtle red/orange tones for destructive actions and warnings
- Film grain texture overlay for visual interest
- Both light and dark modes with semantic color tokens

## Color Format

All colors are defined in the **OKLCH color space** with the format:
```css
oklch(lightness chroma hue)
```

Where:
- **Lightness**: 0-1 (0 = black, 1 = white)
- **Chroma**: 0-0.4 (saturation intensity)
- **Hue**: 0-360 (color angle)

## Core Theme Colors

### Light Mode

| Token | Value | Description |
|-------|-------|-------------|
| `--background` | `oklch(1.0000 0 0)` | Pure white background |
| `--foreground` | `oklch(0.0000 0 0)` | Pure black text |
| `--card` | `oklch(0.9850 0 0)` | Light gray card background |
| `--card-foreground` | `oklch(0.0000 0 0)` | Black card text |
| `--primary` | `oklch(0.0000 0 0)` | Black primary color |
| `--primary-foreground` | `oklch(1.0000 0 0)` | White on primary |
| `--secondary` | `oklch(0.9600 0 0)` | Light gray secondary |
| `--secondary-foreground` | `oklch(0.0000 0 0)` | Black secondary text |
| `--muted` | `oklch(0.9400 0 0)` | Muted background |
| `--muted-foreground` | `oklch(0.4000 0 0)` | Medium gray muted text |
| `--accent` | `oklch(0.4800 0.2200 260.0000)` | **Purple accent** |
| `--accent-foreground` | `oklch(1.0000 0 0)` | White on accent |
| `--destructive` | `oklch(0.5800 0.2600 25.0000)` | Red/orange for destructive |
| `--destructive-foreground` | `oklch(1.0000 0 0)` | White on destructive |
| `--border` | `oklch(0.8800 0 0)` | Light gray border |
| `--input` | `oklch(0.9200 0 0)` | Light gray input background |
| `--ring` | `oklch(0.4800 0.2200 260.0000)` | Purple focus ring |

### Dark Mode

| Token | Value | Description |
|-------|-------|-------------|
| `--background` | `oklch(0.0000 0 0)` | Pure black background |
| `--foreground` | `oklch(1.0000 0 0)` | Pure white text |
| `--card` | `oklch(0.1400 0 0)` | Dark gray card background |
| `--card-foreground` | `oklch(1.0000 0 0)` | White card text |
| `--primary` | `oklch(1.0000 0 0)` | White primary color |
| `--primary-foreground` | `oklch(0.0000 0 0)` | Black on primary |
| `--secondary` | `oklch(0.1800 0 0)` | Dark gray secondary |
| `--secondary-foreground` | `oklch(1.0000 0 0)` | White secondary text |
| `--muted` | `oklch(0.2000 0 0)` | Muted background |
| `--muted-foreground` | `oklch(0.6000 0 0)` | Medium gray muted text |
| `--accent` | `oklch(0.5500 0.2300 260.0000)` | **Brighter purple accent** |
| `--accent-foreground` | `oklch(1.0000 0 0)` | White on accent |
| `--destructive` | `oklch(0.6000 0.2700 25.0000)` | Brighter red/orange |
| `--destructive-foreground` | `oklch(1.0000 0 0)` | White on destructive |
| `--border` | `oklch(0.2800 0 0)` | Dark gray border |
| `--input` | `oklch(0.2200 0 0)` | Dark gray input background |
| `--ring` | `oklch(0.5500 0.2300 260.0000)` | Purple focus ring |

## Brand Colors

### Primary Accent - Purple
- Light: `oklch(0.4800 0.2200 260.0000)` - Deep purple
- Dark: `oklch(0.5500 0.2300 260.0000)` - Brighter purple
- Hue 260° in OKLCH space

Used for:
- Interactive elements (buttons, links)
- Focus states and rings
- Scrollbars
- Charts (primary chart color)
- Sidebar accents

### Destructive - Red/Orange
- Light: `oklch(0.5800 0.2600 25.0000)` - Warm red
- Dark: `oklch(0.6000 0.2700 25.0000)` - Brighter warm red
- Hue 25° in OKLCH space

Used for:
- Delete/destructive actions
- Error states
- Canceled status

### Warning - Orange/Yellow
- Light: `oklch(0.6500 0.2200 30.0000)`
- Dark: `oklch(0.6800 0.2300 30.0000)`
- Hue 30° in OKLCH space

## Chart Colors

The project includes a 5-color chart palette:

1. **Chart 1** (Purple): Light `oklch(0.4800 0.2200 260)`, Dark `oklch(0.5500 0.2300 260)`
2. **Chart 2** (Red): Light `oklch(0.5800 0.2600 25)`, Dark `oklch(0.6000 0.2700 25)`
3. **Chart 3** (Magenta): Light `oklch(0.4200 0.1800 300)`, Dark `oklch(0.4800 0.2000 300)`
4. **Chart 4** (Blue): Light `oklch(0.5800 0.2000 255)`, Dark `oklch(0.6500 0.2100 255)`
5. **Chart 5** (Orange): Light `oklch(0.6500 0.2200 30)`, Dark `oklch(0.6800 0.2300 30)`

## Status Colors

Task status indicators use semantic colors:

| Status | Light | Dark | Description |
|--------|-------|------|-------------|
| Todo | `oklch(0.6000 0 0)` | `oklch(0.4000 0 0)` | Gray |
| In Progress | `oklch(0.5500 0.2300 260)` | `oklch(0.6500 0.2100 260)` | Purple |
| In Review | `oklch(0.6000 0.2200 30)` | Inherits from light | Orange |
| Done | `oklch(0.4800 0.2200 260)` | Inherits from light | Purple |
| Canceled | `oklch(0.5800 0.2600 25)` | Inherits from light | Red |

Note: Status colors for In Review, Done, and Canceled are only explicitly defined in light mode. Dark mode inherits these values as they remain visible on dark backgrounds.

## Sidebar Colors

The sidebar has its own dedicated color tokens:

| Token | Light | Dark |
|-------|-------|------|
| `--sidebar` | `oklch(0 0 0)` | `oklch(0 0 0)` |
| `--sidebar-foreground` | `oklch(1 0 0)` | `oklch(1 0 0)` |
| `--sidebar-accent` | `oklch(0.4800 0.2200 260)` | `oklch(0.5500 0.2300 260)` |
| `--sidebar-accent-foreground` | `oklch(1.0000 0 0)` | `oklch(1.0000 0 0)` |
| `--sidebar-border` | `oklch(0.2000 0 0)` | `oklch(0.2400 0 0)` |

## Diff Viewer Colors

For code diff visualization with high contrast:

### Light Mode
- Add background: `oklch(0.95 0.05 145)` - Light green
- Add foreground: `oklch(0.35 0.15 145)` - Dark green
- Remove background: `oklch(0.95 0.05 25)` - Light red
- Remove foreground: `oklch(0.45 0.20 25)` - Dark red

### Dark Mode
- Add background: `oklch(0.25 0.08 145)` - Dark green
- Add foreground: `oklch(0.75 0.15 145)` - Light green
- Remove background: `oklch(0.25 0.08 25)` - Dark red
- Remove foreground: `oklch(0.75 0.18 25)` - Light red

## Terminal Colors

Terminal emulator uses xterm.js with colors derived from theme:

### Light Terminal Theme
- Background: `#f8f8f8`
- Foreground: `#000000`
- Accent colors: Mix of purple accent and red destructive
- Muted colors: Gray tones

### Dark Terminal Theme
- Background: `#232323`
- Foreground: `#e4e4e7`
- Standard ANSI colors: Red, Green, Yellow, Blue, Magenta, Cyan
- Bright variants available

## Code Syntax Highlighting

Markdown editor uses syntax highlighting with contrasting colors:

### Light Mode
- Comments: `oklch(0.50 0 0)` - Medium gray
- Keywords: `oklch(0.45 0.2 320)` - Magenta/pink
- Strings: `oklch(0.40 0.15 145)` - Green
- Functions: `oklch(0.45 0.18 260)` - Purple
- Numbers: `oklch(0.45 0.15 280)` - Blue-violet
- Properties: `oklch(0.45 0.18 25)` - Red

### Dark Mode
- Comments: `oklch(0.55 0 0)` - Light gray
- Keywords: `oklch(0.72 0.2 320)` - Bright magenta
- Strings: `oklch(0.72 0.15 145)` - Bright green
- Functions: `oklch(0.72 0.18 260)` - Bright purple
- Numbers: `oklch(0.70 0.15 280)` - Bright blue-violet
- Properties: `oklch(0.70 0.18 25)` - Bright red

## Visual Effects

### Film Grain Texture
- Light mode: 2.5% opacity
- Dark mode: 4% opacity
- Uses SVG noise filter for brushed aluminum effect

### Shadows
Multiple shadow levels with increasing blur and opacity:
- `--shadow-2xs` through `--shadow-2xl`
- Light mode: Black with 5-28% opacity
- Dark mode: Black with 40-80% opacity

### Gradients
- `--gradient-subtle`: From accent (purple) to destructive (red)
- `--gradient-card`: Card to background
- `--gradient-glow`: Purple glow effect

## Typography

### Font Families
- Sans: IBM Plex Sans Variable
- Mono: IBM Plex Mono
- Serif: System serif stack

### Font Settings
- Tracking: `-0.01em` (tight letter spacing)
- Border radius: `0.25rem` (4px)

## Scrollbars

Custom styled scrollbars:
- Accent purple thumb (`var(--accent)`)
- Transparent track
- 8px width
- 4px border radius
- Muted gray for log viewers (30% opacity)

## Accessibility

- High contrast ratios between foreground and background
- Pure black/white foundation ensures maximum contrast
- OKLCH color space provides perceptually uniform colors
- `prefers-reduced-motion` support for animations
- Focus rings with clear purple accent color

## Usage in Code

Colors are accessed via CSS variables:

```css
/* Use semantic tokens */
background-color: var(--background);
color: var(--foreground);
border-color: var(--border);
```

```jsx
/* Use with Tailwind */
<div className="bg-background text-foreground border-border">
```

All color tokens are automatically mapped to Tailwind utilities via the `@theme inline` directive in `frontend/index.css`.
