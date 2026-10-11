# Music Folder

This folder contains the music files for the Sick Of It game.

## Adding Music Files

1. Place your MP3 files in this directory
2. Update the playlist in `/blog/music.html`:

```javascript
const playlist = [
  { title: 'Track Name', artist: 'Artist Name', file: '../music/your-track.mp3' }
];
```

## Supported Audio Formats

- MP3 (audio/mpeg)
- WAV (audio/wav)
- OGG (audio/ogg)
- M4A (audio/mp4)

## NGINX Configuration

Audio files are served with:
- MIME type: `audio/mpeg` (for MP3)
- Cache-Control: Long-term caching (1 year)
- CORS enabled
- Range requests supported (for seeking)

## Example

```javascript
const playlist = [
  { title: 'Main Theme', artist: 'Composer', file: '../music/main-theme.mp3' },
  { title: 'Battle Music', artist: 'Composer', file: '../music/battle.mp3' },
  { title: 'Victory Theme', artist: 'Composer', file: '../music/victory.mp3' }
];
```
